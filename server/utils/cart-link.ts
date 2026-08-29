// Turn an order into a one-click cart link on the vendor's own storefront, so
// the person placing the order doesn't have to re-find every part by hand.
//
// Three vendors can take a whole cart from a URL:
//   Shopify  /cart/{variantId}:{qty},...      needs the numeric variant id,
//                                             which items rarely store — they
//                                             hold the SKU, so it's resolved
//                                             through the part extractor
//   Amazon   /gp/aws/cart/add.html?ASIN.n=..  needs no lookup; the ASIN is in
//                                             every product link
//   DigiKey  /classic/ordering/fastadd.aspx   needs DigiKey's own part number,
//                                             resolved from the manufacturer
//                                             part number through their API

import {
  amazonAsinFromUrl,
  digiKeyPartFromUrl,
  extractPart,
  hostMatches,
  isAmazonHost,
  DIGIKEY_HOSTS,
  type ExtractionResult
} from './part-extractor'
import { fetchDigiKeyProduct } from './digikey'
import type { OrderRecord, OrderItemRecord } from './order-service'

const SHOPIFY_VARIANT_ID = /^\d+$/

// Shopify product URLs end at the handle — /products/{handle}, sometimes under
// /collections/{collection}. Handles are slugs built from the product title, so
// they carry letters. A bare numeric segment (playingwithfusion.com/products/118)
// or a deeper path (digikey.com/en/products/detail/...) is some other site's
// scheme that happens to use the same word.
const SHOPIFY_PRODUCT_PATH = /\/products\/(?=[^/?#]*[a-z])[^/?#]+\/?$/i

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

type CartPlatform = 'shopify' | 'amazon' | 'digikey'

// FastAdd takes DigiKey part numbers and quantities straight off a URL:
// https://forum.digikey.com/t/digikey-fastadd-.../61356
const DIGIKEY_FASTADD_PATH = '/classic/ordering/fastadd.aspx'

// DigiKey documents ~1700 characters as the safe ceiling for a FastAdd URL.
const DIGIKEY_URL_LIMIT = 1700

// DigiKey part numbers end in -ND (296-1395-5-ND, WM1816-ND); a manufacturer
// part number doesn't, and FastAdd only accepts the former.
const DIGIKEY_PART_NUMBER = /-ND$/i

// A vendor row names the platform outright. Without one, the host gives Amazon
// away, and a `/products/{handle}` path is the Shopify tell — the same one the
// extractor keys off.
function detectPlatform(
  order: OrderRecord,
  host: string
): CartPlatform | null {
  if (order.vendorType === 'amazon' || isAmazonHost(host)) return 'amazon'
  // Before the Shopify check: DigiKey product URLs also contain /products/,
  // so the path heuristic below would otherwise claim them.
  if (DIGIKEY_HOSTS.some(domain => hostMatches(host, domain))) return 'digikey'
  if (order.vendorType) return order.vendorType === 'shopify' ? 'shopify' : null
  const shopifyish = order.items.some((item) => {
    try {
      return SHOPIFY_PRODUCT_PATH.test(new URL(item.externalUrl ?? '').pathname)
    } catch {
      return false
    }
  })
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

// FastAdd wants DigiKey's own part number (296-1395-5-ND). Items store the
// manufacturer part number instead — that's what a BOM is written against —
// so anything that isn't already a DigiKey number gets looked up.
async function digiKeyPartNumber(
  item: OrderItemRecord,
  signal?: AbortSignal
): Promise<string | null> {
  const stored = item.variantId?.trim()
  if (stored && DIGIKEY_PART_NUMBER.test(stored)) return stored

  const mpn
    = stored
      || (item.externalUrl ? digiKeyPartFromUrl(item.externalUrl)?.mpn : null)
  if (!mpn) return null

  const product = await fetchDigiKeyProduct(mpn, signal)
  const resolved = product?.variantId?.trim()
  return resolved && DIGIKEY_PART_NUMBER.test(resolved) ? resolved : null
}

// DigiKey's FastAdd loads a whole cart from a URL of part/quantity pairs. It
// adds to the buyer's existing cart rather than replacing it (newcart stays
// off), so a half-built cart isn't thrown away.
async function buildDigiKeyCart(
  order: OrderRecord,
  host: string,
  empty: Omit<CartLinkResult, 'reason'>,
  signal?: AbortSignal
): Promise<CartLinkResult> {
  const resolved: { item: OrderItemRecord, part: string }[] = []
  const excluded: CartLinkItem[] = []

  for (let i = 0; i < order.items.length; i += LOOKUP_BATCH_SIZE) {
    const batch = order.items.slice(i, i + LOOKUP_BATCH_SIZE)
    const parts = await Promise.all(
      batch.map(item => digiKeyPartNumber(item, signal).catch(() => null))
    )
    parts.forEach((part, index) => {
      const item = batch[index]!
      if (part) resolved.push({ item, part })
      else excluded.push(summarize(item))
    })
  }

  // DigiKey asks tools to identify themselves so they can attribute traffic.
  const params = new URLSearchParams({ utm_source: 'orders.frctools.com' })
  const included: CartLinkItem[] = []
  const urlFor = (query: URLSearchParams) =>
    `https://${host}${DIGIKEY_FASTADD_PATH}?${query.toString()}`

  for (const { item, part } of resolved) {
    const candidate = new URLSearchParams(params)
    const position = included.length + 1
    candidate.set(`part${position}`, part)
    candidate.set(
      `qty${position}`,
      String(Math.max(1, Math.trunc(item.quantity)))
    )
    // Past their documented URL ceiling the request errors outright, so stop
    // adding and report the rest rather than building a link that fails.
    if (urlFor(candidate).length > DIGIKEY_URL_LIMIT) {
      excluded.push(summarize(item))
      continue
    }
    for (const [key, value] of candidate) params.set(key, value)
    included.push(summarize(item))
  }

  if (included.length === 0) return { ...empty, reason: 'no-variants' }
  return { url: urlFor(params), included, excluded, reason: 'ok' }
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
  if (platform === 'digikey') {
    return buildDigiKeyCart(order, host, empty, signal)
  }

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

  if (lines.length === 0) {
    // The path heuristic can still be wrong — plenty of sites put /products/
    // in a URL. Only a lookup that actually reached Shopify's product JSON
    // proves the platform, so without one, say so rather than blaming the
    // parts for not matching.
    const confirmedShopify = [...products.values()].some(
      extraction => extraction.source === 'shopify'
    )
    return {
      ...empty,
      reason: confirmedShopify ? 'no-variants' : 'unsupported-platform'
    }
  }

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
