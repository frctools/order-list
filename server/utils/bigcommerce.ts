// BigCommerce storefronts (REV Robotics, BaneBots).
//
// BigCommerce adds one product per URL — `cart.php?action=add&product_id=…`.
// There is no multi-item equivalent: array parameters are ignored, redirect
// chaining isn't honoured, and `action=addbulk` isn't a real endpoint. Adds do
// accumulate across requests in a session though, so a whole order can be
// built by following one link per part.
//
// The id in that URL is BigCommerce's internal product id, not the vendor's
// part number, so it has to be read off the product page.

const USER_AGENT
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'

// Known BigCommerce storefronts. The platform can't be told from a URL the way
// Shopify's /products/{handle} can, and probing every vendor would cost a
// request, so this stays a list.
export const BIGCOMMERCE_HOSTS = ['revrobotics.com', 'banebots.com']

// The add-to-cart form carries the canonical id exactly once. `data-product-id`
// looks tempting but appears on every related-product tile too — on a REV
// product page there are eighteen of them, and only one is the product you're
// looking at.
const PRODUCT_ID_INPUT
  = /<input[^>]+name=["']product_id["'][^>]*value=["'](\d+)["']/i
const PRODUCT_ID_INPUT_REVERSED
  = /<input[^>]+value=["'](\d+)["'][^>]*name=["']product_id["']/i

// Whether a bare add will succeed can't be told from the page. A product with
// required options bounces back to its own page, but so does one that's out of
// stock, and neither shows up reliably in the markup — REV's SPARK MAX carries
// option fields and adds fine, while the NEO V1.1 carries none and doesn't. So
// no attempt is made to predict it: BigCommerce redirects to the product page
// when it can't add, which is exactly where the buyer needs to be anyway.
export async function fetchBigCommerceProductId(
  url: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    if (!response.ok) return null

    const html = await response.text()
    const match
      = PRODUCT_ID_INPUT.exec(html) ?? PRODUCT_ID_INPUT_REVERSED.exec(html)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export function bigCommerceAddUrl(
  host: string,
  productId: string,
  quantity: number
): string {
  const params = new URLSearchParams({
    action: 'add',
    product_id: productId,
    qty: String(Math.max(1, Math.trunc(quantity)))
  })
  return `https://${host}/cart.php?${params.toString()}`
}

export function bigCommerceCartUrl(host: string): string {
  return `https://${host}/cart.php`
}
