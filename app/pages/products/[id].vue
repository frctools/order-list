<script setup lang="ts">
definePageMeta({ layout: 'default' })

type ProductDetails = {
  title: string
  description: string | null
  image: string | null
  priceCents: number | null
  currency: string | null
  stockQuantity: number | null
  availability: string | null
  variants: Array<{
    id: string | null
    title: string
    priceCents: number | null
    stockQuantity: number | null
  }>
}

type ProductHistoryResponse = {
  productId: string
  sourceUrl: string | null
  vendor: {
    id: string
    name: string
    hostname: string | null
    type: string | null
  } | null
  product: ProductDetails | null
  updatedAt: string | null
  observations: Array<{
    id: string
    priceCents: number | null
    stockQuantity: number | null
    currency: string | null
    capturedAt: string
  }>
}

const route = useRoute()
const sourceUrl = computed(() =>
  typeof route.query.url === 'string' ? route.query.url : undefined
)
const productId = computed(() =>
  typeof route.query.productId === 'string'
    ? route.query.productId
    : undefined
)

const { data, status, error, refresh } = await useFetch<ProductHistoryResponse>(
  '/api/vendors/history',
  {
    query: computed(() => ({
      url: sourceUrl.value,
      productId: productId.value
    }))
  }
)

const product = computed(() => data.value?.product ?? null)
const cleanDescription = computed(() =>
  (product.value?.description ?? '').replace(/<[^>]*>?/gm, '').trim()
)
const pricePoints = computed(() =>
  (data.value?.observations ?? [])
    .filter(item => item.priceCents !== null)
    .map(item => ({ timestamp: item.capturedAt, value: item.priceCents! }))
)
const stockPoints = computed(() =>
  (data.value?.observations ?? [])
    .filter(item => item.stockQuantity !== null)
    .map(item => ({ timestamp: item.capturedAt, value: item.stockQuantity! }))
)
const recentObservations = computed(() =>
  [...(data.value?.observations ?? [])].reverse().slice(0, 25)
)

useSeoMeta({
  title: computed(() => product.value?.title ?? 'Product history'),
  description: computed(() =>
    cleanDescription.value || 'Product pricing and availability history.'
  )
})

function formatPrice(value: number | null, currency?: string | null) {
  if (value === null) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD'
  }).format(value / 100)
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function getAddToOrderUrl(url: string) {
  return `/app?add=${encodeURIComponent(url)}`
}
</script>

