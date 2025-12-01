<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { useRouteQuery } from '@vueuse/router'
definePageMeta({
  layout: 'default'
})

const pageTitle = 'Search Parts'
const pageDescription = 'Search for parts and products across all vendors.'

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  ogTitle: pageTitle,
  ogDescription: pageDescription
})

const searchTerm = useRouteQuery<string>('q','')
const debouncedSearch = refDebounced(searchTerm, 300)
const selectedVendors = useRouteQuery<string[]>('vendors',[])
const sortBy = useRouteQuery<'relevance' | 'price-asc' | 'price-desc'>('sort','relevance')
const viewMode = useRouteQuery<'grid' | 'list'>('view','grid')

const { data: searchResults, status } = await useFetch('/api/vendors/search', {
  query: {
    q: debouncedSearch,
    limit: 20
  },
  transform: (data) => {
    return data.hits.map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description?.replace(/<[^>]*>?/gm, '') || '',
      vendorName: item.vendorName,
      vendorId: item.vendorId,
      image: item.image,
      price: item.price,
      currency: item.currency,
      originalUrl: item.originalUrl
    }))
  },
  lazy: true,
  default: () => []
})

const availableVendors = computed(() => {
  const vendors = new Set<string>()
  searchResults.value?.forEach((item) => {
    if (item.vendorName) vendors.add(item.vendorName)
  })
  return Array.from(vendors).map(v => ({ label: v, value: v }))
})

const filteredResults = computed(() => {
  let results = searchResults.value || []

  if (selectedVendors.value.length > 0) {
    results = results.filter(item =>
      selectedVendors.value.includes(item.vendorName)
    )
  }

  if (sortBy.value === 'price-asc') {
    results = [...results].sort((a, b) => (a.price || 0) - (b.price || 0))
  } else if (sortBy.value === 'price-desc') {
    results = [...results].sort((a, b) => (b.price || 0) - (a.price || 0))
  }

  return results
})

const sortOptions = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' }
]

function formatPrice(price: number | undefined, currency: string | undefined) {
  if (price === undefined || price === null) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD'
  }).format(price)
}

function clearFilters() {
  selectedVendors.value = []
  sortBy.value = 'relevance'
}

function getAddToOrderUrl(originalUrl: string) {
  return `/app?add=${encodeURIComponent(originalUrl)}`
}
</script>

