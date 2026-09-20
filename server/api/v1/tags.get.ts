import { asc, eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDB } from '../../utils/db'
import { tags } from '../../utils/schema'
import { requireOrganizationApiKey } from '../../utils/api-key'

export default defineEventHandler(async (event) => {
  const organizationId = await requireOrganizationApiKey(event)
  return {
    tags: await useDB().select().from(tags)
      .where(eq(tags.organizationId, organizationId))
      .orderBy(asc(tags.name))
  }
})