<template>
  <UContainer class="py-8">
    <UBreadcrumb
      class="mb-6"
      :items="[
        { label: 'Search parts', to: '/search', icon: 'i-lucide-search' },
        { label: product?.title ?? 'Product' }
      ]"
    />

    <div v-if="status === 'pending'" class="space-y-6">
      <USkeleton class="h-96 rounded-2xl" />
      <USkeleton class="h-80 rounded-2xl" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      title="Unable to load this product"
      description="The product may not have been indexed yet."
      :actions="[{ label: 'Try again', onClick: () => refresh() }]"
    />

    <div v-else-if="product && data" class="space-y-8">
      <UPageCard>
        <div class="grid gap-8 lg:grid-cols-[minmax(18rem,0.8fr)_1.2fr]">
          <div class="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-elevated">
            <img
              v-if="product.image"
              :src="product.image"
              :alt="product.title"
              class="h-full w-full object-contain p-6"
            >
            <UIcon v-else name="i-lucide-package" class="size-24 text-muted" />
          </div>

          <div class="flex flex-col">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge variant="subtle" icon="i-lucide-store">
                {{ data.vendor?.name ?? 'Vendor' }}
              </UBadge>
              <UBadge v-if="data.vendor?.type" color="neutral" variant="soft">
                {{ data.vendor.type }}
              </UBadge>
            </div>
            <h1 class="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {{ product.title }}
            </h1>
            <p v-if="cleanDescription" class="mt-4 max-w-3xl text-muted">
              {{ cleanDescription }}
            </p>

            <div class="mt-8 grid gap-3 sm:grid-cols-3">
              <div class="rounded-xl bg-elevated p-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">Price</p>
                <p class="mt-1 text-2xl font-semibold">
                  {{ formatPrice(product.priceCents, product.currency) }}
                </p>
              </div>
              <div class="rounded-xl bg-elevated p-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">Stock</p>
                <p class="mt-1 text-2xl font-semibold">
                  {{ product.stockQuantity ?? product.availability ?? 'Unknown' }}
                </p>
              </div>
              <div class="rounded-xl bg-elevated p-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">Last checked</p>
                <p class="mt-1 text-sm font-medium">
                  {{ formatDate(data.updatedAt) }}
                </p>
              </div>
            </div>

            <div class="mt-auto flex flex-wrap gap-2 pt-8">
              <UButton
                v-if="data.sourceUrl"
                :to="getAddToOrderUrl(data.sourceUrl)"
                icon="i-lucide-plus"
              >
                Add to orders
              </UButton>
              <UButton
                v-if="data.sourceUrl"
                :to="data.sourceUrl"
                target="_blank"
                color="neutral"
                variant="soft"
                icon="i-lucide-external-link"
              >
                View at vendor
              </UButton>
            </div>
          </div>
        </div>
      </UPageCard>

      <section>
        <div class="mb-4">
          <h2 class="text-2xl font-semibold">Trends</h2>
          <p class="text-sm text-muted">Recorded during vendor lookups and catalog syncs.</p>
        </div>
        <div class="grid gap-4 xl:grid-cols-2">
          <UCard>
            <template #header>
              <div>
                <h3 class="font-semibold">Price history</h3>
                <p class="text-xs text-muted">{{ pricePoints.length }} recorded prices</p>
              </div>
            </template>
            <MetricChart
              v-if="pricePoints.length"
              :points="pricePoints"
              :format-value="value => formatPrice(Math.round(value), product?.currency)"
            />
            <UAlert
              v-else
              color="neutral"
              variant="soft"
              title="No price history yet"
              description="A price chart will appear after the next recorded lookup."
            />
          </UCard>

          <UCard>
            <template #header>
              <div>
                <h3 class="font-semibold">Stock history</h3>
                <p class="text-xs text-muted">Shown when the vendor provides quantities.</p>
              </div>
            </template>
            <MetricChart
              v-if="stockPoints.length"
              :points="stockPoints"
              :format-value="value => `${Math.round(value)}`"
              color="#16a34a"
            />
            <UAlert
              v-else
              color="neutral"
              variant="soft"
              title="Stock quantity unavailable"
              description="This vendor does not currently expose numeric inventory data."
            />
          </UCard>
        </div>
      </section>

      <section v-if="product.variants.length">
        <div class="mb-4">
          <h2 class="text-2xl font-semibold">Variants</h2>
          <p class="text-sm text-muted">Current options reported by the vendor.</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UCard v-for="variant in product.variants" :key="variant.id ?? variant.title" variant="subtle">
            <p class="font-medium">{{ variant.title }}</p>
            <div class="mt-3 flex items-center justify-between gap-3 text-sm">
              <span>{{ formatPrice(variant.priceCents, product.currency) }}</span>
              <UBadge v-if="variant.stockQuantity !== null" color="neutral" variant="soft">
                {{ variant.stockQuantity }} in stock
              </UBadge>
            </div>
          </UCard>
        </div>
      </section>

      <section>
        <div class="mb-4">
          <h2 class="text-2xl font-semibold">Observation log</h2>
          <p class="text-sm text-muted">The latest recorded product metrics.</p>
        </div>
        <UCard>
          <div v-if="recentObservations.length" class="divide-y divide-default">
            <div
              v-for="observation in recentObservations"
              :key="observation.id"
              class="grid grid-cols-[1fr_auto_auto] items-center gap-6 py-3 text-sm"
            >
              <span class="text-muted">{{ formatDate(observation.capturedAt) }}</span>
              <span class="font-medium">
                {{ formatPrice(observation.priceCents, observation.currency || product.currency) }}
              </span>
              <span class="min-w-20 text-right text-muted">
                {{ observation.stockQuantity === null ? 'Stock —' : `${observation.stockQuantity} stock` }}
              </span>
            </div>
          </div>
          <UAlert
            v-else
            color="neutral"
            variant="soft"
            title="No observations yet"
          />
        </UCard>
      </section>
    </div>
  </UContainer>
</template>
