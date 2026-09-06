import { and, eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { slugifyProjectName } from '../../utils/project-service'
import { useDB } from '../../utils/db'
import { projects } from '../../utils/schema'
import { requireOrganizationContext } from '../../utils/session'

const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(80),
  description: z.string().trim().max(500).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Choose a valid color').optional()
})

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireOrganizationContext(event)
  const parsed = createProjectSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid project',
      data: parsed.error.flatten().fieldErrors
    })
  }

  const db = useDB()
  const baseSlug = slugifyProjectName(parsed.data.name) || 'project'
  let slug = baseSlug
  let suffix = 2

  while (
    await db.query.projects.findFirst({
      where: and(
        eq(projects.organizationId, organizationId),
        eq(projects.slug, slug)
      )
    })
  ) {
    slug = `${baseSlug}-${suffix++}`
  }

  const [project] = await db
    .insert(projects)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      color: parsed.data.color
    })
    .returning()

  return { project }
})
