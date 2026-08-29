// Turn an order into a one-click cart link on the vendor's own storefront, so
// the person placing the order doesn't have to re-find every part by hand.
//
// Only Shopify is supported: its cart permalink (`/cart/{variantId}:{qty},...`)
// is the one format that reliably builds a multi-line cart from a URL alone.
//
// The catch is that a permalink needs Shopify's *numeric variant id*, while an
// order item's `variantId` column usually holds the vendor's SKU — that's what
// the editor's "Variant SKU or ID" field captures. So any non-numeric value is
// resolved through the part extractor, which reads the product JSON and hands
// back both `sku` and `id` for every variant.

import {
  amazonAsinFromUrl,
  extractPart,
  isAmazonHost,
  type ExtractionResult
} from './part-extractor'
import type { OrderRecord, OrderItemRecord } from './order-service'

const SHOPIFY_VARIANT_ID = /^\d+$/

// Cart permalinks live in a URL, so a very long order would produce a link
// that gets truncated in transit. Cap the lines and let the rest be added by
// hand rather than silently building a broken cart.
const MAX_CART_LINES = 100

// Each unresolved part costs one outbound request. Keep a lid on how many run
// at once so a big order doesn't stall behind a fan-out.
const LOOKUP_BATCH_SIZE = 6

export type CartLinkReason =
  // A link was built (some parts may still be excluded — check `excluded`).
  | 'ok'
  // We don't know which storefront to send them to.
  | 'no-vendor'
  // Known vendor, but its platform has no usable cart permalink.
  | 'unsupported-platform'
  // Right platform, but no part could be resolved to a variant we can add.
  | 'no-variants'

export interface CartLinkItem {
  id: string
  partName: string
  quantity: number
}

export interface CartLinkResult {
  url: string | null
  included: CartLinkItem[]
  excluded: CartLinkItem[]
  reason: CartLinkReason
}

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
  return url ? normalizeHost(url) : null
}

