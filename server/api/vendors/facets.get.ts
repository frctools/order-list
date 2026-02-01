import { MeiliSearch } from 'meilisearch'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (data) => {
    return z
      .object({
        facet: z.string().default('vendorName'),
      })
      .parse(data)
  })

  const meiliHost = process.env.MEILISEARCH_HOST
  const meiliKey = process.env.MEILISEARCH_API_KEY
  const indexName = process.env.MEILISEARCH_INDEX || 'products'

  if (!meiliHost) {
    throw createError({
      statusCode: 500,
      statusMessage: 'MEILISEARCH_HOST is not configured'
    })
  }

  const client = new MeiliSearch({
    host: meiliHost,
    apiKey: meiliKey
  })

  const index = client.index(indexName)
  const { facetHits } = await index.searchForFacetValues({ facetName: query.facet })
  return facetHits
})
