type VendorDescriptor = {
  hostname: string
  type: string
}

type VendorProvider = {
  matches: (hostname: string) => boolean
  hostnameCandidates: (hostname: string) => string[]
  shopifyOrigin: (vendor: VendorDescriptor) => string
  productHandle: (url: URL) => string | null
  productUrl: (vendor: VendorDescriptor, handle: string) => string
}

const normalizeHostname = (hostname: string) =>
  hostname.toLowerCase().replace(/\.$/, '')

const pathParts = (url: URL) => url.pathname.split('/').filter(Boolean)

const handleAfter = (url: URL, segments: string[]) => {
  const parts = pathParts(url)
  for (const segment of segments) {
    const index = parts.indexOf(segment)
    const handle = parts[index + 1]
    if (index !== -1 && handle) return handle
  }
  return null
}

const defaultProvider: VendorProvider = {
  matches: () => true,
  hostnameCandidates: hostname => [normalizeHostname(hostname)],
  shopifyOrigin: vendor => `https://${vendor.hostname}`,
  productHandle: url => handleAfter(url, ['products']),
  productUrl: (vendor, handle) =>
    `https://${vendor.hostname}/products/${handle}`
}

const swyftHostnames = new Set([
  'swyftrobotics.com',
  'www.swyftrobotics.com',
  'store.swyftrobotics.com',
  'shop.swyftrobotics.com'
])

const swyftProvider: VendorProvider = {
  matches: hostname => swyftHostnames.has(normalizeHostname(hostname)),
  hostnameCandidates: hostname => {
    const normalized = normalizeHostname(hostname)
    return [
      normalized,
      'store.swyftrobotics.com',
      'shop.swyftrobotics.com',
      'swyftrobotics.com',
      'www.swyftrobotics.com'
    ].filter((value, index, values) => values.indexOf(value) === index)
  },
  shopifyOrigin: () => 'https://shop.swyftrobotics.com',
  productHandle: url => {
    const parts = pathParts(url)
    if (parts.length !== 2) return null
    return parts[1] ?? null
  },
  productUrl: (_vendor, handle) =>
    `https://swyftrobotics.com/products/${handle}`
}

const providers = [swyftProvider, defaultProvider]

export function getVendorProvider(hostname: string) {
  return providers.find(provider => provider.matches(hostname))!
}

export function getVendorHostnameCandidates(url: URL) {
  return getVendorProvider(url.hostname).hostnameCandidates(url.hostname)
}

export function getShopifyProductHandle(url: URL) {
  return getVendorProvider(url.hostname).productHandle(url)
}

export function getShopifyOrigin(vendor: VendorDescriptor) {
  return getVendorProvider(vendor.hostname).shopifyOrigin(vendor)
}

export function getProductUrl(vendor: VendorDescriptor, handle: string) {
  return getVendorProvider(vendor.hostname).productUrl(vendor, handle)
}
