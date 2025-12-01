import { MeiliSearch } from 'meilisearch'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const searchTerm = query.q as string
  const limit = Math.min(Math.max(Number(query.limit) || 5, 1), 100)
  if (!searchTerm) {
    return {
      hits: [],
      processingTimeMs: 0,
      query: ''
    }
  }
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
  const searchResults = await index.search(searchTerm, {
    limit,
    hybrid: {
      embedder: 'default',
      semanticRatio: 0.5
    }
  })

  return {
    hits: searchResults.hits,
    processingTimeMs: searchResults.processingTimeMs,
    query: searchResults.query
  }
})
