// WestCoast Products' configurable pages, via Itoris Dynamic Product Options.
//
// WCP's catalog is two-tiered, and the tiers are indistinguishable through
// Shopify's own API. Roughly 1300 products are ordinary parts — handle
// `wcp-2059`, SKU `WCP-2059`, a spec for a title. The other ~190 are
// *configurator* pages: `/products/ball-bearings` is titled "Imperial
// Bearings", carries a single "Default Title" variant at a $2.99 "from"
// price, and has no SKU. Every WCP product has exactly one Shopify variant,
// so the usual variant machinery says nothing at all here.
//
// The parts a configurator page actually sells come from Itoris DPO, a
// third-party service. Nothing about them is in the page HTML — it renders
// client-side — so reading the page gets you the category and a plausible
// price, which is worse than failing: an order line saying "Imperial
// Bearings ×10" looks like it worked.
//
// Two endpoints, both plain POST/GET, no browser needed:
//
//   include.js?shop=…                       carries `allowProductIds`, the
//                                           product ids that are configurable
//   include.js?controller=GetOptionConfig   the options themselves, as HTML
//
// The useful discovery is that each option maps 1:1 onto an ordinary Shopify
// product: lowercase its `product-sku` and you have the handle
// (`WCP-2059` -> /products/wcp-2059), and the option price matches that
// product's price exactly. So DPO is only a *discovery* mechanism. Once a
// part is picked it is a normal Shopify product, which means cart links,
// variant resolution and everything else downstream work unchanged — none of
// DPO's own cart flow (dpo_cart_id and friends) has to be touched.

import { parseHTML } from 'linkedom'
import { hostMatches } from './part-extractor'

export const WCP_HOSTS = ['wcproducts.com']

const DPO_ORIGIN = 'https://node1.itoris.com'
const DPO_SHOP = 'wcp-robotics.myshopify.com'
const INCLUDE_URL
  = `${DPO_ORIGIN}/dpo/storefront/include.js?shop=${DPO_SHOP}`
const OPTION_CONFIG_URL
  = `${DPO_ORIGIN}/dpo/storefront/include.js`
  + `?controller=GetOptionConfig&shop=${DPO_SHOP}`

const USER_AGENT
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'

// One orderable part offered by a configurator page.
export interface DpoChoice {
  // WCP's own part number, e.g. "WCP-2059". Not always WCP-prefixed —
  // "217-5830" is a real one — so never assume the shape.
  sku: string
  // The full spec, which is what belongs on an order line.
  title: string
  price: number | null
  // The canonical standalone product page for this part. Storing this as a
  // line item's externalUrl is what lets the existing Shopify cart handoff
  // work without knowing DPO exists.
  productUrl: string
}

export interface DpoOptionGroup {
  id: string
  label: string
  choices: DpoChoice[]
}

export function isWcpHost(hostname: string): boolean {
  return WCP_HOSTS.some(domain => hostMatches(hostname, domain))
}

/** The standalone Shopify product page for a WCP part number. */
export function wcpProductUrl(sku: string): string {
  return `https://wcproducts.com/products/${sku.trim().toLowerCase()}`
}

// The allow list changes about as often as WCP restructures their catalog, so
// an hour is generous and still keeps a stale entry from lasting a deploy.
// Module scope, which on a long-running Node server means one fetch per hour
// for the whole process.
const ALLOW_LIST_TTL_MS = 60 * 60 * 1000

let allowList: { ids: Set<string>, expiresAt: number } | null = null

/**
 * The Shopify product ids that DPO is configured for. Null when the list
 * can't be read, which callers treat as "don't know" rather than "no".
 */
export async function fetchAllowList(
  signal?: AbortSignal
): Promise<Set<string> | null> {
  if (allowList && allowList.expiresAt > Date.now()) return allowList.ids

  let body: string
  try {
    const response = await fetch(INCLUDE_URL, {
      signal,
      headers: { 'user-agent': USER_AGENT }
    })
    if (!response.ok) return null
    body = await response.text()
  } catch {
    return null
  }

  // The list is a plain array literal inside the storefront bundle. Parsing
  // the whole script would be worse: it is minified app code, not data.
  const match = body.match(/allowProductIds:\s*\[([^\]]*)\]/)
  if (!match) return null

  const ids = new Set(
    Array.from(match[1]!.matchAll(/"(\d+)"/g), m => m[1]!)
  )
  if (ids.size === 0) return null

  allowList = { ids, expiresAt: Date.now() + ALLOW_LIST_TTL_MS }
  return ids
}

/** Reset the cached allow list. Exists for tests and manual recovery. */
export function clearAllowListCache(): void {
  allowList = null
}

function parsePrice(value: string | null): number | null {
  if (!value) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

/**
 * Pull the option groups out of a GetOptionConfig response.
 *
 * The shape is stable Magento-style markup:
 *
 *   <div id="dynamic_option_id_1001"><label>Rounded Hex Bearings</label>
 *     <input id="options_1001_2" price="1.99" product-sku="217-5830">
 *     <label for="options_1001_2"><span>.302" ID x 0.875" OD …</span>…</label>
 *
 * The inputs are checkboxes — picking several parts in one visit is the
 * native interaction, which is why the caller can add them in bulk.
 */
export function parseOptionGroups(html: string): DpoOptionGroup[] {
  const { document } = parseHTML(html)
  const groups: DpoOptionGroup[] = []

  for (const field of Array.from(
    document.querySelectorAll('[id^="dynamic_option_id_"]')
  )) {
    const id = (field.getAttribute('id') ?? '').replace(
      'dynamic_option_id_',
      ''
    )
    const label = field.querySelector('label')?.textContent?.trim() ?? ''

    const choices: DpoChoice[] = []
    for (const input of Array.from(
      field.querySelectorAll('input[product-sku]')
    )) {
      const sku = input.getAttribute('product-sku')?.trim()
      if (!sku) continue

      // The spec lives in the first span of the input's own label; the
      // second span is DPO's "+$1.99" price notice, which is a display
      // convention rather than a surcharge — the price attribute already
      // matches the standalone product's price.
      const inputId = input.getAttribute('id')
      const title
        = (inputId
          ? document.querySelector(`label[for="${inputId}"] span`)
              ?.textContent
          : null
        )?.trim() ?? ''

      choices.push({
        sku,
        title: title || sku,
        price: parsePrice(input.getAttribute('price')),
        productUrl: wcpProductUrl(sku)
      })
    }

    if (choices.length > 0) groups.push({ id, label, choices })
  }

  return groups
}

/**
 * The parts a configurator page offers, or null when this product isn't one
 * (or DPO can't be reached, in which case the caller keeps whatever the
 * ordinary Shopify extraction produced).
 */
export async function fetchOptionGroups(
  productId: string,
  variantId: string | null,
  signal?: AbortSignal
): Promise<DpoOptionGroup[] | null> {
  const allowed = await fetchAllowList(signal)
  // A null list means the lookup failed; asking anyway is one wasted request
  // at worst, and refusing would disable the feature whenever itoris hiccups.
  if (allowed && !allowed.has(productId)) return null

  let html: string
  try {
    const response = await fetch(OPTION_CONFIG_URL, {
      method: 'POST',
      signal,
      headers: {
        'user-agent': USER_AGENT,
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: new URLSearchParams({
        product_id: productId,
        variant_id: variantId ?? '',
        customer_id: '0',
        skip_assoc_data_check: '0'
      })
    })
    if (!response.ok) return null
    html = await response.text()
  } catch {
    return null
  }

  const groups = parseOptionGroups(html)
  return groups.length > 0 ? groups : null
}
