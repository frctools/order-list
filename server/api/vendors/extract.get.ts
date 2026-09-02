import { z } from 'zod'
import { digiKeyPartFromUrl, extractPart } from '../../utils/part-extractor'
import { fetchDigiKeyProduct, isDigiKeyConfigured } from '../../utils/digikey'
import {
  fetchVendordProduct,
  shouldDelegateToScraper,
  toExtractionResult
} from '../../utils/vendord'
import { fetchOptionGroups, isWcpHost } from '../../utils/wcp-dpo'
import { requireOrganizationContext } from '../../utils/session'

// Reject URLs that point at the loopback/link-local/private ranges so this
// endpoint can't be turned into an SSRF proxy against internal services.
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true
  if (/^127\./.test(host)) return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^169\.254\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  return false
}

export default defineEventHandler(async (event) => {
  // Only authenticated org members may trigger outbound fetches.
  await requireOrganizationContext(event)

  const { url } = await getValidatedQuery(event, data =>
    z
      .object({
        url: z
          .string()
          .trim()
          .url('Enter a valid URL')
          .refine(
            (value) => {
              try {
                const parsed = new URL(value)
                return (
                  (parsed.protocol === 'http:'
                    || parsed.protocol === 'https:')
                  && !isBlockedHost(parsed.hostname)
                )
              } catch {
                return false
              }
            },
            { message: 'URL is not allowed' }
          )
      })
      .parse(data)
  )

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  try {
    // DigiKey publishes an API, which beats anything readable off the page —
    // and their pages refuse Workers anyway.
    const digiKeyPart = digiKeyPartFromUrl(url)
    if (digiKeyPart && isDigiKeyConfigured()) {
      const product = await fetchDigiKeyProduct(
        digiKeyPart.mpn,
        controller.signal
      )
      if (product) {
        return {
          url,
          hostname: new URL(url).hostname,
          vendorName: 'DigiKey',
          source: 'digikey' as const,
          product
        }
      }
    }

    // Some vendors refuse requests from the Worker outright, so go through the
    // scraper service first rather than burning the timeout on a refusal. If
    // it's down or blocked in turn, extractPart still has its own fallbacks.
    const { hostname } = new URL(url)
    if (shouldDelegateToScraper(hostname)) {
      const scraped = await fetchVendordProduct(url, controller.signal)
      const mapped = scraped ? toExtractionResult(url, hostname, scraped) : null
      if (mapped) return mapped
    }

    const result = await extractPart(url, controller.signal)

    // WCP's configurator pages are indistinguishable from ordinary products
    // through Shopify's API — one "Default Title" variant, a real-looking
    // "from" price — so reading one yields a category ("Imperial Bearings")
    // that looks like a successful extraction. Ask DPO for the parts it
    // actually offers.
    //
    // A genuine WCP part carries its own SKU, so only a SKU-less product is
    // a candidate. That keeps the common case — a link straight to
    // /products/wcp-2059 — at zero extra requests.
    if (
      result.source === 'shopify'
      && isWcpHost(result.hostname)
      && result.product
      && !result.product.sku
      && result.product.productId
    ) {
      const optionGroups = await fetchOptionGroups(
        result.product.productId,
        result.product.variantId,
        controller.signal
      )
      if (optionGroups) return { ...result, optionGroups }
    }

    return result
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not reach the product page'
    })
  } finally {
    clearTimeout(timeout)
  }
})
