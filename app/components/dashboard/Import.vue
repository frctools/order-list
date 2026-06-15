<script setup lang="ts">
import { parse } from "papaparse";
import * as z from "zod";
import { camelCase, splitByCase } from "scule";
import { computedAsync } from "@vueuse/core";
import type { OrderEditorValues } from "~/types/orders";

defineProps<{
  count: number;
}>();

const toast = useToast();

interface SearchHit {
  name: string;
  title?: string;
  description?: string;
  url?: string;
  originalUrl?: string;
  sku?: string;
  skus?: string[];
  vendor?: string;
  image?: string;
  price?: number;
  [key: string]: unknown;
}

interface VendorProductResponse {
  vendor: {
    id: string;
    name: string;
  };
  productData?: {
    product?: {
      title?: string;
      variants?: Array<{
        id: string | number;
        title: string;
        price?: string | null;
      }>;
    };
  };
  variantId?: string | number | null;
}

interface VariantOption {
  label: string;
  value: string;
  title: string;
  price: string | null;
}

interface RowState {
  selectedHit: SearchHit | null;
  variantId: string;
  variantTitle: string;
  unitPrice: string | null;
  quantity: number;
}

interface ImportRow {
  key: string;
  partNumber: string;
  quantity: number;
  description?: string;
  state: RowState;
}

interface ProductMenuItem {
  label: string;
  description: string;
  value: SearchHit;
}

const parseCSV = (file: File) => {
  return new Promise<unknown[]>((resolve, reject) => {
    parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) =>
        camelCase(splitByCase(header, ["-", "_", "/", ".", " "])),
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};
const value = ref(null);
const emit = defineEmits<{
  close: [null];
}>();
const isSubmitting = ref(false);
const csvSchema = z.object({
  quantity: z.string().transform((val) => parseInt(val, 10)),
  partNumber: z.string().optional().default(""),
  description: z.string().optional().default(""),
});

const rawList = computedAsync(async () => {
  if (!value.value) return [];
  const parsed = await parseCSV(value.value);
  return parsed;
});

const list = computed(() => {
  if (!rawList.value || rawList.value.length === 0) return [];

  const validRows = rawList.value
    .map((part) => {
      const parsed = csvSchema.safeParse(part);
      if (!parsed.success) return null;
      const { partNumber, description, quantity } = parsed.data;
      if (!partNumber?.trim() && !description?.trim()) return null;
      return {
        partNumber: partNumber?.trim() || "",
        description: description?.trim() || "",
        quantity,
      };
    })
    .filter((row): row is {
    partNumber: string;
    description: string;
    quantity: number;
  } => Boolean(row));

  const combined = new Map<
    string,
    { partNumber: string; description: string; quantity: number }
  >();
  for (const row of validRows) {
    const key = `${row.partNumber}|||${row.description}`;
    const existing = combined.get(key);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      combined.set(key, { ...row });
    }
  }

  return Array.from(combined.values());
});

const lookedUpParts = ref<Map<string, SearchHit[]>>(new Map());
const isSearching = ref(false);
const rowStates = ref<Map<string, RowState>>(new Map());
const deletedKeys = ref<Set<string>>(new Set());
const productDetails = ref<Map<string, VendorProductResponse>>(new Map());
const loadingDetails = ref<Set<string>>(new Set());

function rowKey(row: { partNumber: string; description: string }) {
  return `${row.partNumber}|||${row.description}`;
}

function getRowState(key: string, defaultQuantity: number): RowState {
  const existing = rowStates.value.get(key);
  if (existing) return existing;
  return {
    selectedHit: null,
    variantId: "",
    variantTitle: "",
    unitPrice: null,
    quantity: defaultQuantity,
  };
}

function getDefaultQuantityForKey(key: string): number {
  const part = list.value.find((p) => rowKey(p) === key);
  return part?.quantity ?? 1;
}

function updateRowState(key: string, updates: Partial<RowState>) {
  const current = rowStates.value.get(key) || {
    selectedHit: null,
    variantId: "",
    variantTitle: "",
    unitPrice: null,
    quantity: getDefaultQuantityForKey(key),
  };
  const newStates = new Map(rowStates.value);
  newStates.set(key, { ...current, ...updates });
  rowStates.value = newStates;
}

