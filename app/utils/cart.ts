// Turn an order into a one-click cart link on the vendor's own storefront, so
// the person placing the order doesn't have to re-find every part by hand.
//
// Only Shopify is supported today: its cart permalink format
// (`/cart/{variantId}:{qty},...`) is the one that reliably builds a multi-line
// cart from a URL alone. BigCommerce and Amazon have no equivalent we can
// depend on, so those orders fall back to the per-part links already on the
// card.

import type { Order, OrderItem } from '~/types/orders'

export type CartPlanReason =
  // A link was built (some parts may still be excluded — check `excluded`).
  | 'ok'
  // We don't know which storefront to send them to.
  | 'no-vendor'
  // Known vendor, but its platform has no usable cart permalink.
  | 'unsupported-platform'
  // Right platform, but no part carries a variant id we can add to a cart.
  | 'no-variants'

export interface VendorCartPlan {
  url: string | null
  // Parts the link will drop into the cart.
  included: OrderItem[]
  // Parts that need to be added by hand (no variant id, or over the cap).
  excluded: OrderItem[]
  reason: CartPlanReason
}

// Shopify variant ids are numeric. vendord stores the literal string
// "default" for products it couldn't resolve a variant for, and the part
// extractor can leave the field empty — neither is addable.
const SHOPIFY_VARIANT_ID = /^\d+$/

// Cart permalinks live in a URL, so a very long order would produce a link
// browsers and servers start truncating. Cap the line count and let the rest
// be added by hand rather than silently building a broken cart.
const MAX_CART_LINES = 100

function normalizeHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  try {
    // Accepts both a bare host ("www.revrobotics.com") and a full URL.
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
      .hostname
  } catch {
    return null
  }
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  return normalizeHost(url)
}

// Where to send the buyer. Prefer the vendor record; orders created with a
// free-text vendor have no vendor row, so fall back to the parts' own product
// links when they all point at a single store.
function resolveHost(order: Order): string | null {
  const fromVendor = order.vendorHostname
    ? normalizeHost(order.vendorHostname)
    : null
  if (fromVendor) return fromVendor

  const hosts = new Set<string>()
  for (const item of order.items) {
    const host = hostOf(item.externalUrl)
    if (host) hosts.add(host)
  }
  return hosts.size === 1 ? [...hosts][0]! : null
}

// A vendor row tells us the platform outright. Without one, treat a
// `/products/{handle}` path as the Shopify tell — it's what the extractor
// keys off too, and it's the only case that yields numeric variant ids.
function looksLikeShopify(order: Order): boolean {
  if (order.vendorType) return order.vendorType === 'shopify'
  return order.items.some(item => /\/products\//.test(item.externalUrl ?? ''))
}

export function buildVendorCartPlan(order: Order): VendorCartPlan {
  const empty = { url: null, included: [], excluded: order.items }

  const host = resolveHost(order)
  if (!host) return { ...empty, reason: 'no-vendor' }
  if (!looksLikeShopify(order)) {
    return { ...empty, reason: 'unsupported-platform' }
  }

  const included: OrderItem[] = []
  const excluded: OrderItem[] = []
  for (const item of order.items) {
    const addable
      = !!item.variantId
        && SHOPIFY_VARIANT_ID.test(item.variantId)
        && included.length < MAX_CART_LINES
    if (addable) {
      included.push(item)
    } else {
      excluded.push(item)
    }
  }

  if (included.length === 0) return { ...empty, reason: 'no-variants' }

  const lines = included.map(
    item => `${item.variantId}:${Math.max(1, Math.trunc(item.quantity))}`
  )
  return {
    url: `https://${host}/cart/${lines.join(',')}`,
    included,
    excluded,
    reason: 'ok'
  }
}
