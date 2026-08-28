// Build a link to a carrier's own tracking page from a carrier name + number.
// No API needed — the user clicks through to see live status.

const CARRIER_PATTERNS: { match: RegExp, url: (n: string) => string }[] = [
  {
    match: /ups/i,
    url: n => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`
  },
  {
    match: /fedex/i,
    url: n => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`
  },
  {
    match: /usps|postal/i,
    url: n =>
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`
  },
  {
    match: /dhl/i,
    url: n =>
      `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`
  },
  {
    match: /ontrac/i,
    url: n => `https://www.ontrac.com/tracking?number=${encodeURIComponent(n)}`
  },
  {
    match: /canada ?post/i,
    url: n =>
      `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(n)}`
  }
]

export function carrierTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined
): string | null {
  const num = trackingNumber?.trim()
  if (!num) return null
  if (carrier) {
    for (const p of CARRIER_PATTERNS) {
      if (p.match.test(carrier)) return p.url(num)
    }
  }
  // Unknown carrier — a search reliably surfaces the right tracking page.
  const query = ['track', carrier, num].filter(Boolean).join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}
