import { and, asc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { useDB } from './db'
import { projects } from './schema'

export const DEFAULT_PROJECT_NAME = 'General'
export const DEFAULT_PROJECT_SLUG = 'general'

export function slugifyProjectName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function ensureDefaultProject(organizationId: string) {
  const db = useDB()
  const existing = await db.query.projects.findFirst({
    where: and(
      eq(projects.organizationId, organizationId),
      eq(projects.isArchived, false)
    ),
    orderBy: [asc(projects.createdAt)]
  })

  if (existing) return existing

  const archived = await db.query.projects.findFirst({
    where: eq(projects.organizationId, organizationId),
    orderBy: [asc(projects.createdAt)]
  })
  if (archived) {
    const [restored] = await db
      .update(projects)
      .set({ isArchived: false })
      .where(eq(projects.id, archived.id))
      .returning()
    return restored!
  }

  const [created] = await db
    .insert(projects)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      name: DEFAULT_PROJECT_NAME,
      slug: DEFAULT_PROJECT_SLUG,
      description: 'Orders that have not been assigned to a specific project.'
    })
    .onConflictDoNothing()
    .returning()

  if (created) return created

  const project = await db.query.projects.findFirst({
    where: eq(projects.organizationId, organizationId),
    orderBy: [asc(projects.createdAt)]
  })

  if (!project) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Unable to initialize a project for this organization'
    })
  }

  return project
}

export async function requireOrganizationProject(
  organizationId: string,
  projectId?: string | null,
  options: { allowArchived?: boolean } = {}
) {
  const project = projectId
    ? await useDB().query.projects.findFirst({
        where: and(
          eq(projects.id, projectId),
          eq(projects.organizationId, organizationId)
        )
      })
    : await ensureDefaultProject(organizationId)

  if (!project || (!options.allowArchived && project.isArchived)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Project not found'
    })
  }

  return project
}
