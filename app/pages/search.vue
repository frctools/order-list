<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import { useRouteQuery } from "@vueuse/router";

definePageMeta({
  layout: "default",
});

const pageTitle = "Search Parts";
const pageDescription = "Search for parts and products across all vendors.";

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  ogTitle: pageTitle,
  ogDescription: pageDescription,
});

const searchTerm = useRouteQuery<string>("q", "");
const debouncedSearch = refDebounced(searchTerm, 300);
const auth = useAuth();
const orgs = useOrgs();
const projects = useProjects();
const toast = useToast();
const selectedProducts = ref<SearchResultItem[]>([]);
const isOrderModalOpen = ref(false);
const isAddingSelected = ref(false);
const selectedVendors = useRouteQuery<string[]>("vendors", []);
const sortBy = useRouteQuery<"relevance" | "price-asc" | "price-desc">(
  "sort",
  "relevance",
);
const viewMode = useRouteQuery<"grid" | "list">("view", "grid");

interface SearchResultItem {
  id: string;
  productId?: string;
  title: string;
  description: string;
  vendorName: string;
  vendorId: string;
  image: string;
  price: number;
  currency: string;
  originalUrl: string;
}

interface FacetHit {
  value: string;
  count: number;
}

interface SearchResponse {
  hits: SearchResultItem[];
  estimatedTotalHits?: number;
}

// Fetch available vendors from facets endpoint
const { data: vendorFacets } = await useFetch<FacetHit[]>(
  "/api/vendors/facets",
  {
    query: { facet: "vendorName" },
    lazy: true,
  },
);

// Pass filter and sort parameters to the server
const { data: searchData, status } = await useFetch<SearchResponse>(
  "/api/vendors/search",
  {
    query: {
      q: debouncedSearch,
      limit: 100,
      vendors: selectedVendors,
      sort: sortBy,
    },
    lazy: true,
  },
);

// Results are already filtered and sorted by the server
const searchResults = computed((): SearchResultItem[] => {
  if (!searchData.value?.hits) return [];
  return searchData.value.hits.map((item) => ({
    id: item.id,
    productId: item.productId,
    title: item.title,
    description: (item.description || "").replace(/<[^>]*>?/gm, ""),
    vendorName: item.vendorName,
    vendorId: item.vendorId,
    image: item.image,
    price: item.price,
    currency: item.currency,
    originalUrl: item.originalUrl,
  }));
});

// Available vendors come from facets endpoint (includes counts)
const availableVendors = computed(() => {
  if (!vendorFacets.value) return [];
  return [...vendorFacets.value]
    .sort((a, b) => b.count - a.count) // Sort by count descending
    .map((facet) => ({
      label: `${facet.value} (${facet.count})`,
      value: facet.value,
    }));
});

