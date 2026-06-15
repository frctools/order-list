<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import type { KitItemInput, SaveKitInput } from "~/types/kits";

type EditableKitItem = {
  localId: string;
  partName: string;
  description: string;
  quantity: number;
  unitPrice: string;
  variantId: string;
  variantTitle: string;
  vendorId: string;
  vendorName: string;
  externalUrl: string;
  imageUrl: string;
};

const props = defineProps<{
  mode: "create" | "edit";
  loading?: boolean;
  initialTitle?: string | null;
  initialDescription?: string | null;
  initialItems?: KitItemInput[];
}>();

const emit = defineEmits<{
  submit: [SaveKitInput];
}>();

const title = ref("");
const description = ref("");
const items = ref<EditableKitItem[]>([]);
const productSearch = ref("");
const debouncedProductSearch = refDebounced(productSearch, 250);

interface SearchResultItem {
  id: string;
  title: string;
  description: string;
  vendorName: string;
  vendorId: string;
  image: string;
  price: number;
  currency: string;
  originalUrl: string;
}

interface SearchResponse {
  hits: SearchResultItem[];
}

const { data: searchData, status: searchStatus } = await useFetch<SearchResponse>(
  "/api/vendors/search",
  {
    query: {
      q: debouncedProductSearch,
      limit: 8,
    },
    lazy: true,
  },
);

const actionLabel = computed(() =>
  props.mode === "edit" ? "Save kit" : "Create share link",
);

watch(
  () => [props.initialTitle, props.initialDescription, props.initialItems],
  () => {
    initialize();
  },
  { immediate: true },
);

function initialize() {
  title.value = props.initialTitle ?? "";
  description.value = props.initialDescription ?? "";
  items.value = props.initialItems?.map((item) => toEditableItem(item)) ?? [];
}

function toEditableItem(item?: Partial<KitItemInput>): EditableKitItem {
  return {
    localId: crypto.randomUUID(),
    partName: item?.partName ?? "",
    description: item?.description ?? "",
    quantity: Math.max(1, item?.quantity ?? 1),
    unitPrice:
      item?.unitPriceCents === undefined || item.unitPriceCents === null
        ? ""
        : (item.unitPriceCents / 100).toFixed(2),
    variantId: item?.variantId ?? "",
    variantTitle: item?.variantTitle ?? "",
    vendorId: item?.vendorId ?? "",
    vendorName: item?.vendorName ?? "",
    externalUrl: item?.externalUrl ?? "",
    imageUrl: item?.imageUrl ?? "",
  };
}

const searchResults = computed(() => {
  if (!searchData.value?.hits) return [];
  return searchData.value.hits.map((item) => ({
    ...item,
    description: (item.description || "").replace(/<[^>]*>?/gm, ""),
  }));
});

function addManualItem() {
  items.value = [...items.value, toEditableItem()];
}

function addSearchResult(item: SearchResultItem) {
  items.value = [
    ...items.value,
    toEditableItem({
      partName: item.title,
      description: item.description || null,
      quantity: 1,
      unitPriceCents:
        item.price === undefined || item.price === null
          ? null
          : Math.round(item.price * 100),
      vendorId: item.vendorId || null,
      vendorName: item.vendorName || null,
      externalUrl: item.originalUrl || null,
      imageUrl: item.image || null,
    }),
  ];
  productSearch.value = "";
}

function removeItem(localId: string) {
  items.value = items.value.filter((item) => item.localId !== localId);
}

function updateItem(localId: string, updates: Partial<EditableKitItem>) {
  items.value = items.value.map((item) =>
    item.localId === localId ? { ...item, ...updates } : item,
  );
}

