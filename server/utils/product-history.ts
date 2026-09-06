import { useDB } from './db'
import { productCache, productSnapshots } from './schema'

type ProductRecord = Record<string, unknown>

function asRecord(value: unknown): ProductRecord | null {
  return value !== null && typeof value === 'object'
    ? (value as ProductRecord)
    : null
}

function parseNumericPrice(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function parseQuantity(value: unknown) {
  const parsed = parseNumericPrice(value)
  return parsed === null ? null : Math.max(0, Math.round(parsed))
}

function firstString(...values: unknown[]) {
  return values.find(value => typeof value === 'string' && value.trim()) as
    | string
    | undefined
}

function imageUrl(value: unknown) {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  return firstString(record?.src, record?.url)
}

function quantityFromRecord(record: ProductRecord | null) {
  if (!record) return null
  return parseQuantity(
    record.stockQuantity
    ?? record.stock_quantity
    ?? record.inventoryQuantity
    ?? record.inventory_quantity
    ?? record.quantityAvailable
    ?? record.quantity_available
    ?? record.availableToSell
    ?? record.available_to_sell
  )
}

export function summarizeProduct(product: unknown) {
  const record = asRecord(product) ?? {}
  const variants = Array.isArray(record.variants) ? record.variants : []
  const firstVariant = asRecord(variants[0])
  const prices = asRecord(record.prices)
  const priceRecord = asRecord(prices?.price)
  const price =
    parseNumericPrice(record.price)
    ?? parseNumericPrice(firstVariant?.price)
    ?? parseNumericPrice(priceRecord?.value)
  const currency =
    (typeof record.currency === 'string' && record.currency)
    || (typeof priceRecord?.currencyCode === 'string'
      && priceRecord.currencyCode)
    || null
  const directQuantity = quantityFromRecord(record)
  const variantQuantities = variants
    .map(variant => quantityFromRecord(asRecord(variant)))
    .filter((quantity): quantity is number => quantity !== null)
  const stockQuantity = directQuantity
    ?? (variantQuantities.length > 0
      ? variantQuantities.reduce((total, quantity) => total + quantity, 0)
      : null)

  return {
    priceCents: price === null ? null : Math.round(price * 100),
    currency,
    stockQuantity
  }
}

export function normalizeProduct(product: unknown) {
  const record = asRecord(product) ?? {}
  const summary = summarizeProduct(record)
  const images = Array.isArray(record.images) ? record.images : []
  const variants = Array.isArray(record.variants) ? record.variants : []

  return {
    title: firstString(record.title, record.name) ?? 'Product',
    description: firstString(
      record.description,
      record.body_html,
      record.plainTextDescription
    ) ?? null,
    image: imageUrl(record.image)
      ?? imageUrl(record.defaultImage)
      ?? imageUrl(images[0])
      ?? null,
    priceCents: summary.priceCents,
    currency: summary.currency,
    stockQuantity: summary.stockQuantity,
    availability: firstString(
      record.availability,
      asRecord(record.availabilityV2)?.status
    ) ?? null,
    variants: variants.map((value) => {
      const variant = asRecord(value) ?? {}
      const variantPrice = parseNumericPrice(
        variant.price ?? asRecord(asRecord(variant.prices)?.price)?.value
      )
      return {
        id: firstString(variant.id, variant.sku) ?? null,
        title: firstString(variant.title, variant.name) ?? 'Default',
        priceCents: variantPrice === null
          ? null
          : Math.round(variantPrice * 100),
        stockQuantity: quantityFromRecord(variant)
      }
    })
  }
}

export function generateProductId(url: URL, vendorType?: string | null) {
  if (vendorType === 'shopify') {
    const parts = url.pathname.split('/').filter(Boolean)
    const productIndex = parts.indexOf('products')
    const handle = parts[productIndex + 1]
    if (productIndex !== -1 && handle) {
      return `${url.hostname}:${handle}`
    }
  }

  const cleanPath = url.pathname.replace(/^\/|\/$/g, '') || '/'
  return `${url.hostname}:${cleanPath}`
}

export async function recordProductSnapshot(input: {
  id: string
  vendorId: string
  product: unknown
  cacheUpdatedAt?: Date
  capturedAt?: Date
}) {
  const db = useDB()
  const productJson =
    typeof input.product === 'string'
      ? input.product
      : JSON.stringify(input.product)
  const parsedProduct =
    typeof input.product === 'string'
      ? (() => {
          try {
            return JSON.parse(input.product)
          } catch {
            return input.product
          }
        })()
      : input.product
  const summary = summarizeProduct(parsedProduct)
  const capturedAt = input.capturedAt ?? new Date()

  await db.transaction(async (tx) => {
    await tx
      .insert(productCache)
      .values({
        id: input.id,
        vendorId: input.vendorId,
        productJson,
        updatedAt: input.cacheUpdatedAt ?? capturedAt
      })
      .onConflictDoUpdate({
        target: productCache.id,
        set: {
          vendorId: input.vendorId,
          productJson,
          updatedAt: input.cacheUpdatedAt ?? capturedAt
        }
      })

    await tx.insert(productSnapshots).values({
      id: crypto.randomUUID(),
      productId: input.id,
      vendorId: input.vendorId,
      priceCents: summary.priceCents,
      stockQuantity: summary.stockQuantity,
      currency: summary.currency,
      capturedAt
    })
  })
}