const sortOptions = [
  { label: "Relevance", value: "relevance" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
];

function formatPrice(price: number | undefined, currency: string | undefined) {
  if (price === undefined || price === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(price);
}

function clearFilters() {
  selectedVendors.value = [];
  sortBy.value = "relevance";
}

function getAddToOrderUrl(originalUrl: string) {
  return `/app?add=${encodeURIComponent(originalUrl)}`;
}

function getProductUrl(item: SearchResultItem) {
  const slug = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'product';
  const key = item.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return {
    path: `/products/${slug}-${key}`,
    query: {
      url: item.originalUrl || undefined,
      productId: item.productId || undefined,
    },
  };
}

const canCreateKit = computed(
  () => Boolean(auth.session.value && orgs.organization.value),
);

const allVisibleProductsSelected = computed(
  () =>
    searchResults.value.length > 0 &&
    searchResults.value.every((item) => isProductSelected(item.id)),
);

function isProductSelected(id: string) {
  return selectedProducts.value.some((item) => item.id === id);
}

function setProductSelected(item: SearchResultItem, selected: boolean) {
  if (selected && !isProductSelected(item.id)) {
    selectedProducts.value = [...selectedProducts.value, item];
  } else if (!selected) {
    selectedProducts.value = selectedProducts.value.filter(
      (selectedItem) => selectedItem.id !== item.id,
    );
  }
}

function setAllVisibleProductsSelected(selected: boolean) {
  const visibleIds = new Set(searchResults.value.map((item) => item.id));

  if (!selected) {
    selectedProducts.value = selectedProducts.value.filter(
      (item) => !visibleIds.has(item.id),
    );
    return;
  }

  const selectedIds = new Set(selectedProducts.value.map((item) => item.id));
  selectedProducts.value = [
    ...selectedProducts.value,
    ...searchResults.value.filter((item) => !selectedIds.has(item.id)),
  ];
}

async function openAddSelectedFlow() {
  if (selectedProducts.value.length === 0) return;

  if (!canCreateKit.value) {
    toast.add({
      title: "Log in to add orders",
      description: "Orders are saved to a project in your active organization.",
      color: "warning",
      icon: "i-lucide-log-in",
    });
    await navigateTo("/auth/login");
    return;
  }

  try {
    await projects.fetchProjects();
    isOrderModalOpen.value = true;
  } catch (error) {
    toast.add({
      title: "Unable to load projects",
      description: error instanceof Error ? error.message : "Please try again.",
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
  }
}

async function addSelectedToOrders() {
  if (selectedProducts.value.length === 0) return;

  const projectId = projects.project.value?.id;
  if (!projectId) {
    toast.add({
      title: "Select a project",
      description: "Choose or create a project for these orders.",
      color: "warning",
      icon: "i-lucide-folder-kanban",
    });
    return;
  }

  isAddingSelected.value = true;
  try {
    const response = await $fetch<{ orders: unknown[] }>("/api/orders/bulk", {
      method: "POST",
      body: {
        orders: selectedProducts.value.map((item) => ({
          projectId,
          partName: item.title,
          description: item.description || undefined,
          quantity: 1,
          vendorId: item.vendorId || item.vendorName || null,
          unitPriceCents:
            Number.isFinite(item.price) && item.price >= 0
              ? Math.round(item.price * 100)
              : undefined,
          externalUrl: item.originalUrl || undefined,
          tagIds: [],
        })),
      },
    });

    toast.add({
      title: "Products added to orders",
      description: `${response.orders.length} order${response.orders.length === 1 ? "" : "s"} created in ${projects.project.value?.name}.`,
      color: "success",
      icon: "i-lucide-check-circle",
    });
    selectedProducts.value = [];
    isOrderModalOpen.value = false;
    await navigateTo("/app");
  } catch (error) {
    toast.add({
      title: "Unable to add selected products",
      description: error instanceof Error ? error.message : "Please try again.",
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
  } finally {
    isAddingSelected.value = false;
  }
}

async function goToCreateKitPage() {
  if (!canCreateKit.value) {
    toast.add({
      title: "Log in to create kits",
      description: "Kits are saved to your active organization.",
      color: "warning",
      icon: "i-lucide-log-in",
    });
    await navigateTo("/auth/login");
    return;
  }
  await navigateTo("/app/kits/new");
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

      <div
        v-if="selectedProducts.length > 0"
        class="sticky top-2 z-20 mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-default bg-default/90 p-3 shadow-sm backdrop-blur"
      >
        <UBadge color="primary" variant="soft">
          {{ selectedProducts.length }} selected
        </UBadge>
        <UCheckbox
          :model-value="allVisibleProductsSelected"
          label="Select all visible"
          @update:model-value="setAllVisibleProductsSelected(Boolean($event))"
        />
        <div class="ml-auto flex gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            @click="selectedProducts = []"
          >
            Clear
          </UButton>
          <UButton
            icon="i-lucide-shopping-cart"
            @click="openAddSelectedFlow"
          >
            Add selected to orders
          </UButton>
        </div>
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
          <UButton
            variant="soft"
            color="neutral"
            icon="i-lucide-package-plus"
            @click="goToCreateKitPage"
          >
            Create kit
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
        v-if="debouncedSearch && searchResults.length > 0"
        class="text-sm text-muted mb-4"
      >
        {{ searchResults.length }} result{{
          searchResults.length !== 1 ? "s" : ""
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

      <UPageCard v-else-if="!debouncedSearch" class="text-center py-12">
        <UIcon
          name="i-lucide-search"
          class="w-12 h-12 mx-auto mb-4 text-muted"
        />
        <h3 class="text-lg font-medium mb-2">Start searching</h3>
        <p class="text-muted">
          Enter a search term to find parts across all vendors
        </p>
      </UPageCard>

      <UPageCard
        v-else-if="searchResults.length === 0"
        class="text-center py-12"
      >
        <UIcon
          name="i-lucide-package-x"
          class="w-12 h-12 mx-auto mb-4 text-muted"
        />
        <h3 class="text-lg font-medium mb-2">No results found</h3>
        <p class="text-muted">Try adjusting your search term or filters</p>
      </UPageCard>

      <div
        v-else-if="viewMode === 'grid'"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        <UPageCard
          v-for="item in searchResults"
          :key="item.id"
          class="flex flex-col"
          :class="isProductSelected(item.id) ? 'ring-2 ring-primary' : ''"
        >
          <div class="mb-2 flex justify-end">
            <UCheckbox
              :model-value="isProductSelected(item.id)"
              :aria-label="`Select ${item.title}`"
              @update:model-value="setProductSelected(item, Boolean($event))"
            />
          </div>
          <NuxtLink
            :to="getProductUrl(item)"
            class="aspect-square bg-elevated rounded-lg mb-3 overflow-hidden"
          >
            <img
              v-if="item.image"
              :src="item.image"
              :alt="item.title"
              class="w-full max-w-full h-auto object-contain"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-lucide-package" class="w-12 h-12 text-muted" />
            </div>
          </NuxtLink>

          <div class="flex-1 flex flex-col">
            <UBadge
              v-if="item.vendorName"
              variant="subtle"
              size="sm"
              class="w-fit mb-1"
            >
              {{ item.vendorName }}
            </UBadge>
            <NuxtLink :to="getProductUrl(item)" class="hover:text-primary">
              <h3 class="font-medium line-clamp-2 mb-1 word-break-word">
                {{ item.title }}
              </h3>
            </NuxtLink>
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
                  :to="getProductUrl(item)"
                  icon="i-lucide-chart-no-axes-column"
                  size="sm"
                  variant="ghost"
                >
                  Details
                </UButton>
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

      <div v-else class="space-y-3">
        <UPageCard
          v-for="item in searchResults"
          :key="item.id"
          class="flex gap-4"
          :class="isProductSelected(item.id) ? 'ring-2 ring-primary' : ''"
        >
          <UCheckbox
            class="shrink-0 self-center"
            :model-value="isProductSelected(item.id)"
            :aria-label="`Select ${item.title}`"
            @update:model-value="setProductSelected(item, Boolean($event))"
          />
          <div
            class="w-20 h-20 bg-elevated rounded-lg shrink-0 overflow-hidden"
          >
            <img
              v-if="item.image"
              :src="item.image"
              :alt="item.title"
              class="w-full h-full object-contain"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-lucide-package" class="w-8 h-8 text-muted" />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <NuxtLink :to="getProductUrl(item)" class="hover:text-primary">
                  <h3 class="font-medium truncate">
                    {{ item.title }}
                  </h3>
                </NuxtLink>
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
                  :to="getProductUrl(item)"
                  icon="i-lucide-chart-no-axes-column"
                  size="sm"
                  variant="ghost"
                >
                  Details
                </UButton>
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

      <ClientOnly>
        <UModal
          v-model:open="isOrderModalOpen"
          title="Add selected products to orders"
          :description="`${selectedProducts.length} product${selectedProducts.length === 1 ? '' : 's'} will be added as new orders.`"
        >
          <template #body>
            <div class="space-y-5">
              <div class="space-y-2">
                <p class="text-sm font-medium">Destination project</p>
                <ProjectSwitcher />
                <p class="text-xs text-muted">
                  Each selected product will be created with a quantity of one.
                </p>
              </div>
              <div class="flex justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  :disabled="isAddingSelected"
                  @click="isOrderModalOpen = false"
                >
                  Cancel
                </UButton>
                <UButton
                  icon="i-lucide-shopping-cart"
                  :loading="isAddingSelected"
                  :disabled="!projects.project.value"
                  @click="addSelectedToOrders"
                >
                  Add {{ selectedProducts.length }} to orders
                </UButton>
              </div>
            </div>
          </template>
        </UModal>
      </ClientOnly>
    </UContainer>
  </div>
</template>
