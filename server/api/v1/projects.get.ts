import { asc, eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDB } from '../../utils/db'
import { projects } from '../../utils/schema'
import { requireOrganizationApiKey } from '../../utils/api-key'

export default defineEventHandler(async (event) => {
  const organizationId = await requireOrganizationApiKey(event)
  return {
    projects: await useDB().select().from(projects)
      .where(eq(projects.organizationId, organizationId))
      .orderBy(asc(projects.isArchived), asc(projects.createdAt))
  }
})
