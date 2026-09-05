import parse from '../../../server/utils/set-cookie-parser'

export interface BigCommerceProduct {
  entityId: number
  name: string
  plainTextDescription?: string
  path: string
  addToCartUrl?: string
  minPurchaseQuantity?: number
  defaultImage?: {
    url: string
  }
  availabilityV2?: {
    status: string
    message?: string
  }
  prices?: {
    price?: { value: number, currencyCode: string }
    salePrice?: { value: number, currencyCode: string }
    basePrice?: { value: number, currencyCode: string }
    retailPrice?: { value: number, currencyCode: string }
    mapPrice?: { value: number, currencyCode: string }
  }
  productOptions?: {
    edges: Array<{
      node: {
        entityId: number
        displayName: string
        isRequired: boolean
        isVariantOption?: boolean
        displayStyle?: string
        values?: {
          edges: Array<{
            node: {
              entityId: number
              label: string
            }
          }>
        }
      }
    }>
  }
  variants?: {
    edges: Array<{
      node: {
        id: string
        entityId: number
        sku: string
        upc?: string
        mpn?: string
        prices?: {
          price?: { value: number }
        }
        productOptions?: {
          edges: Array<{
            node: {
              entityId: number
              displayName: string
              isRequired: boolean
              isVariantOption?: boolean
              displayStyle?: string
              values?: {
                edges: Array<{
                  node: {
                    entityId: number
                    label: string
                  }
                }>
              }
            }
          }>
        }
      }
    }>
  }
}

export interface UnifiedProduct {
  title: string
  handle: string
  description?: string
  price?: number
  image?: string
  variants?: Array<{
    id: string
    title: string
    price?: number
  }>
}

/**
 * Extract BigCommerce storefront token and cookies from a page
 */
export async function getBigCommerceToken(hostname: string): Promise<{
  token: string
  cookies: string
}> {
  const res = await fetch(`https://${hostname}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
    }
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch BigCommerce store: ${res.status}`)
  }

  const html = await res.text()
  const tokenMatch = html.match(/"graphQLToken\\":\\"([^"]+)\\"/)

  if (!tokenMatch) {
    // Not every BigCommerce store exposes one. The token is a Stencil theme
    // feature, and a server-rendered storefront that never calls the GraphQL
    // API has no reason to embed it — goBILDA, ServoCity and BaneBots are all
    // like this, on every template (home, cart, login, search), and their
    // /graphql answers "credentials were missing" to an anonymous request.
    // There is nothing to hunt for on those; they would need a different
    // scraper built on their product sitemap (/xmlsitemap.php?type=products).
    throw new Error(
      `No storefront GraphQL token on ${hostname} — this store does not `
      + `expose one, so it cannot be scraped through the GraphQL API`
    )
  }

  const setCookies = res.headers.get('set-cookie') || ''
  const cookies = parse(setCookies)
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ')

  return {
    token: tokenMatch[1],
    cookies: cookieString
  }
}

/**
 * Convert BigCommerce product data to unified format
 */
export function bigCommerceToUnified(
  product: BigCommerceProduct
): UnifiedProduct {
  const unified: UnifiedProduct = {
    title: product.name,
    handle: product.path?.replace(/^\//, '') || String(product.entityId),
    description: product.plainTextDescription || 'no description'
  }

  if (product.prices?.basePrice?.value !== undefined) {
    unified.price = product.prices.basePrice.value
  } else if (product.prices?.price?.value !== undefined) {
    unified.price = product.prices.price.value
  }

  if (product.defaultImage?.url) {
    unified.image = product.defaultImage.url
  }

  if (product.variants?.edges?.length) {
    unified.variants = product.variants.edges.map(edge => ({
      id: edge.node.sku || String(edge.node.entityId),
      title:
        edge.node.productOptions?.edges?.[0]?.node.values?.edges?.[0]?.node
          .label || 'Default',
      price: edge.node.prices?.price?.value
    }))
  }

  return unified
}

/**
 * GraphQL query for paginating BigCommerce products
 */
export const BIGCOMMERCE_PRODUCTS_QUERY = `
query paginateProducts(
  $pageSize: Int = 250
  $cursor: String
) {
  site {
    products(first: $pageSize, after: $cursor) {
      pageInfo {
        startCursor
        endCursor
        hasNextPage
      }
      edges {
        cursor
        node {
          entityId
          name
          plainTextDescription
          path
          addToCartUrl
          minPurchaseQuantity
          defaultImage {
            # BigCommerce resizes on their CDN, so the size asked for here is
            # the size stored and the size the search page renders. 80x80 was
            # the thumbnail the list view wants, but the grid view shows the
            # same URL in an aspect-square card several times that wide, where
            # it came out visibly blurry.
            url(width: 640, height: 640)
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
    }
  }
}
`

/**
 * Fetch all products from a BigCommerce store using GraphQL pagination
 */
export async function fetchBigCommerceProducts(
  hostname: string,
  token: string,
  cookies: string
): Promise<BigCommerceProduct[]> {
  const products: BigCommerceProduct[] = []
  let cursor: string | null = null
  let hasNextPage = true

  while (hasNextPage) {
    const res: Response = await fetch(`https://${hostname}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Cookie': cookies
      },
      body: JSON.stringify({
        query: BIGCOMMERCE_PRODUCTS_QUERY,
        variables: {
          pageSize: 50,
          cursor
        }
      })
    })

    if (!res.ok) {
      throw new Error(`BigCommerce GraphQL request failed: ${res.status}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()

    if (data.errors) {
      throw new Error(
        `BigCommerce GraphQL errors: ${JSON.stringify(data.errors)}`
      )
    }

    const siteProducts = data.data?.site?.products
    if (!siteProducts) {
      break
    }

    for (const edge of siteProducts.edges || []) {
      products.push(edge.node)
    }

    hasNextPage = siteProducts.pageInfo?.hasNextPage ?? false
    cursor = siteProducts.pageInfo?.endCursor ?? null
  }

  return products
}
