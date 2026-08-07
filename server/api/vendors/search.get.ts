import { Meilisearch } from "meilisearch";
import { z } from "zod";

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (data) => {
    return z
      .object({
        q: z.string().default(""),
        limit: z.coerce.number().min(1).max(100).default(5),
        sort: z
          .enum(["relevance", "price-asc", "price-desc"])
          .optional(),
        vendors: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .transform((val) => {
            if (!val) return [];
            return Array.isArray(val) ? val : [val];
          }),
      })
      .parse(data);
  });

  const meiliHost = process.env.MEILISEARCH_HOST;
  const meiliKey = process.env.MEILISEARCH_API_KEY;
  const indexName = process.env.MEILISEARCH_INDEX || "products";

  if (!meiliHost) {
    throw createError({
      statusCode: 500,
      statusMessage: "MEILISEARCH_HOST is not configured",
    });
  }

  const client = new Meilisearch({
    host: meiliHost,
    apiKey: meiliKey,
  });

  const index = client.index(indexName);

  let filter: string | undefined;
  if (query.vendors.length > 0) {
    filter = query.vendors
      .map((v) => `vendorName = '${v.replace(/'/g, "\\'")}'`)
      .join(" OR ");
  }

  let sort: string[] | undefined;
  if (query.sort === "price-asc") {
    sort = ["price:asc"];
  } else if (query.sort === "price-desc") {
    sort = ["price:desc"];
  }

  if (query.q === "") {
    return {
      hits: [],
      processingTimeMs: 0,
      query: "",
      estimatedTotalHits: 0,
    };
  }

  const searchResults = await index.search(query.q, {
    limit: query.limit,
    filter,
    sort,
    hybrid: {
      embedder: "default",
      semanticRatio: 0.5,
    },
  });

  return {
    hits: searchResults.hits,
    processingTimeMs: searchResults.processingTimeMs,
    query: searchResults.query,
    estimatedTotalHits: searchResults.estimatedTotalHits,
  };
});
