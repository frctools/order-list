// Playing With Fusion's storefront.
//
// Like BigCommerce, it adds one part at a time — but through a POST rather
// than a link. `POST /addtocart.php` with `qty=N` and `pdids[]=<id>` adds that
// many of one product and redirects to the cart; adds accumulate in the
// session, so following them in turn builds the order up.
//
// Two things that look like they'd work and don't: the same request as a GET
// leaves the cart empty, and passing several `pdids[]` in one POST adds them
// all at the single `qty` value (a `qty[]` array is ignored, and everything
// lands as one each). Per-part quantities therefore need one POST per part.
//
// Unlike BigCommerce, the product id is in the URL — /products/118 — so no
// page fetch is needed to find it.

// Deliberately unanchored. Their own category links append parameters to the
// path rather than a query string — /products/114&catid=1001 — so the id is
// whatever digits follow /products/, not the whole final segment.
const PWF_PRODUCT_PATH = /\/products\/(\d+)/i

export const PLAYING_WITH_FUSION_HOSTS = ['playingwithfusion.com']

export function playingWithFusionProductId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const fromPath = PWF_PRODUCT_PATH.exec(parsed.pathname)?.[1]
    if (fromPath) return fromPath
    // Their older links, still linked from their own pages, name it outright.
    const pdid = parsed.searchParams.get('pdid')?.trim()
    return pdid && /^\d+$/.test(pdid) ? pdid : null
  } catch {
    return null
  }
}

export function playingWithFusionAddUrl(host: string): string {
  return `https://${host}/addtocart.php`
}

export function playingWithFusionAddFields(
  productId: string,
  quantity: number
): Record<string, string> {
  return {
    'qty': String(Math.max(1, Math.trunc(quantity))),
    'pdids[]': productId
  }
}

export function playingWithFusionCartUrl(host: string): string {
  return `https://${host}/viewcart.php`
}