watchEffect(async () => {
  const parts = list.value;
  if (!parts || parts.length === 0) {
    lookedUpParts.value = new Map();
    return;
  }

  isSearching.value = true;
  const results = new Map<string, SearchHit[]>();

  try {
    const searches = parts.map(async (part) => {
      const searchQuery = [part.partNumber, part.description]
        .filter(Boolean)
        .join(" ");
      if (!searchQuery.trim()) return;
      const response = await $fetch("/api/vendors/search", {
        query: { q: searchQuery, limit: 5 },
      });
      results.set(rowKey(part), response.hits as SearchHit[]);
    });

    await Promise.all(searches);
    lookedUpParts.value = results;

    // Auto-select hits where part number matches SKU
    for (const part of parts) {
      const key = rowKey(part);
      const hits = results.get(key) || [];
      const existingState = rowStates.value.get(key);

      if (!existingState?.selectedHit && part.partNumber) {
        const normalizedPartNumber = part.partNumber.toLowerCase().trim();

        const matchingHit = hits.find((hit) => {
          if (
            hit.sku &&
            hit.sku.toLowerCase?.().trim() === normalizedPartNumber
          )
            return true;

          if (hit.skus && Array.isArray(hit.skus)) {
            return hit.skus.some(
              (sku: string) =>
                sku.toLowerCase?.().trim() === normalizedPartNumber,
            );
          }
          return false;
        });

        if (matchingHit) {
          selectHit(key, matchingHit);
        }
      }
    }
  } catch (error) {
    console.error("Error searching for parts:", error);
  } finally {
    isSearching.value = false;
  }
});

const tableData = computed(() => {
  if (!list.value || list.value.length === 0) return [];
  return list.value
    .filter((part) => !deletedKeys.value.has(rowKey(part)))
    .map((part) => {
      const key = rowKey(part);
      const state = getRowState(key, part.quantity);
      return {
        key,
        partNumber: part.partNumber,
        quantity: part.quantity,
        description: part.description,
        state,
      } as ImportRow;
    });
});

const tableColumns = [
  { accessorKey: "partNumber", header: "Part Number" },
  { accessorKey: "quantity", header: "Qty" },
  { accessorKey: "description", header: "Description" },
  { accessorKey: "state", header: "Selected Product" },
  { id: "actions", header: "" },
];

function deleteRow(key: string) {
  deletedKeys.value = new Set([...deletedKeys.value, key]);
}

function getInputMenuItems(key: string): ProductMenuItem[] {
  const hits = lookedUpParts.value.get(key) || [];
  return hits.map((hit) => {
    const sku = hit.skus?.[0] ?? hit.sku;
    return {
      label: hit.title || hit.name || "Untitled product",
      description: sku ? `SKU: ${sku}` : hit.vendor || "",
      value: hit,
    };
  });
}

function getProductMenuItem(item: unknown): ProductMenuItem | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as Partial<ProductMenuItem>;
  return candidate.value && typeof candidate.label === "string"
    ? (candidate as ProductMenuItem)
    : null;
}

function getSelectedHit(item: unknown): SearchHit | null {
  return getProductMenuItem(item)?.value ?? null;
}

function getMenuItemImage(item: unknown) {
  return getProductMenuItem(item)?.value.image ?? "";
}

function getMenuItemLabel(item: unknown) {
  return getProductMenuItem(item)?.label ?? "";
}

function getMenuItemDescription(item: unknown) {
  return getProductMenuItem(item)?.description ?? "";
}

function getVariantOptions(key: string): VariantOption[] {
  const details = productDetails.value.get(key);
  const variants = details?.productData?.product?.variants ?? [];
  return variants.map((variant) => {
    const formattedPrice = formatVariantPriceLabel(variant.price ?? null);
    return {
      label: formattedPrice
        ? `${variant.title} · ${formattedPrice}`
        : variant.title,
      value: String(variant.id),
      title: variant.title,
      price: variant.price ?? null,
    };
  });
}

function formatVariantPriceLabel(price?: string | null) {
  if (!price) return null;
  const numeric = Number(price);
  if (Number.isNaN(numeric)) return price;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return price;
  }
}

