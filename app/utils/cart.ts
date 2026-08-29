// Whether an order could plausibly hand off to a vendor cart, used to decide
// if the button is worth showing.
//
// This is only a heuristic. Most parts store a SKU rather than a Shopify
// variant id, and resolving a SKU means fetching the product page — so the
// real answer comes from `GET /api/orders/:id/cart-link`, which is
// authoritative. Being optimistic here is deliberate: a button that opens and
// reports "nothing could be added" is better than one that never appears.

import type { Order } from '~/types/orders'

function normalizeHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
      .hostname
  } catch {
    return null
  }
}

// Prefer the vendor record; orders with a free-text vendor have no vendor row,
// so fall back to the parts' own links when they all point at one store.
function resolveHost(order: Order): string | null {
  const fromVendor = order.vendorHostname
    ? normalizeHost(order.vendorHostname)
    : null
  if (fromVendor) return fromVendor

  const hosts = new Set<string>()
  for (const item of order.items) {
    const host = item.externalUrl ? normalizeHost(item.externalUrl) : null
    if (host) hosts.add(host)
  }
  return hosts.size === 1 ? [...hosts][0]! : null
}

function looksLikeShopify(order: Order): boolean {
  if (order.vendorType) return order.vendorType === 'shopify'
  return order.items.some(item => /\/products\//.test(item.externalUrl ?? ''))
}

export function canBuildVendorCart(order: Order): boolean {
  if (order.items.length === 0) return false
  if (!resolveHost(order)) return false
  if (!looksLikeShopify(order)) return false
  // Something has to identify the part on the vendor's side: either a variant
  // id we can use outright, or a link the server can resolve a SKU against.
  return order.items.some(item => item.variantId || item.externalUrl)
}
