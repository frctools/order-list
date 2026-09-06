import { z } from "zod";
import { useDB } from "../../../server/utils/db";
import { vendors, productCache } from "../../../server/utils/schema";
import {
  generateProductId,
  recordProductSnapshot,
} from "../../../server/utils/product-history";
import { eq } from "drizzle-orm";
import parse from "../../../server/utils/set-cookie-parser";
import { parseHTML } from "linkedom";
import { createError, eventHandler, getHeaders, getQuery } from "h3";
import { titleCase } from "scule";
import {
  bigCommerceToUnified,
  getBigCommerceToken,
  type BigCommerceProduct,
} from "../utils/bigcommerce";

const querySchema = z.object({
  url: z.string().trim().min(1, "URL is required").url("Enter a valid URL"),
});

export default eventHandler(async (event) => {
  const rawQuery = getQuery(event);
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid query",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  const { url } = parsed.data;
  const urlObj = new URL(url);
  const variantId = urlObj.searchParams.get("variant") ?? null;
  const vendor = await useDB().query.vendors.findFirst({
    where: eq(vendors.hostname, urlObj.hostname),
  });

  // Generate product ID and check cache
  const productId = generateProductId(urlObj, vendor?.type);
  const db = useDB();

  const cached = await db.query.productCache.findFirst({
    where: eq(productCache.id, productId),
  });

  if (cached) {
    const cachedData = JSON.parse(cached.productJson);
    return {
      productData: { product: cachedData },
      variantId,
      vendor,
      cached: true,
    };
  }
  const requestHeaders = getHeaders(event);
  const headerOrDefault = (name: string) => {
    const lowerName = name.toLowerCase();
    const raw = requestHeaders[name] ?? requestHeaders[lowerName];
    if (Array.isArray(raw)) {
      return raw.join(", ");
    }
    return raw ?? "";
  };
  const defaultUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";

  if (!vendor) {
    const genericRes = await fetch(url, {
      headers: {
        "User-Agent": headerOrDefault("User-Agent") || defaultUserAgent,
        "Accept-Language": headerOrDefault("Accept-Language"),
        "Accept-Encoding": headerOrDefault("Accept-Encoding"),
        Accept: headerOrDefault("Accept") || "text/html,application/xhtml+xml",
      },
    });
    if (!genericRes.ok) {
      throw createError({
        statusCode: 404,
        statusMessage: "Product not found on vendor site",
      });
    }
    const html = await genericRes.text();
    const { document } = parseHTML(html);

    const getMetaContent = (selectors: string[]) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) {
          continue;
        }
        const attrContent =
          el.getAttribute("content") ?? el.getAttribute("value");
        const raw = attrContent ?? el.textContent;
        if (raw && raw.trim()) {
          return raw.trim();
        }
      }
      return undefined;
    };

    const parsePriceFromString = (value?: string) => {
      if (!value) {
        return undefined;
      }
      const normalized = value.replace(/[^0-9.,]/g, "");
      if (!normalized) {
        return undefined;
      }
      const hasDot = normalized.includes(".");
      const hasComma = normalized.includes(",");
      if (hasComma && !hasDot) {
        return Number(normalized.replace(/,/g, "."));
      }
      return Number(normalized.replace(/,/g, ""));
    };

    const title =
      getMetaContent([
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="title"]',
        "title",
        "h1",
      ]) || urlObj.hostname;
    const description = getMetaContent([
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]',
    ]);
    const imageUrl = getMetaContent([
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[itemprop="image"]',
    ]);
    const priceString = getMetaContent([
      'meta[property="product:price:amount"]',
      'meta[property="og:price:amount"]',
      'meta[itemprop="price"]',
      '[itemprop="price"]',
      ".price",
    ]);
    const currency = getMetaContent([
      'meta[property="product:price:currency"]',
      'meta[itemprop="priceCurrency"]',
      'meta[name="currency"]',
    ]);
    const priceValue = parsePriceFromString(priceString);

    const product: {
      title: string;
      description?: string;
      image?: string;
      price?: number;
      currency?: string;
      variants?: Array<{ id: string; title: string; price?: number }>;
    } = { title };
    if (description) {
      product.description = description;
    }
    if (imageUrl) {
      product.image = imageUrl;
    }
    if (priceValue !== undefined) {
      product.price = priceValue;
    }
    if (currency) {
      product.currency = currency;
    }
    const variants =
      priceValue !== undefined || variantId
        ? [
            {
              id: variantId || "default",
              title: "Default",
              price: priceValue,
            },
          ]
        : [];
    if (variants.length) {
      product.variants = variants;
    }

    const genericVendor = {
      id: urlObj.hostname.split(".").slice(0, -1).join("."),
      name: titleCase(urlObj.hostname.split(".").slice(0, -1).join(".")),
      hostname: urlObj.hostname,
      type: "generic" as const,
    };

    const result = {
      vendor: genericVendor,
      productData: {
        product,
      },
    };

    await recordProductSnapshot({
      id: productId,
      product,
      vendorId: genericVendor.id,
    });

    return {
      ...result,
      variantId,
    };
  }
  if (vendor.type == "shopify") {
    // strip collections from path
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    const productIndex = pathParts.indexOf("products");
    pathParts.splice(0, productIndex);
    const productPath = pathParts.join("/");

    const expectedPrefix = "products/";
    // pull product.json from shopify
    if (productPath.startsWith(expectedPrefix)) {
      const productHandle = productPath.slice(expectedPrefix.length);
      const productJsonUrl = `${urlObj.origin}/products/${productHandle}.json`;

      const res = await fetch(productJsonUrl);
      if (!res.ok) {
        throw createError({
          statusCode: 404,
          statusMessage: "Product not found on vendor site",
        });
      }
      const productData = await res.json();

      const result = {
        vendor,
        productData,
      };

      await recordProductSnapshot({
        id: productId,
        product: productData.product,
        vendorId: vendor.id,
      });

      return {
        ...result,
        variantId,
      };
    }
  }
  if (vendor.type == "bigcommerce") {
    const token = await getBigCommerceToken(vendor.hostname);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      },
    });
    if (!res.ok) {
      throw createError({
        statusCode: 404,
        statusMessage: "Product not found on vendor site",
      });
    }
    const html = await res.text();

    const productIdMatch = html.match(
      /<input type="hidden" name="product_id" value="(\d+)"/,
    );

    if (!token.token || !productIdMatch) {
      throw createError({
        statusCode: 500,
        statusMessage:
          "Could not extract storefront token or product ID from page",
      });
    }
    const setCookies = res.headers.get("set-cookie") || "";
    const cookies = parse(setCookies);
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const STOREFRONT_TOKEN = token.token;
    const graphQlRes = await fetch(`https://${vendor.hostname}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STOREFRONT_TOKEN}`,
        Cookie: cookieString,
      },
      body: JSON.stringify({
        query: `query getProduct($entityId: Int!) {
  site {
    product(entityId: $entityId) {
      entityId
      name
      path
      addToCartUrl
      minPurchaseQuantity
      defaultImage {
        url(width: 80, height: 80)
      }
      availabilityV2 {
        status
        ... on ProductUnavailable {
          message
        }
      }
      prices(includeTax: false, currencyCode: USD) {
        price {
          value
          currencyCode
        }
        salePrice {
          value
          currencyCode
        }
        basePrice {
          value
          currencyCode
        }
        retailPrice {
          value
          currencyCode
        }
        mapPrice {
          value
          currencyCode
        }
      }
      productOptions(first: 50) {
        edges {
          node {
            entityId
            displayName
            isRequired
            ... on MultipleChoiceOption {
              isVariantOption
              displayStyle
              values {
                edges {
                  node {
                    entityId
                    label
                  }
                }
              }
            }
          }
        }
      }
      variants(first: 50) {
        edges {
          node {
            id
            entityId
            sku
            upc
            mpn
            prices {
              price {
                value
              }
            }
            productOptions(first: 5) {
              edges {
                node {
                  entityId
                  displayName
                  isRequired
                  ... on MultipleChoiceOption {
                    isVariantOption
                    displayStyle
                    values {
                      edges {
                        node {
                          entityId
                          label
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`,
        variables: {
          entityId: parseInt(productIdMatch[1], 10),
        },
      }),
    });
    const graphQlData = await graphQlRes.json();

    if (!graphQlRes.ok || !graphQlData.data?.site?.product) {
      console.log(graphQlData);
      throw createError({
        statusCode: 404,
        statusMessage: "Product not found on vendor site",
      });
    }
    const p = graphQlData.data.site.product as BigCommerceProduct;
    const unified = bigCommerceToUnified(p);

    const result = {
      vendor,
      productData: { product: unified },
    };

    await recordProductSnapshot({
      id: productId,
      product: unified,
      vendorId: vendor.id,
    });

    return {
      ...result,
      variantId,
    };
  }
  if (vendor.type == "amazon") {
    // fetch url
    // pass along user agent, accept language, accept encoding headers, accept headers
    const res = await fetch(url, {
      headers: {
        "User-Agent": headerOrDefault("User-Agent") || defaultUserAgent,
        "Accept-Language": headerOrDefault("Accept-Language"),
        "Accept-Encoding": headerOrDefault("Accept-Encoding"),
        Accept: headerOrDefault("Accept"),
      },
    });
    if (!res.ok) {
      throw createError({
        statusCode: 404,
        statusMessage: "Product not found on vendor site",
      });
    }
    const html = await res.text();
    const { document } = parseHTML(html);
    // amazon uses a lot of dynamic content, so we need to parse the html
    // and look for the product title and price
    const titleElement = document.querySelector("#productTitle");
    const priceWhole = document.querySelector(".a-price-whole");
    const priceFraction = document.querySelector(".a-price-fraction");
    if (!titleElement || !priceWhole) {
      throw createError({
        statusCode: 500,
        statusMessage: "Could not extract product data from page",
      });
    }
    const title = titleElement.textContent.trim();
    const price = parseFloat(
      priceWhole.textContent.replace(/[^\d]/g, "") +
        "." +
        (priceFraction
          ? priceFraction.textContent.replace(/[^\d]/g, "")
          : "00"),
    );

    const result = {
      vendor,
      productData: {
        product: {
          title,
          variants: [
            {
              id: "default",
              title: "Default",
              price,
            },
          ],
          price,
        },
      },
    };

    await recordProductSnapshot({
      id: productId,
      product: result.productData.product,
      vendorId: vendor.id,
    });

    return {
      ...result,
      variantId,
    };
  }
  throw createError({
    statusCode: 400,
    statusMessage: "Unsupported vendor type",
  });
});