async function selectHit(key: string, hit: SearchHit | null) {
  updateRowState(key, {
    selectedHit: hit,
    variantId: "",
    variantTitle: "",
    unitPrice: null,
  });

  const url = hit?.originalUrl || hit?.url;
  if (hit && url) {
    loadingDetails.value = new Set([...loadingDetails.value, key]);
    try {
      const data = await $fetch<VendorProductResponse>("/api/vendors", {
        query: { url },
      });
      const newDetails = new Map(productDetails.value);
      newDetails.set(key, data);
      productDetails.value = newDetails;

      const variants = data.productData?.product?.variants ?? [];
      if (variants.length > 0) {
        const preferredId = data.variantId ? String(data.variantId) : "";
        const options = getVariantOptions(key);
        const existing =
          options.find((opt) => opt.value === preferredId) ?? options[0];
        if (existing) {
          updateRowState(key, {
            variantId: existing.value,
            variantTitle: existing.title,
            unitPrice: existing.price,
          });
        }
      }
    } catch (error) {
      console.error("Error fetching product details:", error);
    } finally {
      const newLoading = new Set(loadingDetails.value);
      newLoading.delete(key);
      loadingDetails.value = newLoading;
    }
  }
}

function selectVariant(key: string, variantId: string) {
  const options = getVariantOptions(key);
  const option = options.find((opt) => opt.value === variantId);
  if (option) {
    updateRowState(key, {
      variantId: option.value,
      variantTitle: option.title,
      unitPrice: option.price,
    });
  }
}

function updateQuantity(key: string, quantity: number) {
  updateRowState(key, { quantity: Math.max(1, quantity) });
}

function hasMultipleVariants(key: string): boolean {
  const details = productDetails.value.get(key);
  return (details?.productData?.product?.variants?.length ?? 0) > 1;
}

function isLoadingDetails(key: string): boolean {
  return loadingDetails.value.has(key);
}

function getVariantCount(key: string): number {
  const details = productDetails.value.get(key);
  return details?.productData?.product?.variants?.length ?? 0;
}

const importedOrders = computed<OrderEditorValues[]>(() => {
  return tableData.value
    .filter((row) => row.state.selectedHit)
    .map((row) => {
      const state = row.state;
      const details = productDetails.value.get(row.key);
      return {
        partName:
          state.selectedHit!.name || details?.productData?.product?.title || "",
        quantity: state.quantity,
        description:
          row.description || state.selectedHit!.description || undefined,
        externalUrl:
          state.selectedHit!.originalUrl || state.selectedHit!.url || undefined,
        vendorId: details?.vendor?.id || null,
        variantId: state.variantId || undefined,
        variantTitle: state.variantTitle || undefined,
        unitPriceCents: state.unitPrice
          ? Math.ceil(Number(state.unitPrice) * 100)
          : undefined,
        tagIds: [],
      };
    });
});

async function handleImport() {
  if (importedOrders.value.length === 0) return;

  isSubmitting.value = true;
  await $fetch("/api/orders/bulk", {
    method: "POST",
    body: { orders: importedOrders.value },
  });

  if (importedOrders.value.length > 0) {
    toast.add({
      title: `Imported ${importedOrders.value.length} order${importedOrders.value.length === 1 ? "" : "s"}`,
      color: "success",
      icon: "i-lucide-check-circle",
    });
  }

  isSubmitting.value = false;
  emit("close", null);
}
</script>

