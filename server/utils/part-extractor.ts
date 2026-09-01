import { parseHTML } from 'linkedom'
import type { DpoOptionGroup } from './wcp-dpo'

// Self-contained product extractor: given a product URL, reach out to the site
// and pull structured details. Tries, in order:
//   1. Shopify  — /products/{handle}.json (most FRC vendors run Shopify)
//   2. JSON-LD  — schema.org/Product in <script type="application/ld+json">
//   2.5 Amazon  — its meta tags describe the storefront, so read the DOM
//   3. OpenGraph/meta — og:*, product:price:*, itemprop fallbacks
// No external scraper service or database required.

export interface ExtractedVariant {
  id: string
  sku: string | null
  title: string
  price: number | null
}

// A quantity discount tier: buy `quantity` or more, pay `unitPrice` each.
export interface PriceBreak {
  quantity: number
  unitPrice: number
}

export interface ExtractedProduct {
  title: string
  description: string | null
  price: number | null
  currency: string | null
  sku: string | null
  // The platform's *product* id, distinct from the variant id below. Only the
  // Shopify path sets it, and only because WCP's configurator lookup is keyed
  // by product rather than variant.
  productId?: string | null
  // The platform id of the variant these details describe. `variants` is left
  // empty when there's no real choice to make, so this is the only way to
  // recover the id of a single-variant product (a cart link needs it).
  variantId: string | null
  variantTitle: string | null
  variants: ExtractedVariant[]
  // Quantity discount tiers, when the vendor publishes them (DigiKey does).
  // Ascending by quantity; the applicable tier is the last one the ordered
  // quantity reaches.
  priceBreaks?: PriceBreak[]
}

export interface ExtractionResult {
  url: string
  hostname: string
  vendorName: string
  source:
    | 'shopify'
    | 'amazon'
    | 'digikey'
    | 'json-ld'
    | 'opengraph'
    | 'scraper'
    | 'url'
    | 'none'
  product: ExtractedProduct | null
  // Set when the page is a configurator rather than a single orderable part:
  // the real parts it offers, each a standalone product in its own right.
  // See server/utils/wcp-dpo.ts.
  optionGroups?: DpoOptionGroup[]
}

// Common FRC vendors -> canonical display name. Matched by hostname suffix so
// www./store. subdomains resolve too.
const FRC_VENDORS: Array<{ match: string, name: string }> = [
  { match: 'revrobotics.com', name: 'REV Robotics' },
  { match: 'wcproducts.com', name: 'WestCoast Products' },
  { match: 'gobilda.com', name: 'goBILDA' },
  { match: 'servocity.com', name: 'ServoCity' },
  { match: 'thethriftybot.com', name: 'The Thrifty Bot' },
  { match: 'swyftrobotics.com', name: 'Swyft Robotics' },
  { match: 'andymark.com', name: 'AndyMark' },
  { match: 'vexrobotics.com', name: 'VEX Robotics' },
  { match: 'vexpro.com', name: 'VEXpro' },
  { match: 'ctr-electronics.com', name: 'Cross the Road Electronics' },
  { match: 'onlinemetals.com', name: 'Online Metals' },
  { match: 'mcmaster.com', name: 'McMaster-Carr' },
  { match: 'digikey.com', name: 'DigiKey' },
  { match: 'digikey.ca', name: 'DigiKey' }
]

// Match a hostname against a bare domain, tolerating www./store. subdomains.
export function hostMatches(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  return h === domain || h.endsWith(`.${domain}`)
}

// Shopify's `product.vendor` holds the brand/manufacturer, not the store you
// order from, and is often left as the "My Store" default. Ignore that value.
const DEFAULT_SHOPIFY_VENDORS = new Set(['my store'])

const USER_AGENT
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'

function friendlyVendorName(hostname: string): string | null {
  for (const v of FRC_VENDORS) {
    if (hostMatches(hostname, v.match)) return v.name
  }
  return null
}

// The name to show for a host: the curated one when we have it, else a
// readable form of the domain.
export function vendorDisplayName(hostname: string): string {
  return friendlyVendorName(hostname) ?? titleCaseHost(hostname)
}

