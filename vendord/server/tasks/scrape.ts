import { defineTask, runTask } from 'nitropack/runtime'
import { useDB } from '../../../server/utils/db'
import { vendors } from '../../../server/utils/schema'
import { recordProductSnapshot } from '../../../server/utils/product-history'
import { setTimeout } from 'timers/promises'
import {
  getBigCommerceToken,
  fetchBigCommerceProducts,
  bigCommerceToUnified
} from '../utils/bigcommerce'

export default defineTask({
  meta: {
    name: 'scrape',
    description: 'Run scraping tasks'
  },
  async run({ payload }) {
    // get all vendors from the database
    const db = useDB()

    const vendorsList = await db.select().from(vendors)

    for (const vendor of vendorsList) {
      try {
        // perform scraping based on vendor type
        if (vendor.type === 'shopify') {
          const shopifyStoreUrl = `https://${vendor.hostname}`
          // paginate through products
          let page = 1
          let hasMore = true

          while (hasMore) {
            const response = await fetch(
              `${shopifyStoreUrl}/products.json?limit=250&page=${page}`
            )
            if (!response.ok) {
              console.error(`Failed to fetch products from ${shopifyStoreUrl}`)
              break
            }
            const data = await response.json()
            const products = data.products

            // store products in productCache
            for (const product of products) {
              await recordProductSnapshot({
                vendorId: vendor.id,
                id: `${vendor.hostname}:${product.handle}`,
                product,
                cacheUpdatedAt: new Date(product.updated_at)
              })
            }

            if (products.length < 250) {
              hasMore = false
            } else {
              page += 1
            }
            await setTimeout(100)
          }
        } else if (vendor.type === 'bigcommerce') {
          try {
            // Get storefront token and cookies
            const { token, cookies } = await getBigCommerceToken(
              vendor.hostname
            )

            // Fetch all products using GraphQL pagination
            const products = await fetchBigCommerceProducts(
              vendor.hostname,
              token,
              cookies
            )

            // Store products in productCache
            for (const product of products) {
              const unified = bigCommerceToUnified(product)
              const productId = `${vendor.hostname}:${unified.handle}`

              await recordProductSnapshot({
                vendorId: vendor.id,
                id: productId,
                product: unified
              })

              await setTimeout(10) // Small delay between inserts
            }

            console.log(
              `Scraped ${products.length} products from BigCommerce store: ${vendor.hostname}`
            )
          } catch (error) {
            console.error(
              `Failed to scrape BigCommerce store ${vendor.hostname}:`,
              error
            )
          }
        } else if (vendor.type === 'amazon') {
          // unimplemented
        }
      } catch (error) {
        console.error(`Error processing vendor ${vendor.hostname}:`, error)
      }
    }
    const { result } = await runTask('meilisearch:sync', { payload })

    return { result }
  }
})
