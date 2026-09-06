import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { createError, defineEventHandler, getQuery } from 'h3'
import { z } from 'zod'
import { useDB } from '../../utils/db'
import {
  generateProductId,
  normalizeProduct
} from '../../utils/product-history'
import { productCache, productSnapshots, vendors } from '../../utils/schema'
import { getVendorHostnameCandidates } from '../../utils/vendor-providers'

const historyQuerySchema = z
  .object({
    productId: z.string().trim().min(1).optional(),
    url: z.string().url().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(250).default(100)
  })
  .refine(value => value.productId || value.url, {
    message: 'Provide a productId or URL'
  })

export default defineEventHandler(async (event) => {
  const parsed = historyQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid history query'
    })
  }

  const db = useDB()
  let productId = parsed.data.productId
  if (!productId && parsed.data.url) {
    const url = new URL(parsed.data.url)
    const vendorHostnames = getVendorHostnameCandidates(url)
    const matchingVendors = await db.query.vendors.findMany({
      where: inArray(vendors.hostname, vendorHostnames)
    })
    const vendor =
      matchingVendors.find(item => item.hostname === url.hostname)
      ?? matchingVendors.find(item => item.hostname === vendorHostnames[1])
      ?? matchingVendors[0]
    productId = generateProductId(url, vendor?.type, vendor?.hostname)
  }

  const filters = [eq(productSnapshots.productId, productId!)]
  if (parsed.data.from) {
    filters.push(gte(productSnapshots.capturedAt, parsed.data.from))
  }
  if (parsed.data.to) {
    filters.push(lte(productSnapshots.capturedAt, parsed.data.to))
  }

  const rows = await db
    .select()
    .from(productSnapshots)
    .where(and(...filters))
    .orderBy(desc(productSnapshots.capturedAt))
    .limit(parsed.data.limit)

  const current = await db.query.productCache.findFirst({
    where: eq(productCache.id, productId!)
  })

  const vendor = current
    ? await db.query.vendors.findFirst({
        where: eq(vendors.id, current.vendorId)
      })
    : null

  const parseProduct = (value: string) => {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  return {
    productId,
    sourceUrl: parsed.data.url ?? null,
    vendor: current
      ? {
          id: current.vendorId,
          name: vendor?.name ?? current.vendorId,
          hostname: vendor?.hostname ?? productId!.split(':')[0] ?? null,
          type: vendor?.type ?? null
        }
      : null,
    product: current ? normalizeProduct(parseProduct(current.productJson)) : null,
    updatedAt: current?.updatedAt ?? null,
    observations: rows.reverse().map(row => ({
      id: row.id,
      priceCents: row.priceCents,
      stockQuantity: row.stockQuantity,
      currency: row.currency,
      capturedAt: row.capturedAt
    }))
  }
})
