// Talking to the `vendord` scraper service.
//
// vendord runs as its own process alongside the app, listening on localhost.
// It exists because some vendors refuse requests from the app's own runtime,
// so those product lookups get delegated to it instead.
//
// VENDORD_URL overrides where it lives; the default matches running it on the
// same droplet.

import { hostMatches, vendorDisplayName } from './part-extractor'
import type {
  ExtractedVariant,
  ExtractionResult
} from './part-extractor'

const VENDORD_ORIGIN = process.env.VENDORD_URL
  ?? (import.meta.dev ? 'http://localhost:3001' : 'http://localhost:3434')

// Vendors that sit behind a bot challenge, so a direct fetch from the Worker
// only ever returns an interstitial. These go to vendord first instead of
// wasting a round trip on a request we know will be refused.
const DELEGATED_HOSTS = ['onlinemetals.com']

export function shouldDelegateToScraper(hostname: string): boolean {
  return DELEGATED_HOSTS.some(domain => hostMatches(hostname, domain))
}

export function vendordUrl(productUrl: string): string {
  const target = new URL(VENDORD_ORIGIN)
  target.searchParams.set('url', productUrl)
  return target.toString()
}

export interface VendordVariant {
  id: string
  title: string
  price?: number
}

export interface VendordProduct {
  title?: string
  description?: string
  image?: string
  price?: number
  currency?: string
  variants?: VendordVariant[]
}

export interface VendordResponse {
  productData?: { product?: VendordProduct | null } | null
  variantId?: string | null
  vendor?: { id: string, name: string, hostname: string, type: string } | null
}

export async function fetchVendordProduct(
  url: string,
  signal?: AbortSignal
): Promise<VendordResponse | null> {
  const target = vendordUrl(url)

  try {
    // Only what the scraper needs to look like a browser to the vendor —
    // never the caller's cookies or authorization.
    const response = await fetch(target, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          + '(KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'accept': 'application/json'
      },
      signal
    })
    if (!response.ok) return null
    return (await response.json()) as VendordResponse
  } catch {
    // Scraper down, unreachable, or blocked in turn — the caller falls back.
    return null
  }
}

// Reshape a scraper response into the same result the in-Worker extractor
// returns, so callers don't care which route the details came from.
export function toExtractionResult(
  url: string,
  hostname: string,
  response: VendordResponse
): ExtractionResult | null {
  const product = response.productData?.product
  const title = product?.title?.trim()
  if (!product || !title) return null

  // vendord writes "default" when it couldn't resolve a real variant.
  const variants: ExtractedVariant[] = (product.variants ?? [])
    .filter(variant => variant.id && variant.id !== 'default')
    .map(variant => ({
      id: variant.id,
      sku: null,
      title: variant.title?.trim() || title,
      price: variant.price ?? null
    }))

  // The scraper echoes back the ?variant= the link asked for; on sites where
  // that value is the orderable code (Online Metals' cut lengths) it's the
  // most useful thing to carry onto the order.
  const requestedVariant = response.variantId?.trim() || null
  const selected = requestedVariant
    ? variants.find(variant => variant.id === requestedVariant)
    : undefined

  return {
    url,
    hostname,
    vendorName: response.vendor?.name?.trim() || vendorDisplayName(hostname),
    source: 'scraper',
    product: {
      title,
      description: product.description?.trim() || null,
      price: selected?.price ?? product.price ?? null,
      currency: product.currency ?? 'USD',
      sku: requestedVariant,
      variantId: requestedVariant,
      variantTitle: selected?.title ?? null,
      variants: variants.length > 1 ? variants : []
    }
  }
}
