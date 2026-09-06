import { and, eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireOrganizationProject } from '../../utils/project-service'
import { useDB } from '../../utils/db'
import { projects } from '../../utils/schema'
import { requireOrganizationContext } from '../../utils/session'

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    isArchived: z.boolean().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'No updates provided')

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireOrganizationContext(event)
  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project id is required' })
  }

  await requireOrganizationProject(organizationId, id, { allowArchived: true })
  const parsed = updateProjectSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid project update',
      data: parsed.error.flatten().fieldErrors
    })
  }

  if (parsed.data.isArchived) {
    const activeProjects = await useDB()
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, organizationId),
          eq(projects.isArchived, false)
        )
      )
    if (activeProjects.length <= 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'An organization must have at least one active project'
      })
    }
  }

  const [project] = await useDB()
    .update(projects)
    .set(parsed.data)
    .where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)))
    .returning()

  return { project }
})
