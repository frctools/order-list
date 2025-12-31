<script setup lang="ts">
import type { CommandPaletteItem } from "@nuxt/ui";

interface SearchProductItem {
  id: string;
  title: string;
  description: string;
  vendorName: string;
  image: string;
  price: number;
  currency: string;
  originalUrl: string;
}

interface SearchResponse {
  hits: SearchProductItem[];
}

interface TransformedProduct extends CommandPaletteItem {
  price: number;
  currency: string;
  originalUrl: string;
}

const searchTerm = ref("");

const { data: searchData, status } = await useFetch<SearchResponse>(
  "/api/vendors/search",
  {
    key: "command-palette-products",
    query: {
      q: searchTerm,
    },
    lazy: true,
  },
);

const products = computed((): TransformedProduct[] => {
  if (!searchData.value?.hits) return [];
  return searchData.value.hits.map((item) => ({
    id: item.id,
    label: item.title,
    description: (item.description || "").replace(/<[^>]*>?/gm, ""),
    suffix: item.vendorName,
    avatar: { src: item.image },
    price: item.price,
    currency: item.currency,
    originalUrl: item.originalUrl,
  }));
});

const groups = computed(() => [
  {
    id: "products",
    label: searchTerm.value
      ? `Products matching “${searchTerm.value}”...`
      : "Products",
    items: products.value || [],
    ignoreFilter: true,
  },
]);
const selected = ref<CommandPaletteItem | null>(null);
const emit = defineEmits<{
  select: [string];
}>();
function select(item: CommandPaletteItem | null) {
  if (
    item &&
    "originalUrl" in item &&
    item.originalUrl &&
    typeof item.originalUrl === "string"
  ) {
    emit("select", item.originalUrl);
  }
  searchTerm.value = "";
  selected.value = null;
}
</script>

<template>
  <UCommandPalette
    v-model:search-term="searchTerm"
    v-model="selected"
    :loading="status === 'pending'"
    :groups="groups"
    class="flex-1"
    placeholder="Search products..."
    :ui="{
      empty: 'p-0',
    }"
    @update:model-value="select"
  >
    <template #item-trailing="{ index }">
      <UButton
        size="sm"
        icon="i-lucide-external-link"
        :to="products[index]?.originalUrl"
        target="_blank"
      />
    </template>
    <template #empty>
      <div />
    </template>
  </UCommandPalette>
</template>