<template>
  <UModal
    :close="{ onClick: () => emit('close', null) }"
    :title="`Import BOM`"
    fullscreen
  >
    <template #body>
      <ProseCallout
        type="tip"
        icon="i-lucide-file-spreadsheet"
        to="/docs/features/import"
        @click="emit('close', null)"
      >
        Learn how to export your BOM from Onshape and import it here.
      </ProseCallout>

      <UFileUpload
        v-model="value"
        description="Upload a CSV with columns: Part Number, Quantity, Description"
        :disabled="isSubmitting"
        class="mt-4"
      />

      <div v-if="isSearching" class="mt-4 flex items-center gap-2">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        <span>Searching for products...</span>
      </div>

      <UTable
        v-if="tableData.length > 0"
        :columns="tableColumns"
        :data="tableData"
        :loading="isSearching"
        class="mt-4"
      >
        <template #partNumber-cell="{ row }">
          <span class="font-mono text-sm">{{
            row.original.partNumber || "—"
          }}</span>
        </template>

        <template #quantity-cell="{ row }">
          <UInput
            type="number"
            :model-value="row.original.state.quantity"
            min="1"
            class="w-20"
            @update:model-value="
              updateQuantity(row.original.key, Number($event))
            "
          />
        </template>

        <template #description-cell="{ row }">
          <span class="text-sm text-gray-500 max-w-32 truncate">{{
            row.original.description || "—"
          }}</span>
        </template>

        <template #state-cell="{ row }">
          <div class="flex flex-col gap-2">
            <UInputMenu
              :model-value="row.original.state.selectedHit ?? undefined"
              :items="getInputMenuItems(row.original.key)"
              value-key="value"
              placeholder="Search and select product..."
              class="w-64"
              :loading="isSearching"
              ignore-filter
              @update:model-value="
                selectHit(row.original.key, getSelectedHit($event))
              "
            >
              <template #item="{ item }">
                <div class="flex gap-2 items-center">
                  <img
                    v-if="getMenuItemImage(item)"
                    :src="getMenuItemImage(item)"
                    alt=""
                    class="h-6 w-6 object-contain rounded-md"
                  />
                  <div class="flex flex-col py-1">
                    <span class="font-medium text-sm truncate">{{
                      getMenuItemLabel(item)
                    }}</span>
                    <span
                      v-if="getMenuItemDescription(item)"
                      class="text-xs text-gray-500 truncate"
                      >{{ getMenuItemDescription(item) }}</span
                    >
                  </div>
                </div>
              </template>
            </UInputMenu>

            <div
              v-if="isLoadingDetails(row.original.key)"
              class="flex items-center gap-1 text-gray-500"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="h-3 w-3 animate-spin"
              />
              <span class="text-xs">Loading product details...</span>
            </div>

            <template v-else-if="row.original.state.selectedHit">
              <div
                v-if="getVariantOptions(row.original.key).length > 0"
                class="flex flex-col gap-1"
              >
                <USelectMenu
                  :model-value="row.original.state.variantId"
                  :items="getVariantOptions(row.original.key)"
                  value-key="value"
                  placeholder="Select variant"
                  class="w-64"
                  @update:model-value="selectVariant(row.original.key, $event)"
                />
                <div
                  v-if="hasMultipleVariants(row.original.key)"
                  class="flex items-center gap-1 text-amber-600 dark:text-amber-400"
                >
                  <UIcon
                    name="i-heroicons-exclamation-triangle"
                    class="h-4 w-4"
                  />
                  <span class="text-xs"
                    >{{ getVariantCount(row.original.key) }} variants — please
                    verify selection</span
                  >
                </div>
              </div>

              <a
                v-if="
                  row.original.state.selectedHit?.url ||
                  row.original.state.selectedHit?.originalUrl
                "
                :href="
                  row.original.state.selectedHit.originalUrl ||
                  row.original.state.selectedHit.url
                "
                target="_blank"
                class="text-xs text-primary-500 hover:underline"
              >
                View product →
              </a>
            </template>
          </div>
        </template>

        <template #actions-cell="{ row }">
          <UButton
            icon="i-heroicons-trash"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="deleteRow(row.original.key)"
          />
        </template>
      </UTable>

      <div
        v-if="importedOrders.length > 0"
        class="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg"
      >
        <span class="text-green-700 dark:text-green-300 text-sm font-medium">
          {{ importedOrders.length }} of {{ tableData.length }} orders ready to
          import
        </span>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-2">
        <UButton
          color="neutral"
          label="Cancel"
          :disabled="isSubmitting"
          @click="emit('close', null)"
        />
        <UButton
          label="Import Selected"
          :disabled="importedOrders.length === 0 || isSubmitting"
          :loading="isSubmitting"
          @click="handleImport"
        />
      </div>
    </template>
  </UModal>
</template>
