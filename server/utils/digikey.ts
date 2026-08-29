// DigiKey Product Information API v4.
//
// DigiKey product pages sit behind a bot challenge, so the page itself can't
// be read from a Worker. Their API is the sanctioned route and returns better
// data than the page would anyway — description, stock, and the quantity
// price breaks that matter when a team buys fifty of a connector.
//
// Credentials are optional: with none set, callers fall back to the
// URL-derived name and SKU.

import type {
  ExtractedProduct,
  ExtractedVariant,
  PriceBreak
} from './part-extractor'

const TOKEN_PATH = '/v1/oauth2/token'
const PRODUCT_PATH = '/products/v4/search'

// Tokens last ten minutes. Re-fetch a little early so a request can't set off
// with one that expires mid-flight.
const TOKEN_EXPIRY_MARGIN_MS = 30_000

interface CachedToken {
  value: string
  expiresAt: number
}

// Per-isolate, which is all a Worker can keep. Worst case each isolate spends
// one extra token request.
let cachedToken: CachedToken | null = null

function credentials(): { id: string, secret: string, base: string } | null {
  const id = process.env.DIGIKEY_CLIENT_ID?.trim()
  const secret = process.env.DIGIKEY_CLIENT_SECRET?.trim()
  if (!id || !secret) return null
  const base = (
    process.env.DIGIKEY_API_BASE?.trim() || 'https://api.digikey.com'
  ).replace(/\/+$/, '')
  return { id, secret, base }
}

export function isDigiKeyConfigured(): boolean {
  return credentials() !== null
}

async function accessToken(signal?: AbortSignal): Promise<string | null> {
  const creds = credentials()
  if (!creds) return null
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  const response = await fetch(`${creds.base}${TOKEN_PATH}`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.id,
      client_secret: creds.secret,
      grant_type: 'client_credentials'
    })
  })
  if (!response.ok) return null

  const payload = (await response.json()) as {
    access_token?: string
    expires_in?: number
  }
  if (!payload.access_token) return null

  cachedToken = {
    value: payload.access_token,
    expiresAt:
      Date.now() + (payload.expires_in ?? 600) * 1000 - TOKEN_EXPIRY_MARGIN_MS
  }
  return cachedToken.value
}

interface DigiKeyPricing {
  BreakQuantity?: number
  UnitPrice?: number
}

interface DigiKeyVariation {
  DigiKeyProductNumber?: string
  PackageType?: { Name?: string }
  StandardPricing?: DigiKeyPricing[]
}

interface DigiKeyProduct {
  Description?: { ProductDescription?: string, DetailedDescription?: string }
  Manufacturer?: { Name?: string }
  ManufacturerProductNumber?: string
  UnitPrice?: number
  ProductVariations?: DigiKeyVariation[]
  QuantityAvailable?: number
  ProductStatus?: { Status?: string }
}

// Quantity discount tiers, ascending, so the editor can re-price a line when
// its quantity reaches the next break.
function priceBreaks(variation: DigiKeyVariation | undefined): PriceBreak[] {
  return (variation?.StandardPricing ?? [])
    .filter(
      (tier): tier is { BreakQuantity: number, UnitPrice: number } =>
        typeof tier.BreakQuantity === 'number'
        && typeof tier.UnitPrice === 'number'
        && tier.BreakQuantity > 0
    )
    .map(tier => ({ quantity: tier.BreakQuantity, unitPrice: tier.UnitPrice }))
    .sort((a, b) => a.quantity - b.quantity)
}

function toExtractedProduct(product: DigiKeyProduct): ExtractedProduct | null {
  const mpn = product.ManufacturerProductNumber?.trim()
  if (!mpn) return null

  const manufacturer = product.Manufacturer?.Name?.trim()
  const variations = product.ProductVariations ?? []

  // A variation is a packaging option (Tube, Cut Tape, Digi-Reel); its
  // DigiKey part number is what actually gets ordered.
  const variants: ExtractedVariant[] = variations
    .filter(variation => variation.DigiKeyProductNumber)
    .map(variation => ({
      id: variation.DigiKeyProductNumber!,
      sku: null,
      title: variation.PackageType?.Name?.trim() || variation.DigiKeyProductNumber!,
      price: variation.StandardPricing?.[0]?.UnitPrice ?? null
    }))

  const detail = product.Description?.DetailedDescription?.trim()
    || product.Description?.ProductDescription?.trim()
    || null
  const breaks = priceBreaks(variations[0])
  const status = product.ProductStatus?.Status?.trim()

  return {
    title: manufacturer ? `${manufacturer} ${mpn}` : mpn,
    description: detail,
    // The qty-1 price, matching what the product page leads with.
    price: product.UnitPrice ?? variants[0]?.price ?? null,
    currency: 'USD',
    // The manufacturer part number is what a BOM is written against.
    sku: mpn,
    variantId: variations[0]?.DigiKeyProductNumber ?? null,
    variantTitle:
      status && status !== 'Active'
        ? status
        : variations[0]?.PackageType?.Name?.trim() ?? null,
    // Only offer a picker when there's a real packaging choice to make.
    variants: variants.length > 1 ? variants : [],
    priceBreaks: breaks.length > 1 ? breaks : undefined
  }
}

export async function fetchDigiKeyProduct(
  manufacturerPartNumber: string,
  signal?: AbortSignal
): Promise<ExtractedProduct | null> {
  const creds = credentials()
  if (!creds) return null

  try {
    const token = await accessToken(signal)
    if (!token) return null

    const response = await fetch(
      `${creds.base}${PRODUCT_PATH}/${encodeURIComponent(
        manufacturerPartNumber
      )}/productdetails`,
      {
        signal,
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-DIGIKEY-Client-Id': creds.id,
          'X-DIGIKEY-Locale-Site': 'US',
          'X-DIGIKEY-Locale-Language': 'en',
          'X-DIGIKEY-Locale-Currency': 'USD',
          'accept': 'application/json'
        }
      }
    )
    if (!response.ok) {
      // A stale token reads as 401; drop it so the next attempt re-fetches.
      if (response.status === 401) cachedToken = null
      return null
    }

    const payload = (await response.json()) as { Product?: DigiKeyProduct }
    return payload.Product ? toExtractedProduct(payload.Product) : null
  } catch {
    // Unreachable, timed out, or malformed — the caller falls back.
    return null
  }
}
