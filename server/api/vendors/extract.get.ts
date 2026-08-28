import { z } from 'zod'
import { extractPart } from '../../utils/part-extractor'
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
    return await extractPart(url, controller.signal)
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not reach the product page'
    })
  } finally {
    clearTimeout(timeout)
  }
})
