import { asc, eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { ensureDefaultProject } from '../../utils/project-service'
import { useDB } from '../../utils/db'
import { projects } from '../../utils/schema'
import { requireOrganizationContext } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireOrganizationContext(event)
  await ensureDefaultProject(organizationId)

  return {
    projects: await useDB()
      .select()
      .from(projects)
      .where(eq(projects.organizationId, organizationId))
      .orderBy(asc(projects.isArchived), asc(projects.createdAt))
  }
})
