import { defineTask } from "nitropack/runtime";
import { MeiliSearch, MeiliSearchApiError } from "meilisearch";
import { useDB } from "../../../../server/utils/db";
import { productCache, vendors } from "../../../../server/utils/schema";

interface ProductDocument {
  id: string;
  title: string;
  description?: string;
  image?: string;
  price?: number;
  currency?: string;
  vendorId: string;
  vendorName: string;
  vendorHostname?: string;
  vendorType?: string;
  variantId?: string;
  variantTitle?: string;
  skus?: string[];
  originalUrl?: string;
  updatedAt: string;
}

interface TaskResult {
  success: boolean;
  error?: string;
  indexed?: number;
  message?: string;
  taskUids?: number[];
  indexName?: string;
}

// Shopify sends the description as a body_html blob, and it is both indexed
// and rendered by the search page — so tags and entities would otherwise show
// up in results and dilute relevance. No dependency for this: vendord has no
// HTML library and one blob per product does not justify adding one.
function htmlToText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const text = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

// Shopify quotes prices as strings ("19.99"). Meilisearch declares price
// sortable and search.get.ts offers price-asc/price-desc, but sorting strings
// is lexicographic — "119.99" lands between "11.00" and "12.00" — so the sort
// silently returned nonsense. Store a number.
function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default defineTask({
  meta: {
    name: "meilisearch:sync",
    description: "Sync all cached products to Meilisearch",
  },
  async run(): Promise<{ result: TaskResult }> {
    const meiliHost = process.env.MEILISEARCH_HOST;
    const meiliKey = process.env.MEILISEARCH_API_KEY;
    const indexName = process.env.MEILISEARCH_INDEX || "products";

    if (!meiliHost) {
      return {
        result: { success: false, error: "MEILISEARCH_HOST is not configured" },
      };
    }

    const client = new MeiliSearch({
      host: meiliHost,
      apiKey: meiliKey,
    });

    const db = useDB();
    const allProducts = await db.select().from(productCache);
    const allVendors = await db.select().from(vendors);
    if (allProducts.length === 0) {
      return {
        result: { success: true, indexed: 0, message: "No products to index" },
      };
    }

    const documents: ProductDocument[] = allProducts
      .map((cached) => {
        let data;
        try {
          data = JSON.parse(cached.productJson);
        } catch (error) {
          console.error(
            `Failed to parse product JSON for cached product ${cached.id}:`,
            error,
          );
          return undefined;
        }
        const product =
          data.productData?.product || data.productData || data || {};
        const vendor = allVendors.find((v) => v.id === cached.vendorId);
        if (!vendor) {
          return undefined;
        }

        return {
          id: Buffer.from(cached.id).toString("base64").replace(/=/g, ""),
          title: product.title || "Unknown Product",
          description:
            htmlToText(product.description)
            ?? htmlToText(product.body_html)
            ?? "No description",
          image: product.image || product.images?.[0]?.src,
          price: toNumber(product.price ?? product.variants?.[0]?.price),
          currency: product.currency,
          vendorId: cached.vendorId,
          vendorName: vendor.name || cached.vendorId,
          vendorHostname: vendor.hostname,
          vendorType: vendor.type,
          variantId: product.variants?.[0]?.id,
          variantTitle: product.variants?.[0]?.title,
          skus: [
            ...(product.variants?.map(
              (v: Record<string, unknown>) => v.sku || v.id,
            ) || []),
          ],
          updatedAt: cached.updatedAt.toISOString(),
          originalUrl:
            product.url || product.handle
              ? vendor.type === "shopify"
                ? `https://${vendor.hostname}/products/${product.handle}`
                : `https://${vendor.hostname}/${product.handle}`
              : undefined,
        };
      })
      .filter((doc) => doc !== undefined);

    const index = client.index(indexName);
    try {
      await index.fetchInfo();
    } catch (error: unknown) {
      if (
        error instanceof MeiliSearchApiError &&
        error.cause?.code == "index_not_found"
      ) {
        client.createIndex(indexName);
        console.log(`Created index ${indexName}`);
      } else {
        throw error;
      }
    }

    await index.updateSettings({
      searchableAttributes: ["title", "description", "vendorName", "skus"],
      filterableAttributes: [
        "vendorId",
        "vendorName",
        "vendorType",
        "currency",
      ],
      sortableAttributes: ["price", "updatedAt", "title"],
    });

    const chunkSize = 1000;
    const tasks = [];
    for (let i = 0; i < documents.length; i += chunkSize) {
      const chunk = documents.slice(i, i + chunkSize);
      const task = await index.addDocuments(chunk, { primaryKey: "id" });
      tasks.push(task.taskUid);
      await client.tasks.waitForTask(task.taskUid, { timeout: 10000 });
    }

    return {
      result: {
        success: true,
        indexed: documents.length,
        taskUids: tasks,
        indexName,
      },
    };
  },
});
