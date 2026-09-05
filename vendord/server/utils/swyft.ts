import type { UnifiedProduct } from './bigcommerce'

// Swyft Robotics runs a headless Shopify storefront on Next.js, which is why
// it needs its own scraper rather than the shopify branch: the legacy
// endpoints the shopify path depends on are simply not served. /products.json
// and /collections/all/products.json both 404, and the sitemap is the Next.js
// app's own rather than Shopify's, so there are no /products/{handle} URLs in
// it either. Only Shopify's CDN and checkout are still theirs.
//
// What the Next.js app does ship is better than either: every page embeds an
// RSC flight payload carrying complete product objects --
//
//   { id, slug, sku, name, category, description, priceCents, priceIsFrom,
//     image, shopifyProductId, shopifyVariantId, availableForSale,
//     variants: [{ label, priceCents, sku, shopifyVariantId, ... }] }
//
// -- and a page carries not just its own product but every one it links to,
// so 64 page fetches yield the whole catalogue several times over. Products
// are keyed by slug and deduplicated across pages.

const USER_AGENT
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'

// The sitemap lists marketing pages and product pages alike. Product pages
// are the two-segment ones under a storefront section; the leading segment is
// decorative (every prefix resolves to the same product), so it is only used
// to build a link back.
const PRODUCT_PATH
  = /^\/(motion|machines|electrical|structure|tools|kits)\/[^/]+$/

interface SwyftVariant {
  label?: string
  priceCents?: number
  sku?: string
}

interface SwyftProduct {
  slug?: string
  sku?: string
  name?: string
  description?: string
  priceCents?: number
  image?: string
  cardImage?: string
  heroImage?: string
  variants?: SwyftVariant[]
}

// React marks lazy chunk references and absent values with a leading "$"
// ("$undefined", "$3a"), so a raw read of longDescription or subtitle hands
// back a pointer rather than text. Only plain strings are usable here.
function plain(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('$')) return undefined
  return trimmed
}

/** Reassemble the RSC flight payload a Next.js page streams in fragments. */
export function flightBuffer(html: string): string {
  let buffer = ''
  for (const match of html.matchAll(
    /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g
  )) {
    try {
      buffer += JSON.parse(`"${match[1]}"`)
    } catch {
      // A fragment that won't decode costs one product, not the run.
    }
  }
  return buffer
}

// The payload is a React element tree, not a document with a known path to
// the product, so the objects are found by a key only they carry and then
// read out by brace matching from the enclosing "{".
function objectAround(buffer: string, index: number): unknown {
  let depth = 0
  let start = -1
  for (let i = index; i >= 0; i--) {
    const char = buffer[i]
    if (char === '}') depth++
    else if (char === '{') {
      if (depth === 0) {
        start = i
        break
      }
      depth--
    }
  }
  if (start < 0) return null

  depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < buffer.length; i++) {
    const char = buffer[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') inString = !inString
    if (inString) continue
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(buffer.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** Every product object embedded in one page, keyed by slug. */
export function parseSwyftProducts(html: string): Map<string, SwyftProduct> {
  const buffer = flightBuffer(html)
  const found = new Map<string, SwyftProduct>()
  for (const match of buffer.matchAll(/"variants":\[/g)) {
    const node = objectAround(buffer, match.index) as SwyftProduct | null
    if (node?.slug && node.name) found.set(node.slug, node)
  }
  return found
}

function toUnified(
  product: SwyftProduct,
  path: string | undefined
): UnifiedProduct {
  const unified: UnifiedProduct = {
    title: product.name!,
    // sync builds the link as `https://{hostname}/{handle}` for anything that
    // isn't shopify, so the handle carries the section too.
    handle: (path ?? `products/${product.slug}`).replace(/^\//, ''),
    description: plain(product.description) ?? 'no description'
  }

  // The site's headline price, which is what priceCents holds -- not
  // min(variants). They differ where the cheap variants are spare parts: the
  // bumper kit lists at $999.99 with a $19.99 screws-only variant under it,
  // and $999.99 is what the page shows.
  if (typeof product.priceCents === 'number') {
    unified.price = product.priceCents / 100
  }

  const image = plain(product.image) ?? plain(product.heroImage)
    ?? plain(product.cardImage)
  if (image) unified.image = image

  if (product.variants?.length) {
    unified.variants = product.variants.map((variant, index) => ({
      // sync reads `sku || id` off this field for the searchable SKU list, so
      // the part number has to be what lands in it.
      id: plain(variant.sku) ?? `${product.slug}-${index}`,
      title: plain(variant.label) ?? 'Default',
      price:
        typeof variant.priceCents === 'number'
          ? variant.priceCents / 100
          : undefined
    }))
  }

  return unified
}

/**
 * Every product Swyft's storefront links to. Walks the sitemap's product
 * pages and collects the product objects each one embeds.
 */
export async function fetchSwyftProducts(
  hostname: string
): Promise<UnifiedProduct[]> {
  const sitemapRes = await fetch(`https://${hostname}/sitemap.xml`, {
    headers: { 'User-Agent': USER_AGENT }
  })
  if (!sitemapRes.ok) {
    throw new Error(`Failed to fetch Swyft sitemap: ${sitemapRes.status}`)
  }
  const sitemap = await sitemapRes.text()

  const paths: string[] = []
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try {
      const { pathname } = new URL(match[1]!)
      if (PRODUCT_PATH.test(pathname)) paths.push(pathname)
    } catch {
      // Skip anything in the sitemap that isn't a URL.
    }
  }
  if (paths.length === 0) {
    throw new Error('No product pages found in Swyft sitemap')
  }

  // A product's own page is the canonical link for it; one met only as a
  // related product elsewhere keeps the section it was found under, which
  // resolves just as well.
  const pathBySlug = new Map<string, string>()
  for (const path of paths) {
    pathBySlug.set(path.split('/').filter(Boolean).pop()!, path)
  }

  const products = new Map<string, SwyftProduct>()
  const sections = new Map<string, string>()
  for (const path of paths) {
    try {
      const res = await fetch(`https://${hostname}${path}`, {
        headers: { 'User-Agent': USER_AGENT }
      })
      if (!res.ok) continue
      const section = path.split('/').filter(Boolean)[0]!
      for (const [slug, product] of parseSwyftProducts(await res.text())) {
        if (!products.has(slug)) {
          products.set(slug, product)
          sections.set(slug, section)
        }
      }
    } catch {
      // One unreachable page costs its own product only when nothing else
      // links to it; the rest of the catalogue still lands.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  return [...products.entries()].map(([slug, product]) =>
    toUnified(product, pathBySlug.get(slug) ?? `/${sections.get(slug)}/${slug}`)
  )
}
