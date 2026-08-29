// Talking to the `vendord` scraper service.
//
// vendord runs outside the Worker on a normal host, so it can reach vendors
// whose sites refuse requests coming from Workers — the reason some product
// lookups have to be delegated rather than fetched in-process. In production
// it's reached through the VPC service binding; in dev it's a local process.

import type { Fetcher } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { hostMatches, vendorDisplayName } from './part-extractor'
import type {
  ExtractedVariant,
  ExtractionResult
} from './part-extractor'

const VENDORD_ORIGIN = {
  production: 'http://localhost:3434',
  development: 'http://localhost:3001'
}

// Vendors that sit behind a bot challenge, so a direct fetch from the Worker
// only ever returns an interstitial. These go to vendord first instead of
// wasting a round trip on a request we know will be refused.
const DELEGATED_HOSTS = ['onlinemetals.com', 'digikey.com', 'digikey.ca']

export function shouldDelegateToScraper(hostname: string): boolean {
  return DELEGATED_HOSTS.some(domain => hostMatches(hostname, domain))
}

type SimpleFetch = (
  input: string,
  init?: { headers?: Record<string, string>, signal?: AbortSignal }
) => Promise<{ ok: boolean, json: () => Promise<unknown> }>

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
  event: H3Event,
  url: string,
  signal?: AbortSignal
): Promise<VendordResponse | null> {
  const binding = event.context.cloudflare?.env?.VPC_SERVICE as
    | Fetcher
    | undefined
  // The binding's fetch and the global one have incompatible RequestInit
  // types; narrow to the little we actually use rather than unioning them.
  const fetchFn = (
    !import.meta.dev && binding ? binding.fetch.bind(binding) : globalThis.fetch
  ) as unknown as SimpleFetch

  const target = new URL(
    import.meta.dev ? VENDORD_ORIGIN.development : VENDORD_ORIGIN.production
  )
  target.searchParams.set('url', url)

  try {
    // Only what the scraper needs to look like a browser to the vendor —
    // never the caller's cookies or authorization.
    const response = await fetchFn(target.toString(), {
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