// Where to send the buyer. Prefer the vendor record; orders created with a
// free-text vendor have no vendor row, so fall back to the parts' own product
// links when they all point at a single store.
function resolveHost(order: OrderRecord): string | null {
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

type CartPlatform = 'shopify' | 'amazon'

// A vendor row names the platform outright. Without one, the host gives Amazon
// away, and a `/products/{handle}` path is the Shopify tell — the same one the
// extractor keys off.
function detectPlatform(
  order: OrderRecord,
  host: string
): CartPlatform | null {
  if (order.vendorType === 'amazon' || isAmazonHost(host)) return 'amazon'
  if (order.vendorType) return order.vendorType === 'shopify' ? 'shopify' : null
  const shopifyish = order.items.some(item =>
    /\/products\//.test(item.externalUrl ?? '')
  )
  return shopifyish ? 'shopify' : null
}

function summarize(item: OrderItemRecord): CartLinkItem {
  return { id: item.id, partName: item.partName, quantity: item.quantity }
}

// Fetch each distinct product page once, even when several parts share it.
async function loadProducts(
  urls: string[],
  signal?: AbortSignal
): Promise<Map<string, ExtractionResult>> {
  const results = new Map<string, ExtractionResult>()
  for (let i = 0; i < urls.length; i += LOOKUP_BATCH_SIZE) {
    const batch = urls.slice(i, i + LOOKUP_BATCH_SIZE)
    const settled = await Promise.allSettled(
      batch.map(url => extractPart(url, signal))
    )
    settled.forEach((outcome, index) => {
      // A vendor that's slow or down just means those parts get added by
      // hand — it shouldn't sink the whole cart link.
      if (outcome.status === 'fulfilled') {
        results.set(batch[index]!, outcome.value)
      }
    })
  }
  return results
}

// The stored value is a SKU far more often than a variant id, so match on SKU
// first. Failing that, a product with no real variant choice has only one
// thing to buy — take it. Anything still ambiguous is left out rather than
// adding the wrong variant to someone's cart.
function pickVariantId(
  item: OrderItemRecord,
  extraction: ExtractionResult | undefined
): string | null {
  if (item.variantId && SHOPIFY_VARIANT_ID.test(item.variantId)) {
    return item.variantId
  }
  if (extraction?.source !== 'shopify' || !extraction.product) return null

  const { variants, variantId: singleVariantId } = extraction.product
  const wanted = item.variantId?.trim().toLowerCase()
  if (wanted) {
    const bySku = variants.find(
      variant => variant.sku?.trim().toLowerCase() === wanted
    )
    if (bySku && SHOPIFY_VARIANT_ID.test(bySku.id)) return bySku.id
  }
  if (variants.length > 1) return null
  const only = variants[0]?.id ?? singleVariantId
  return only && SHOPIFY_VARIANT_ID.test(only) ? only : null
}

// Amazon's ASIN is in every product link, and after extraction it's stored on
// the item too — so an Amazon cart needs no lookups at all.
function asinFor(item: OrderItemRecord): string | null {
  const fromUrl = item.externalUrl
    ? amazonAsinFromUrl(item.externalUrl)
    : null
  if (fromUrl) return fromUrl
  const stored = item.variantId?.trim().toUpperCase()
  return stored && /^[A-Z0-9]{10}$/.test(stored) ? stored : null
}

// Amazon takes a whole cart as ASIN/quantity pairs on its add-to-cart entry
// point. The buyer needs to be signed in — the link bounces through sign-in
// if they aren't — and lands on their cart with everything in it.
//
// AssociateTag is required: without it the endpoint accepts the parameters
// but never fills the cart. The value isn't checked, and "0" is deliberate —
// a real Associates tag here would silently earn affiliate commission on a
// team's purchases, which is not this button's job. Leave it as is.
const AMAZON_ASSOCIATE_TAG = '0'
function buildAmazonCart(
  order: OrderRecord,
  host: string,
  empty: Omit<CartLinkResult, 'reason'>
): CartLinkResult {
  const included: CartLinkItem[] = []
  const excluded: CartLinkItem[] = []
  const params = new URLSearchParams({ AssociateTag: AMAZON_ASSOCIATE_TAG })

  for (const item of order.items) {
    const asin = included.length < MAX_CART_LINES ? asinFor(item) : null
    if (asin) {
      const position = included.length + 1
      params.set(`ASIN.${position}`, asin)
      params.set(
        `Quantity.${position}`,
        String(Math.max(1, Math.trunc(item.quantity)))
      )
      included.push(summarize(item))
    } else {
      excluded.push(summarize(item))
    }
  }

  if (included.length === 0) return { ...empty, reason: 'no-variants' }

  return {
    url: `https://${host}/gp/aws/cart/add.html?${params.toString()}`,
    included,
    excluded,
    reason: 'ok'
  }
}

export async function buildCartLink(
  order: OrderRecord,
  signal?: AbortSignal
): Promise<CartLinkResult> {
  const empty = {
    url: null,
    included: [],
    excluded: order.items.map(summarize)
  }

  const host = resolveHost(order)
  if (!host) return { ...empty, reason: 'no-vendor' }

  const platform = detectPlatform(order, host)
  if (!platform) return { ...empty, reason: 'unsupported-platform' }
  if (platform === 'amazon') return buildAmazonCart(order, host, empty)

  // Only parts we can't already read a variant id off of need a lookup.
  const needsLookup = order.items.filter(
    item =>
      item.externalUrl
      && !(item.variantId && SHOPIFY_VARIANT_ID.test(item.variantId))
  )
  const products = await loadProducts(
    [...new Set(needsLookup.map(item => item.externalUrl!))],
    signal
  )

  const included: CartLinkItem[] = []
  const excluded: CartLinkItem[] = []
  const lines: string[] = []
  for (const item of order.items) {
    const variantId
      = lines.length < MAX_CART_LINES
        ? pickVariantId(
            item,
            item.externalUrl ? products.get(item.externalUrl) : undefined
          )
        : null
    if (variantId) {
      lines.push(`${variantId}:${Math.max(1, Math.trunc(item.quantity))}`)
      included.push(summarize(item))
    } else {
      excluded.push(summarize(item))
    }
  }

  if (lines.length === 0) return { ...empty, reason: 'no-variants' }

  return {
    // `storefront=true` lands on the store's cart page. Without it Shopify
    // redirects some stores straight into Shop Pay checkout, which skips the
    // review the buyer needs — adding a coupon, or paying on the team card.
    url: `https://${host}/cart/${lines.join(',')}?storefront=true`,
    included,
    excluded,
    reason: 'ok'
  }
}
