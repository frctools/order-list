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

// Mirrors detectPlatform() on the server; see the note above about this being
// deliberately optimistic.
// Shopify product URLs end at the handle — /products/{handle}, sometimes under
// /collections/{collection}. Handles are slugs built from the product title, so
// they carry letters. A bare numeric segment (playingwithfusion.com/products/118)
// or a deeper path (digikey.com/en/products/detail/...) is some other site's
// scheme that happens to use the same word.
const SHOPIFY_PRODUCT_PATH = /\/products\/(?=[^/?#]*[a-z])[^/?#]+\/?$/i

function hasSupportedPlatform(order: Order, host: string): boolean {
  if (/(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(host)) return true
  if (/(^|\.)digikey\.(com|ca)$/i.test(host)) return true
  if (order.vendorType) return order.vendorType !== 'bigcommerce'
  return order.items.some((item) => {
    try {
      return SHOPIFY_PRODUCT_PATH.test(new URL(item.externalUrl ?? '').pathname)
    } catch {
      return false
    }
  })
}

export function canBuildVendorCart(order: Order): boolean {
  if (order.items.length === 0) return false
  const host = resolveHost(order)
  if (!host) return false
  if (!hasSupportedPlatform(order, host)) return false
  // Something has to identify the part on the vendor's side: either an id we
  // can use outright, or a link the server can resolve it from.
  return order.items.some(item => item.variantId || item.externalUrl)
}
