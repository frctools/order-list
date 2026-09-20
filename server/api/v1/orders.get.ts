import { and, desc, eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDB } from '../../utils/db'
import { orders } from '../../utils/schema'
import { requireOrganizationApiKey } from '../../utils/api-key'

export default defineEventHandler(async (event) => {
  const organizationId = await requireOrganizationApiKey(event)
  const projectId = getQuery(event).projectId as string | undefined
  const conditions = [eq(orders.organizationId, organizationId)]
  if (projectId) conditions.push(eq(orders.projectId, projectId))

  return {
    orders: await useDB().select().from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.updatedAt))
  }
})
