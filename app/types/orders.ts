import type { InternalApi } from 'nitropack'

export type OrderStatus = 'to_order' | 'ordered' | 'arrived'

export type Tag = {
  id: string
  name: string
  color: string
}

// A per-vendor purchase order (header) with its line items + derived total.
export type Order = InternalApi['/api/orders']['get']['orders'][number]

// A single part within an order.
export type OrderItem = Order['items'][number]

// How an order was paid for (split payments).
export type OrderPayment = Order['payments'][number]
export type PaymentType = OrderPayment['type']

// Values captured by the post-order details editor (tracking, shipping, pay).
export type OrderDetailsValues = {
  trackingCarrier: string | null
  trackingNumber: string | null
  shippingCents: number | null
  taxCents: number | null
  payments: { type: PaymentType, label: string, amountCents: number }[]
}

// Values captured by the line-item editor. `vendorId` only matters when
// creating (it decides which vendor order the part groups into).
export type OrderEditorValues = {
  partName: string
  quantity: number
  description: string | undefined
  vendorId: string | null
  unitPriceCents: number | undefined
  variantId: string | undefined
  variantTitle: string | undefined
  externalUrl: string | undefined
  tagIds: string[] | undefined
}

export type OrderEditorSubmitPayload = {
  mode: 'create' | 'edit'
  // Present when editing an existing line item.
  orderId: string | null
  itemId: string | null
  values: OrderEditorValues
}
