import { vendordUrl } from '../../utils/vendord'

// Proxies a product lookup to the vendord scraper running alongside the app.
// It used to reach it through a Cloudflare VPC service binding; on a droplet
// vendord is simply another process on localhost.
export default defineEventHandler(async (event) => {
  const url = getQuery(event).url as string
  if (!url) {
    throw createError({ statusCode: 400, statusMessage: 'URL is required' })
  }

  // Only what the scraper needs to look like a browser to the vendor — not
  // the caller's cookies.
  return fetch(vendordUrl(url), {
    headers: {
      'user-agent':
        getHeader(event, 'user-agent')
        ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'accept': 'application/json'
    }
  })
})
