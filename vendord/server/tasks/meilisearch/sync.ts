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
  taskUid?: number;
  indexName?: string;
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

    const documents: ProductDocument[] = allProducts.map((cached) => {
      const data = JSON.parse(cached.productJson);
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
          product.description || product.body_html || "No description",
        image: product.image || product.images?.[0]?.src,
        price: product.price ?? product.variants?.[0]?.price,
        currency: product.currency,
        vendorId: cached.vendorId,
        vendorName: vendor.name || cached.vendorId,
        vendorHostname: vendor.hostname,
        vendorType: vendor.type,
        variantId: product.variants?.[0]?.id,
        variantTitle: product.variants?.[0]?.title,
        skus: [...(product.variants.map((v: any) => v.sku || v.id) || [])],
        updatedAt: cached.updatedAt.toISOString(),
        originalUrl:
          product.url || product.handle
            ? vendor.type === "shopify"
              ? `https://${vendor.hostname}/products/${product.handle}`
              : `https://${vendor.hostname}/${product.handle}`
            : undefined,
      };
    }).filter((doc) => doc !== undefined);

    const index = client.index(indexName);
    try {
      await index.fetchInfo();
    } catch (error: any) {
      if (
        error instanceof MeiliSearchApiError &&
        error.cause?.code == "index_not_found"
      ) {
        client.createIndex(indexName);
        console.log(`Created index ${index}`);
      } else {
        throw error;
      }
    }

    await index.updateSettings({
      searchableAttributes: ["title", "description", "vendorName", "skus"],
      filterableAttributes: ["vendorId", "vendorType", "currency"],
      sortableAttributes: ["price", "updatedAt", "title"],
    });

    const task = await index.addDocuments(documents, { primaryKey: "id" });

    await client.tasks.waitForTask(task.taskUid);

    return {
      result: {
        success: true,
        indexed: documents.length,
        taskUid: task.taskUid,
        indexName,
      },
    };
  },
});
