import { defineEventHandler, createError } from 'h3'
import { requireOrganizationContext } from '../../../utils/session'
import { getOrder } from '../../../utils/order-service'
import { buildCartLink } from '../../../utils/cart-link'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireOrganizationContext(event)
  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Order id is required' })
  }

  const order = await getOrder(id, organizationId)
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  }

  // Resolving SKUs means reaching out to the vendor, so bound the wait the
  // same way the part extractor does.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  try {
    return await buildCartLink(order, controller.signal)
  } finally {
    clearTimeout(timeout)
  }
})