<template>
  <div>
    <UPageHero
      title="Search Parts"
      description="Find parts and products across all vendors"
    />

    <UContainer class="py-8">
      <div class="mb-8">
        <UInput
          v-model="searchTerm"
          icon="i-lucide-search"
          size="xl"
          placeholder="Search for parts, products, or SKUs..."
          class="w-full"
          :loading="status === 'pending'"
        />
      </div>

      <div class="flex flex-col sm:flex-row gap-4 mb-6">
        <div class="flex flex-wrap gap-3 flex-1">
          <USelectMenu
            v-model="selectedVendors"
            :items="availableVendors"
            value-key="value"
            multiple
            placeholder="Filter by vendor"
            class="w-48"
            :disabled="availableVendors.length === 0"
          />

          <USelectMenu
            v-model="sortBy"
            :items="sortOptions"
            value-key="value"
            class="w-48"
          />

          <UButton
            v-if="selectedVendors.length > 0"
            variant="ghost"
            color="neutral"
            icon="i-lucide-x"
            @click="clearFilters"
          >
            Clear filters
          </UButton>
        </div>

        <div class="flex gap-1">
          <UButton
            :variant="viewMode === 'grid' ? 'solid' : 'ghost'"
            color="neutral"
            icon="i-lucide-layout-grid"
            square
            @click="viewMode = 'grid'"
          />
          <UButton
            :variant="viewMode === 'list' ? 'solid' : 'ghost'"
            color="neutral"
            icon="i-lucide-list"
            square
            @click="viewMode = 'list'"
          />
        </div>
      </div>

      <p
        v-if="debouncedSearch && filteredResults.length > 0"
        class="text-sm text-muted mb-4"
      >
        {{ filteredResults.length }} result{{
          filteredResults.length !== 1 ? "s" : ""
        }}
        for "{{ debouncedSearch }}"
      </p>

      <div
        v-if="status === 'pending' && debouncedSearch"
        class="flex justify-center py-12"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="w-8 h-8 animate-spin text-primary"
        />
      </div>

      <UPageCard
        v-else-if="!debouncedSearch"
        class="text-center py-12"
      >
        <UIcon
          name="i-lucide-search"
          class="w-12 h-12 mx-auto mb-4 text-muted"
        />
        <h3 class="text-lg font-medium mb-2">
          Start searching
        </h3>
        <p class="text-muted">
          Enter a search term to find parts across all vendors
        </p>
      </UPageCard>

      <UPageCard
        v-else-if="filteredResults.length === 0"
        class="text-center py-12"
      >
        <UIcon
          name="i-lucide-package-x"
          class="w-12 h-12 mx-auto mb-4 text-muted"
        />
        <h3 class="text-lg font-medium mb-2">
          No results found
        </h3>
        <p class="text-muted">
          Try adjusting your search term or filters
        </p>
      </UPageCard>

      <div
        v-else-if="viewMode === 'grid'"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        <UPageCard
          v-for="item in filteredResults"
          :key="item.id"
          class="flex flex-col"
        >
          <div
            class="aspect-square bg-elevated rounded-lg mb-3 overflow-hidden"
          >
            <img
              v-if="item.image"
              :src="item.image"
              :alt="item.title"
              class="w-full max-w-64 h-auto object-contain"
            >
            <div
              v-else
              class="w-full h-full flex items-center justify-center"
            >
              <UIcon
                name="i-lucide-package"
                class="w-12 h-12 text-muted"
              />
            </div>
          </div>

          <div class="flex-1 flex flex-col">
            <UBadge
              v-if="item.vendorName"
              variant="subtle"
              size="sm"
              class="w-fit mb-1"
            >
              {{ item.vendorName }}
            </UBadge>
            <h3 class="font-medium line-clamp-2 mb-1 word-break-word">
              {{ item.title }}
            </h3>
            <p
              v-if="item.description"
              class="text-sm text-muted line-clamp-2 mb-2 break-all"
            >
              {{ item.description }}
            </p>
            <div class="mt-auto flex items-center justify-between gap-2">
              <div>
                <p
                  v-if="formatPrice(item.price, item.currency)"
                  class="font-semibold text-primary"
                >
                  {{ formatPrice(item.price, item.currency) }}
                </p>
              </div>
              <div class="flex gap-1">
                <UButton
                  v-if="item.originalUrl"
                  :to="getAddToOrderUrl(item.originalUrl)"
                  icon="i-lucide-plus"
                  size="sm"
                  variant="soft"
                >
                  Order
                </UButton>
                <UButton
                  :to="item.originalUrl"
                  target="_blank"
                  icon="i-lucide-external-link"
                  size="sm"
                  variant="ghost"
                />
              </div>
            </div>
          </div>
        </UPageCard>
      </div>

      <div
        v-else
        class="space-y-3"
      >
        <UPageCard
          v-for="item in filteredResults"
          :key="item.id"
          class="flex gap-4"
        >
          <div
            class="w-20 h-20 bg-elevated rounded-lg shrink-0 overflow-hidden"
          >
            <img
              v-if="item.image"
              :src="item.image"
              :alt="item.title"
              class="w-full h-full object-contain"
            >
            <div
              v-else
              class="w-full h-full flex items-center justify-center"
            >
              <UIcon
                name="i-lucide-package"
                class="w-8 h-8 text-muted"
              />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="font-medium truncate">
                  {{ item.title }}
                </h3>
                <p
                  v-if="item.description"
                  class="text-sm text-muted line-clamp-1"
                >
                  {{ item.description }}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <p
                  v-if="formatPrice(item.price, item.currency)"
                  class="font-semibold text-primary whitespace-nowrap"
                >
                  {{ formatPrice(item.price, item.currency) }}
                </p>
                <UButton
                  v-if="item.originalUrl"
                  :to="getAddToOrderUrl(item.originalUrl)"
                  icon="i-lucide-plus"
                  size="sm"
                  variant="soft"
                >
                  Add
                </UButton>
                <UButton
                  :to="item.originalUrl"
                  target="_blank"
                  icon="i-lucide-external-link"
                  size="sm"
                  variant="ghost"
                />
              </div>
            </div>
            <UBadge
              v-if="item.vendorName"
              variant="subtle"
              size="sm"
              class="mt-1"
            >
              {{ item.vendorName }}
            </UBadge>
          </div>
        </UPageCard>
      </div>
    </UContainer>
  </div>
</template>