function titleCaseHost(hostname: string): string {
  const base
    = hostname.replace(/^www\./, '').split('.').slice(0, -1).join('.')
    || hostname
  return base
    .split(/[.-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

// Parse a price that may arrive as a number or a messy string ("$1,234.56").
function parsePrice(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const normalized = String(value).replace(/[^0-9.,]/g, '')
  if (!normalized) return null
  const hasDot = normalized.includes('.')
  const hasComma = normalized.includes(',')
  // "1234,56" (EU) -> "1234.56"; otherwise treat commas as thousands separators.
  const numeric
    = hasComma && !hasDot
      ? Number(normalized.replace(/,/g, '.'))
      : Number(normalized.replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

// Strip HTML/entities/whitespace and cap length so descriptions fit the Notes field.
function cleanText(input: unknown, max = 600): string | null {
  if (typeof input !== 'string') return null
  let text = input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    // Stripping inline tags can leave a space before punctuation ("word .").
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
  if (!text) return null
  if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`
  return text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}

async function fetchWithUa(
  url: string,
  accept: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(url, {
    signal,
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': accept,
      'Accept-Language': 'en-US,en;q=0.9'
    }
  })
}

// ---- Shopify -------------------------------------------------------------

function shopifyHandle(urlObj: URL): string | null {
  const parts = urlObj.pathname.split('/').filter(Boolean)
  const idx = parts.indexOf('products')
  const handle = idx !== -1 ? parts[idx + 1] : undefined
  return handle ?? null
}

async function tryShopify(
  urlObj: URL,
  signal?: AbortSignal
): Promise<{ product: ExtractedProduct, vendor: string | null } | null> {
  const handle = shopifyHandle(urlObj)
  if (!handle) return null

  const jsonUrl = `${urlObj.origin}/products/${handle}.json`
  let res: Response
  try {
    res = await fetchWithUa(jsonUrl, 'application/json', signal)
  } catch {
    return null
  }
  if (!res.ok) return null
  if (!(res.headers.get('content-type') || '').includes('json')) return null

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return null
  }

  const product = isRecord(data) ? data.product : null
  if (!isRecord(product)) return null
  const title = asString(product.title)
  if (!title) return null

  const rawVariants = Array.isArray(product.variants) ? product.variants : []
  const variants: ExtractedVariant[] = rawVariants
    .filter(isRecord)
    .map((v) => {
      const variantTitle = asString(v.title)
      return {
        id: asString(v.id) ?? '',
        sku: asString(v.sku),
        title:
          !variantTitle || variantTitle === 'Default Title'
            ? title
            : variantTitle,
        price: parsePrice(v.price)
      }
    })

  // Honor ?variant=<id> deep links; otherwise default to the first variant.
  const requestedVariant = urlObj.searchParams.get('variant')
  const selected
    = (requestedVariant
      && variants.find(variant => variant.id === requestedVariant))
    || variants[0]
    || null

  // Only surface a variant picker when there's a real choice to make.
  const hasRealVariants
    = variants.length > 1 || variants.some(variant => variant.title !== title)

  const rawVendor = asString(product.vendor)
  const vendor
    = rawVendor && !DEFAULT_SHOPIFY_VENDORS.has(rawVendor.toLowerCase())
      ? rawVendor
      : null

  return {
    vendor,
    product: {
      title,
      description: cleanText(product.body_html),
      productId: asString(product.id),
      price: selected?.price ?? null,
      currency: 'USD',
      sku: selected?.sku ?? null,
      variantId: selected?.id ?? null,
      variantTitle:
        selected && selected.title !== title ? selected.title : null,
      variants: hasRealVariants ? variants : []
    }
  }
}

// ---- JSON-LD -------------------------------------------------------------

function collectProducts(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectProducts(item, out)
    return
  }
  if (!isRecord(node)) return
  if ('@graph' in node) collectProducts(node['@graph'], out)
  const type = node['@type']
  const isProduct
    = type === 'Product'
    || (Array.isArray(type) && type.includes('Product'))
  if (isProduct) out.push(node)
}

function priceFromOffers(offers: unknown): {
  price: number | null
  currency: string | null
} {
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const result = priceFromOffers(offer)
      if (result.price != null) return result
    }
    return { price: null, currency: null }
  }
  if (!isRecord(offers)) return { price: null, currency: null }
  // AggregateOffer nests real offers; recurse into them first.
  if (offers.offers) {
    const nested = priceFromOffers(offers.offers)
    if (nested.price != null) return nested
  }
  return {
    price: parsePrice(offers.price ?? offers.lowPrice ?? offers.highPrice),
    currency: asString(offers.priceCurrency)
  }
}

function brandName(brand: unknown): string | null {
  if (typeof brand === 'string') return brand.trim() || null
  if (isRecord(brand)) return asString(brand.name)
  return null
}

// ---- HTML meta -----------------------------------------------------------

// linkedom ships loose DOM types (and the server tsconfig omits the DOM lib),
// so describe just the surface we use and cast the parsed document to it.
interface ParsedEl {
  getAttribute(name: string): string | null
  textContent: string | null
}
interface ParsedDoc {
  querySelector(selector: string): ParsedEl | null
  querySelectorAll(selector: string): Iterable<ParsedEl>
}

function parseDocument(html: string): ParsedDoc {
  return (parseHTML(html) as unknown as { document: ParsedDoc }).document
}

function getMeta(document: ParsedDoc, selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (!el) continue
    const content
      = el.getAttribute('content') ?? el.getAttribute('value') ?? el.textContent
    if (content && content.trim()) return content.trim()
  }
  return null
}

// ---- URL-only vendors ----------------------------------------------------

// Some vendors' product pages can't be read by a server at all — the details
// arrive via client-side rendering, or the site refuses automated requests.
// Their URLs still identify the part, and parsing one costs no request, so
// these hosts skip the network entirely.

// Online Metals sits behind a bot challenge, so a server fetch of the product
// page comes back as an interstitial rather than the listing — none of the
// three strategies above can see anything. Their URLs carry enough on their
// own to be worth filling in:
//   /en/buy/{category}/{slug}/pid/{pid}          the product
//   ?variant={pid}_{lengthInInches}_{n}          a specific cut length
const ONLINE_METALS_PRODUCT = /\/buy\/[^/]+\/([^/]+)\/pid\/(\d+)/i

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .join(' ')
    // Leading dimensions are written as "0-625" for 0.625". Only a leading
    // zero is unambiguous — "1-2" is a fraction (1/2"), so leave it alone.
    .replace(/\b0 (\d+)/g, '0.$1')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function fromOnlineMetalsUrl(urlObj: URL): ExtractedProduct | null {
  const match = ONLINE_METALS_PRODUCT.exec(urlObj.pathname)
  if (!match) return null
  const [, slug, productId] = match

  // The cut length is what actually gets ordered, so prefer its sku over the
  // bare product id when the link names one.
  const variant = urlObj.searchParams.get('variant')
  const isVariantOfProduct = !!variant && variant.startsWith(`${productId}_`)
  const lengthInches = isVariantOfProduct ? variant.split('_')[1] : null

  return {
    title: titleFromSlug(slug!),
    description: null,
    // Price is per cut length and only lives on the page we can't read.
    price: null,
    currency: 'USD',
    sku: isVariantOfProduct ? variant : productId!,
    variantId: isVariantOfProduct ? variant : null,
    variantTitle: lengthInches ? `${lengthInches}" length` : null,
    variants: []
  }
}

// McMaster-Carr renders product pages entirely client-side, marks them
// `noindex, noarchive`, and disallows the endpoints that serve the data in
// robots.txt — a fetch returns a shell whose only title is "McMaster-Carr",
// which would be worse than nothing. We never request their pages.
//
// The part number is the whole identifier and it's right in the path:
//   /91290A115/                          the part
//   /91290A115-alloy-steel-screws/       same, with an SEO slug
const MCMASTER_PART = /^\/(\d{3,6}[A-Z]\d{1,5})(?:-([a-z0-9-]+))?\/?$/i

function fromMcMasterUrl(urlObj: URL): ExtractedProduct | null {
  const match = MCMASTER_PART.exec(urlObj.pathname)
  if (!match) return null
  const [, partNumber, slug] = match

  return {
    // Without the page there's no description; the part number is a name a
    // team will recognise, and they can rename it.
    title: slug ? titleFromSlug(slug) : partNumber!.toUpperCase(),
    description: null,
    price: null,
    currency: 'USD',
    sku: partNumber!.toUpperCase(),
    variantId: null,
    variantTitle: null,
    variants: []
  }
}

// DigiKey sits behind the same bot challenge Online Metals uses, but its URLs
// are unusually rich — manufacturer, manufacturer part number, and DigiKey's
// own product id are all in the path:
//   /en/products/detail/{manufacturer}/{mpn}/{id}
//   /product-detail/en/{manufacturer}/{mpn}/{digikeyPartNumber}/{id}  (legacy)
export const DIGIKEY_HOSTS = ['digikey.com', 'digikey.ca']
const DIGIKEY_MODERN = /\/products\/detail\/([^/]+)\/([^/]+)\/(\d+)/i
const DIGIKEY_LEGACY
  = /\/product-detail\/[a-z]{2}\/([^/]+)\/([^/]+)\/([^/]+)\/(\d+)/i

// The manufacturer and part number a DigiKey link names, for callers that
// want to look the part up properly rather than guess from the URL.
export function digiKeyPartFromUrl(
  url: string
): { manufacturer: string, mpn: string } | null {
  let urlObj: URL
  try {
    urlObj = new URL(url)
  } catch {
    return null
  }
  if (!DIGIKEY_HOSTS.some(domain => hostMatches(urlObj.hostname, domain))) {
    return null
  }
  const match
    = DIGIKEY_LEGACY.exec(urlObj.pathname)
      ?? DIGIKEY_MODERN.exec(urlObj.pathname)
  if (!match) return null
  const mpn = decodeURIComponent(match[2]!).trim()
  if (!mpn) return null
  return { manufacturer: titleFromSlug(decodeURIComponent(match[1]!)), mpn }
}

function fromDigiKeyUrl(urlObj: URL): ExtractedProduct | null {
  const match
    = DIGIKEY_LEGACY.exec(urlObj.pathname)
      ?? DIGIKEY_MODERN.exec(urlObj.pathname)
  if (!match) return null

  const manufacturer = titleFromSlug(decodeURIComponent(match[1]!))
  // The manufacturer part number is what engineers call the part, and what a
  // BOM will be written against — so it's both the name and the sku.
  const mpn = decodeURIComponent(match[2]!).trim()
  if (!mpn) return null

  return {
    title: manufacturer ? `${manufacturer} ${mpn}` : mpn,
    description: null,
    // Price is per quantity break and only lives on the page we can't read.
    price: null,
    currency: 'USD',
    sku: mpn,
    variantId: null,
    variantTitle: null,
    variants: []
  }
}

const URL_ONLY_VENDORS: Array<{
  domain: string
  parse: (urlObj: URL) => ExtractedProduct | null
}> = [
  { domain: 'onlinemetals.com', parse: fromOnlineMetalsUrl },
  { domain: 'mcmaster.com', parse: fromMcMasterUrl },
  { domain: 'digikey.com', parse: fromDigiKeyUrl },
  // Canadian teams order from the .ca storefront; same URL shapes.
  { domain: 'digikey.ca', parse: fromDigiKeyUrl }
]

// ---- Amazon --------------------------------------------------------------

// Amazon's meta tags describe the storefront, not the product: <meta
// name="title"> reads "Amazon.com: {name} : {category}" and there's no price
// tag at all. The real title and price are in the DOM, so read those instead
// of letting the generic OpenGraph fallback pick up the wrapped version.

export function isAmazonHost(hostname: string): boolean {
  return /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(hostname)
}

// Peel the storefront prefix and trailing category breadcrumb off a title.
// Only used when the page didn't give us the clean #productTitle.
export function cleanAmazonTitle(title: string): string {
  const withoutStore = title.replace(/^\s*amazon[^:]*:\s*/i, '')
  // "{name} : {category}" — product names use ", " or ": ", rarely " : ".
  const breadcrumb = withoutStore.lastIndexOf(' : ')
  const name = breadcrumb > 0 ? withoutStore.slice(0, breadcrumb) : withoutStore
  return name.trim()
}

// The ASIN is Amazon's part number, and it's in the URL.
const AMAZON_ASIN = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i

function amazonAsin(urlObj: URL): string | null {
  return AMAZON_ASIN.exec(urlObj.pathname)?.[1]?.toUpperCase() ?? null
}

// The ASIN out of a product link, for callers holding a URL string.
export function amazonAsinFromUrl(url: string): string | null {
  try {
    return amazonAsin(new URL(url))
  } catch {
    return null
  }
}

function tryAmazon(
  document: ParsedDoc,
  urlObj: URL
): ExtractedProduct | null {
  const rawTitle = getMeta(document, [
    '#productTitle',
    'meta[property="og:title"]',
    'meta[name="title"]'
  ])
  if (!rawTitle) return null
  const title = cleanAmazonTitle(rawTitle)
  if (!title) return null

  const price = parsePrice(
    getMeta(document, [
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '#apex_desktop .a-offscreen',
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice'
    ])
  )

  // The meta description repeats the wrapped title; the bullet list is the
  // only place with anything worth putting in Notes.
  const bullets = cleanText(
    getMeta(document, ['#feature-bullets'])?.replace(/^\s*About this item\s*/i, '')
  )

  return {
    title,
    description: bullets,
    price,
    currency: 'USD',
    sku: amazonAsin(urlObj),
    variantId: null,
    variantTitle: null,
    variants: []
  }
}

// ---- Orchestration -------------------------------------------------------

export async function extractPart(
  url: string,
  signal?: AbortSignal
): Promise<ExtractionResult> {
  const urlObj = new URL(url)
  const hostname = urlObj.hostname
  const mappedVendor = friendlyVendorName(hostname)
  const vendorName = mappedVendor ?? titleCaseHost(hostname)

  // 0. Vendors whose pages a server can't read. Fetching them either fails or
  // returns a shell we'd misread as real details, so the URL is the only
  // source — and checking it costs no request.
  const urlOnly = URL_ONLY_VENDORS.find(v => hostMatches(hostname, v.domain))
  if (urlOnly) {
    const product = urlOnly.parse(urlObj)
    return {
      url,
      hostname,
      vendorName,
      source: product ? 'url' : 'none',
      product
    }
  }

  // 1. Shopify JSON — richest data, so try it first for any /products/ URL.
  const shopify = await tryShopify(urlObj, signal)
  if (shopify) {
    return {
      url,
      hostname,
      vendorName: mappedVendor ?? shopify.vendor ?? titleCaseHost(hostname),
      source: 'shopify',
      product: shopify.product
    }
  }

  // Fetch the page once for the HTML-based strategies.
  let html: string | null = null
  try {
    const res = await fetchWithUa(
      url,
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      signal
    )
    if (res.ok) html = await res.text()
  } catch {
    html = null
  }

  if (html) {
    const document = parseDocument(html)
    const ogDescription = () =>
      cleanText(
        getMeta(document, [
          'meta[property="og:description"]',
          'meta[name="description"]',
          'meta[name="twitter:description"]'
        ])
      )
    const ogVendor = () =>
      getMeta(document, ['meta[property="og:site_name"]'])

    // 2. JSON-LD Product.
    const products: Record<string, unknown>[] = []
    for (const script of Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    )) {
      const raw = script.textContent
      if (!raw) continue
      try {
        collectProducts(JSON.parse(raw), products)
      } catch {
        // Ignore malformed JSON-LD blocks.
      }
    }
    const node = products[0]
    const name = node ? asString(node.name) : null
    if (node && name) {
      const { price, currency } = priceFromOffers(node.offers)
      return {
        url,
        hostname,
        vendorName:
          mappedVendor
          ?? brandName(node.brand)
          ?? ogVendor()
          ?? titleCaseHost(hostname),
        source: 'json-ld',
        product: {
          title: name,
          description: cleanText(node.description) ?? ogDescription(),
          price,
          currency: currency ?? 'USD',
          sku: asString(node.sku) ?? asString(node.mpn),
          // Neither fallback source exposes platform variant ids.
          variantId: null,
          variantTitle: null,
          variants: []
        }
      }
    }

    // 2.5 Amazon: read the DOM before the meta tags, which would otherwise
    // hand us a storefront-wrapped title and no price.
    if (isAmazonHost(hostname)) {
      const product = tryAmazon(document, urlObj)
      if (product) {
        return {
          url,
          hostname,
          vendorName: mappedVendor ?? titleCaseHost(hostname),
          source: 'amazon',
          product
        }
      }
    }

    // 3. OpenGraph / meta fallback.
    const title = getMeta(document, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
      'h1'
    ])
    if (title) {
      const currency = getMeta(document, [
        'meta[property="product:price:currency"]',
        'meta[itemprop="priceCurrency"]'
      ])
      return {
        url,
        hostname,
        vendorName: mappedVendor ?? ogVendor() ?? titleCaseHost(hostname),
        source: 'opengraph',
        product: {
          title,
          description: ogDescription(),
          price: parsePrice(
            getMeta(document, [
              'meta[property="product:price:amount"]',
              'meta[property="og:price:amount"]',
              'meta[itemprop="price"]',
              '[itemprop="price"]'
            ])
          ),
          currency: currency ?? 'USD',
          sku: getMeta(document, [
            'meta[itemprop="sku"]',
            '[itemprop="sku"]'
          ]),
          // Neither fallback source exposes platform variant ids.
          variantId: null,
          variantTitle: null,
          variants: []
        }
      }
    }
  }

  // Nothing usable — let the caller fall back to the external scraper.
  return {
    url,
    hostname,
    vendorName: mappedVendor ?? titleCaseHost(hostname),
    source: 'none',
    product: null
  }
}