function buildPayload(): SaveKitInput {
  return {
    title: title.value.trim(),
    description: description.value.trim() || null,
    items: items.value.map((item) => ({
      partName: item.partName.trim(),
      description: item.description.trim() || null,
      quantity: Math.max(1, item.quantity || 1),
      unitPriceCents: item.unitPrice.trim()
        ? Math.round(Number(item.unitPrice) * 100)
        : null,
      variantId: item.variantId.trim() || null,
      variantTitle: item.variantTitle.trim() || null,
      vendorId: item.vendorId.trim() || null,
      vendorName: item.vendorName.trim() || null,
      externalUrl: item.externalUrl.trim() || null,
      imageUrl: item.imageUrl.trim() || null,
    })),
  };
}

const canSubmit = computed(() => {
  if (!title.value.trim()) return false;
  if (items.value.length === 0) return false;
  return items.value.every((item) => item.partName.trim().length > 0);
});

function handleSubmit() {
  if (!canSubmit.value) return;
  emit("submit", buildPayload());
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
      <UPageCard>
        <div class="space-y-4">
          <UFormField label="Kit title" required>
            <UInput
              v-model="title"
              placeholder="Everybot spare parts kit"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Description">
            <UTextarea
              v-model="description"
              :rows="3"
              placeholder="What this kit is for, or when teammates should use it"
            />
          </UFormField>
        </div>
      </UPageCard>

      <UPageCard>
        <div class="flex h-full flex-col justify-between gap-4">
          <div class="space-y-2">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              Kit items
            </h2>
            <p class="text-sm text-muted">
              Review the products and custom parts in this kit.
            </p>
            <p class="text-sm text-muted">
              {{ items.length }} item{{ items.length === 1 ? "" : "s" }}
            </p>
          </div>
          <div class="flex flex-col gap-2">
            <UButton
              icon="i-lucide-link"
              :loading="loading"
              :disabled="!canSubmit"
              @click="handleSubmit"
            >
              {{ actionLabel }}
            </UButton>
          </div>
        </div>
      </UPageCard>
    </div>

    <UPageCard>
      <div class="space-y-4">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              Search products
            </h2>
            <p class="text-sm text-muted">
              Search vendor products or add a custom part manually.
            </p>
          </div>
          <div class="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <UInput
              v-model="productSearch"
              icon="i-lucide-search"
              placeholder="Search for parts, products, or SKUs..."
              class="w-full md:w-96"
              :loading="searchStatus === 'pending'"
            />
            <UButton
              icon="i-lucide-plus"
              variant="soft"
              color="neutral"
              class="justify-center"
              @click="addManualItem"
            >
              Add custom part
            </UButton>
          </div>
        </div>

        <div v-if="productSearch.trim().length === 0" class="text-sm text-muted">
          Start typing to search across vendors.
        </div>

        <div v-else-if="searchStatus === 'pending'" class="grid gap-3 md:grid-cols-2">
          <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-xl" />
        </div>

        <div
          v-else-if="searchResults.length > 0"
          class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <UPageCard
            v-for="result in searchResults"
            :key="result.id"
            class="border border-default"
          >
            <div class="flex h-full flex-col gap-3">
              <div class="flex gap-3">
                <div class="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-elevated">
                  <img
                    v-if="result.image"
                    :src="result.image"
                    :alt="result.title"
                    class="h-full w-full object-contain"
                  />
                  <div
                    v-else
                    class="flex h-full w-full items-center justify-center"
                  >
                    <UIcon name="i-lucide-package" class="h-6 w-6 text-muted" />
                  </div>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="line-clamp-2 font-medium">{{ result.title }}</p>
                  <p v-if="result.vendorName" class="text-sm text-muted">
                    {{ result.vendorName }}
                  </p>
                  <p
                    v-if="result.price !== undefined && result.price !== null"
                    class="text-sm font-medium text-primary"
                  >
                    {{
                      new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: result.currency || "USD",
                      }).format(result.price)
                    }}
                  </p>
                </div>
              </div>

              <p v-if="result.description" class="line-clamp-2 text-sm text-muted">
                {{ result.description }}
              </p>

              <div class="mt-auto flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  icon="i-lucide-plus"
                  @click="addSearchResult(result)"
                >
                  Add to kit
                </UButton>
                <UButton
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-external-link"
                  :to="result.originalUrl"
                  target="_blank"
                >
                  View
                </UButton>
              </div>
            </div>
          </UPageCard>
        </div>

        <div v-else class="text-sm text-muted">
          No products found. You can still add a custom part manually.
        </div>
      </div>
    </UPageCard>

    <div class="space-y-3">
      <UPageCard
        v-for="item in items"
        :key="item.localId"
        class="border border-default"
      >
        <div class="flex flex-col gap-4">
          <div class="flex items-start gap-3">
            <div class="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-elevated">
              <img
                v-if="item.imageUrl"
                :src="item.imageUrl"
                :alt="item.partName || 'Kit item'"
                class="h-full w-full object-contain"
              />
              <div
                v-else
                class="flex h-full w-full items-center justify-center"
              >
                <UIcon name="i-lucide-package" class="h-6 w-6 text-muted" />
              </div>
            </div>

            <div class="min-w-0 flex-1">
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Part name" required>
                  <UInput
                    :model-value="item.partName"
                    placeholder="1/2 in. Round ID Flanged Shielded Bearing"
                    @update:model-value="
                      updateItem(item.localId, { partName: String($event) })
                    "
                  />
                </UFormField>
                <UFormField label="Quantity" required>
                  <UInput
                    type="number"
                    min="1"
                    :model-value="item.quantity"
                    @update:model-value="
                      updateItem(item.localId, {
                        quantity: Math.max(1, Number($event) || 1),
                      })
                    "
                  />
                </UFormField>
                <UFormField label="Vendor name">
                  <UInput
                    :model-value="item.vendorName"
                    placeholder="WestCoast Products"
                    @update:model-value="
                      updateItem(item.localId, { vendorName: String($event) })
                    "
                  />
                </UFormField>
                <UFormField label="Unit price (USD)">
                  <UInput
                    :model-value="item.unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="49.99"
                    @update:model-value="
                      updateItem(item.localId, { unitPrice: String($event) })
                    "
                  />
                </UFormField>
                <UFormField label="Product link">
                  <UInput
                    :model-value="item.externalUrl"
                    placeholder="https://supplier.com/listing"
                    @update:model-value="
                      updateItem(item.localId, { externalUrl: String($event) })
                    "
                  />
                </UFormField>
                <UFormField label="Image URL">
                  <UInput
                    :model-value="item.imageUrl"
                    placeholder="https://supplier.com/image.jpg"
                    @update:model-value="
                      updateItem(item.localId, { imageUrl: String($event) })
                    "
                  />
                </UFormField>
                <UFormField label="Variant name">
                  <UInput
                    :model-value="item.variantTitle"
                    placeholder="Blue, 24T"
                    @update:model-value="
                      updateItem(item.localId, { variantTitle: String($event) })
                    "
                  />
                </UFormField>
                <UFormField label="Variant ID">
                  <UInput
                    :model-value="item.variantId"
                    placeholder="SKU or variant ID"
                    @update:model-value="
                      updateItem(item.localId, { variantId: String($event) })
                    "
                  />
                </UFormField>
              </div>
            </div>

            <UButton
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              @click="removeItem(item.localId)"
            />
          </div>

          <UFormField label="Notes">
            <UTextarea
              :model-value="item.description"
              :rows="2"
              placeholder="Specs, notes, or sourcing context"
              @update:model-value="
                updateItem(item.localId, { description: String($event) })
              "
            />
          </UFormField>
        </div>
      </UPageCard>

      <UPageCard
        v-if="items.length === 0"
        class="border border-dashed border-default py-16 text-center"
      >
        <p class="text-sm text-muted">
          No items yet. Add products from search or create a custom part.
        </p>
      </UPageCard>
    </div>
  </div>
</template>
