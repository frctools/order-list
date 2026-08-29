import { parseHTML } from 'linkedom'

// Self-contained product extractor: given a product URL, reach out to the site
// and pull structured details. Tries, in order:
//   1. Shopify  — /products/{handle}.json (most FRC vendors run Shopify)
//   2. JSON-LD  — schema.org/Product in <script type="application/ld+json">
//   3. OpenGraph/meta — og:*, product:price:*, itemprop fallbacks
// No external scraper service or database required.

export interface ExtractedVariant {
  id: string
  sku: string | null
  title: string
  price: number | null
}

export interface ExtractedProduct {
  title: string
  description: string | null
  price: number | null
  currency: string | null
  sku: string | null
  // The platform id of the variant these details describe. `variants` is left
  // empty when there's no real choice to make, so this is the only way to
  // recover the id of a single-variant product (a cart link needs it).
  variantId: string | null
  variantTitle: string | null
  variants: ExtractedVariant[]
}

export interface ExtractionResult {
  url: string
  hostname: string
  vendorName: string
  source: 'shopify' | 'json-ld' | 'opengraph' | 'url' | 'none'
  product: ExtractedProduct | null
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
  { match: 'mcmaster.com', name: 'McMaster-Carr' }
]

// Match a hostname against a bare domain, tolerating www./store. subdomains.
function hostMatches(hostname: string, domain: string): boolean {
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

// ---- URL-only fallback ---------------------------------------------------

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

// ---- Orchestration -------------------------------------------------------

export async function extractPart(
  url: string,
  signal?: AbortSignal
): Promise<ExtractionResult> {
  const urlObj = new URL(url)
  const hostname = urlObj.hostname
  const mappedVendor = friendlyVendorName(hostname)

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

  // 4. Nothing readable came back. For vendors we can decode a URL for, that
  // still beats an empty form — the buyer only has to add the price.
  if (hostMatches(hostname, 'onlinemetals.com')) {
    const product = fromOnlineMetalsUrl(urlObj)
    if (product) {
      return {
        url,
        hostname,
        vendorName: mappedVendor ?? titleCaseHost(hostname),
        source: 'url',
        product
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
