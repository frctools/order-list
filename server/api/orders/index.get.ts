import { defineEventHandler } from 'h3'
import { and, eq, desc, sql } from 'drizzle-orm'
import { useDB } from '../../utils/db'
import { orders, vendors, orderTags, tags } from '../../utils/schema'
import { user as authUser } from '../../utils/auth-schema'
import { requireOrganizationContext } from '../../utils/session'
import { requireOrganizationProject } from '../../utils/project-service'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireOrganizationContext(event)
  const projectId = getQuery(event).projectId as string | undefined
  const project = await requireOrganizationProject(organizationId, projectId)
  const db = useDB()

  const orderRecords = await db
    .select({
      id: orders.id,
      organizationId: orders.organizationId,
      projectId: orders.projectId,
      partName: orders.partName,
      description: orders.description,
      status: orders.status,
      quantity: orders.quantity,
      unitPriceCents: orders.unitPriceCents,
      variantId: orders.variantId,
      variantTitle: orders.variantTitle,
      vendorId: orders.vendorId,
      vendorName: sql<
        string | null
      >`coalesce(${vendors.name}, ${orders.vendorName})`,
      vendorType: vendors.type,
      externalUrl: orders.externalUrl,
      orderedAt: orders.orderedAt,
      arrivedAt: orders.arrivedAt,
      requestedBy: orders.requestedBy,
      requestedByName: authUser.name,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt
    })
    .from(orders)
    .leftJoin(vendors, eq(orders.vendorId, vendors.id))
    .leftJoin(authUser, eq(orders.requestedBy, authUser.id))
    .where(
      and(
        eq(orders.organizationId, organizationId),
        eq(orders.projectId, project.id)
      )
    )
    .orderBy(desc(orders.createdAt))

  const orderIds = orderRecords.map(o => o.id)
  const orderTagsData
    = orderIds.length > 0
      ? await db
          .select({
            orderId: orderTags.orderId,
            tagId: tags.id,
            tagName: tags.name,
            tagColor: tags.color
          })
          .from(orderTags)
          .innerJoin(tags, eq(orderTags.tagId, tags.id))
          .where(sql`${orderTags.orderId} IN ${orderIds}`)
      : []

  const tagsByOrder = new Map<
    string,
    Array<{ id: string, name: string, color: string }>
  >()
  for (const ot of orderTagsData) {
    const existing = tagsByOrder.get(ot.orderId) || []
    existing.push({ id: ot.tagId, name: ot.tagName, color: ot.tagColor })
    tagsByOrder.set(ot.orderId, existing)
  }

  const ordersWithTags = orderRecords.map(order => ({
    ...order,
    tags: tagsByOrder.get(order.id) || []
  }))

  return {
    orders: ordersWithTags,
    project
  }
})
