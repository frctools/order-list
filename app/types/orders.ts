import type { InternalApi } from 'nitropack'

export type OrderStatus = 'to_order' | 'ordered' | 'arrived'

export type Tag = {
  id: string
  name: string
  color: string
}

export type OrderEditorValues = {
  projectId?: string
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
  orderId: string | null
  values: OrderEditorValues
}
export type Order = InternalApi['/api/orders']['get']['orders'][number]
