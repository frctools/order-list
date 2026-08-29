<template>
  <div class="min-h-screen bg-default">
    <UContainer class="mx-auto flex flex-col gap-10 py-10">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            class="text-3xl font-semibold tracking-tight text-primary-900 dark:text-primary-100"
          >
            Orders
          </h1>
          <p class="text-sm text-gray-500">
            Parts grouped into per-vendor orders, from request to delivery.
          </p>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-2">
          <UTabs
            v-model="viewMode"
            size="sm"
            :items="viewOptions"
            aria-label="Select orders layout"
            variant="pill"
            class="gap-0"
          />
          <UButton
            variant="soft"
            color="neutral"
            icon="i-lucide-refresh-ccw"
            :loading="isPending"
            @click="refreshOrders"
          >
            Refresh
          </UButton>
          <UButton
            variant="soft"
            icon="i-lucide-import"
            @click="handleImportClick"
          >
            Import
          </UButton>
          <UButton icon="i-lucide-plus" @click="() => openCreateEditor()">
            Add part
          </UButton>
        </div>
      </header>

      <UAlert
        v-if="isError"
        color="error"
        variant="soft"
        icon="i-lucide-alert-triangle"
        title="Unable to load orders"
        :description="extractErrorMessage(error)"
      />

      <!-- Board view: kanban of orders by status -->
      <div v-if="viewMode === 'board'">
        <div
          v-if="isPending && ordersState.length === 0"
          class="grid gap-4 md:grid-cols-3"
        >
          <USkeleton
            v-for="status in statuses"
            :key="status.key"
            class="h-64 rounded-xl"
          />
        </div>

        <div v-else class="grid gap-4 md:grid-cols-3">
          <div
            v-for="column in boardColumns"
            :key="column.key"
            class="flex flex-col"
          >
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ column.label }}
                </h2>
                <p class="text-xs text-gray-500">
                  {{ column.description }}
                </p>
              </div>
              <UBadge variant="soft" :color="column.color">
                {{ formatCurrencyFromCents(column.totalCents) ?? '$0.00' }}
              </UBadge>
            </div>

            <div
              class="flex-1 space-y-3 rounded-xl border border-dashed border-gray-300/60 bg-white/80 p-3 transition-all dark:bg-gray-950/60"
              :class="[
                dropTarget === column.key
                  ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-transparent'
                  : '',
                draggingPart && column.key === 'to_order'
                  ? 'border-primary-400/70 bg-primary-50/40 dark:bg-primary-950/20'
                  : '',
              ]"
              @dragover.prevent="onDragOver(column.key)"
              @dragleave="onDragLeave(column.key)"
              @drop.prevent="onDrop(column.key)"
            >
              <p
                v-if="draggingPart && column.key === 'to_order'"
                class="rounded-lg border border-dashed border-primary-400/70 py-3 text-center text-xs font-medium text-primary-600 dark:text-primary-300"
              >
                Drop here to split into its own order
              </p>
              <p
                v-else-if="column.orders.length === 0"
                class="py-10 text-center text-sm text-gray-500"
              >
                Drag an order here or add a part.
              </p>

              <div
                v-for="order in column.orders"
                :key="order.id"
                class="rounded-xl"
                :class="
                  dropOrderTarget === order.id
                    ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-transparent'
                    : ''
                "
                @dragover="onCardDragOver($event, order)"
                @dragleave="onCardDragLeave(order)"
                @drop="onCardDrop($event, order)"
              >
                <OrderCard
                  :order="order"
                  :updating="isOrderUpdating(order.id)"
                  :deleting="isOrderDeleting(order.id)"
                  @advance="advanceOrder"
                  @delete-order="deleteOrder"
                  @add-item="openAddToOrder"
                  @edit-item="onEditItem"
                  @delete-item="onDeleteItem"
                  @order-dragstart="onDragStart(order.id)"
                  @order-dragend="onDragEnd"
                  @part-dragstart="onPartDragStart"
                  @part-dragend="onPartDragEnd"
                  @open-details="openDetails"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Table view: orders grouped with totals -->
      <div v-else class="overflow-hidden">
        <div class="mb-4 grid gap-4 md:grid-cols-3">
          <UFormField label="Start date">
            <UInput v-model="startDate" type="date" class="w-full" size="xl" />
          </UFormField>
          <UFormField label="End date">
            <UInput v-model="endDate" type="date" class="w-full" size="xl" />
          </UFormField>
          <UFormField label="Vendor">
            <USelectMenu
              v-model="vendorFilter"
              :items="vendorOptions"
              value-key="value"
              searchable
              placeholder="All vendors"
              class="w-full"
              size="xl"
            />
          </UFormField>
          <UFormField label="Status">
            <USelectMenu
              v-model="statusFilter"
              :items="statuses.map((s) => ({ value: s.key, label: s.label }))"
              value-key="value"
              searchable
              placeholder="All statuses"
              class="w-full"
              size="xl"
            />
          </UFormField>
          <UFormField label="Tag">
            <USelectMenu
              v-model="tagFilter"
              :items="tagOptions"
              value-key="value"
              searchable
              placeholder="All tags"
              class="w-full"
              size="xl"
            />
          </UFormField>
        </div>

        <div class="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">
              Total {{ statusFilter ? statusLabel(statusFilter) : "across orders" }}
            </h2>
            <p class="text-2xl font-semibold">
              {{ formatCurrencyFromCents(grandTotalCents) ?? "$0.00" }}
            </p>
            <p class="text-sm text-gray-500">
              {{ filteredOrders.length }} orders ·
              {{ filteredItemCount }} parts
            </p>
          </div>

          <div class="flex gap-2">
            <UButton
              variant="soft"
              color="neutral"
              icon="i-lucide-download"
              :disabled="filteredOrders.length === 0"
              :loading="isExportingCsv"
              @click="exportOrdersCsv"
            >
              Export CSV
            </UButton>
            <UButton variant="ghost" color="neutral" @click="clearFilters">
              Clear
            </UButton>
          </div>
        </div>

        <div v-if="isPending && ordersState.length === 0" class="space-y-2">
          <USkeleton v-for="row in 6" :key="row" class="h-12 rounded-lg" />
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="order in filteredOrders"
            :key="order.id"
            class="rounded-xl border border-gray-200/70 dark:border-gray-800/70"
            :class="
              dropOrderTarget === order.id
                ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-transparent'
                : ''
            "
            @dragover="onCardDragOver($event, order)"
            @dragleave="onCardDragLeave(order)"
            @drop="onCardDrop($event, order)"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/70 p-3 dark:border-gray-800/70"
            >
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-store" class="text-gray-500" />
                <div>
                  <p class="font-semibold text-gray-900 dark:text-white">
                    {{ order.vendorName?.trim() || "No vendor" }}
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ order.itemCount }} parts · opened by
                    {{ order.requestedByName ?? "unknown" }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <UBadge variant="soft" :color="statusColor(order.status)">
                  {{ statusLabel(order.status) }}
                </UBadge>
                <span class="text-lg font-semibold">
                  {{ formatCurrencyFromCents(order.grandTotalCents) ?? "$0.00" }}
                </span>
                <VendorCartButton :order="order" compact />
                <UButton
                  v-if="nextStatus(order.status)"
                  size="xs"
                  variant="ghost"
                  color="primary"
                  icon="i-lucide-chevrons-right"
                  :loading="isOrderUpdating(order.id)"
                  @click="advanceOrder(order)"
                >
                  {{ statusLabel(nextStatus(order.status)!) }}
                </UButton>
                <UButton
                  v-if="order.status !== 'to_order'"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-receipt"
                  title="Shipping & payment details"
                  @click="openDetails(order)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-plus"
                  @click="openAddToOrder(order)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  :loading="isOrderDeleting(order.id)"
                  @click="deleteOrder(order)"
                />
              </div>
            </div>

            <div
              v-if="orderHasDetails(order)"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-200/70 px-3 py-2 text-xs text-gray-500 dark:border-gray-800/70"
            >
              <a
                v-if="order.trackingNumber"
                :href="carrierTrackingUrl(order.trackingCarrier, order.trackingNumber)!"
                target="_blank"
                class="inline-flex items-center gap-1 text-primary-500 hover:underline"
              >
                <UIcon name="i-lucide-truck" />
                {{ order.trackingCarrier ? order.trackingCarrier + " " : "" }}{{ order.trackingNumber }}
                <UIcon name="i-lucide-external-link" />
              </a>
              <span v-if="order.shippingCents != null" class="inline-flex items-center gap-1">
                <UIcon name="i-lucide-package" />
                Shipping {{ formatCurrencyFromCents(order.shippingCents) }}
              </span>
              <span v-if="order.taxCents != null" class="inline-flex items-center gap-1">
                <UIcon name="i-lucide-receipt" />
                Tax {{ formatCurrencyFromCents(order.taxCents) }}
              </span>
              <span
                v-for="p in order.payments"
                :key="p.id"
                class="inline-flex items-center gap-1"
              >
                <UIcon name="i-lucide-credit-card" />
                {{ p.label }} · {{ formatCurrencyFromCents(p.amountCents) }}
              </span>
            </div>

            <table class="w-full text-sm">
              <tbody>
                <tr
                  v-for="item in order.items"
                  :key="item.id"
                  draggable="true"
                  class="cursor-grab border-b border-gray-100 last:border-0 active:cursor-grabbing dark:border-gray-900"
                  @dragstart.stop="onTablePartDragStart($event, order, item)"
                  @dragend="onPartDragEnd"
                >
                  <td class="p-2">
                    <p class="font-medium text-gray-900 dark:text-white">
                      {{ item.partName }}
                    </p>
                    <p
                      v-if="item.variantTitle || item.variantId"
                      class="text-xs text-gray-500"
                    >
                      {{ item.variantTitle ?? item.variantId }}
                    </p>
                  </td>
                  <td class="p-2 text-center text-gray-500">x{{ item.quantity }}</td>
                  <td class="p-2 text-right text-gray-500">
                    {{ formatMicros(item.unitPriceMicros) ?? "--" }}
                  </td>
                  <td class="p-2 text-right font-medium">
                    {{
                      formatCurrencyFromCents(
                        lineTotalCents(item.unitPriceMicros, item.quantity),
                      ) ?? "--"
                    }}
                  </td>
                  <td class="p-2">
                    <div class="flex justify-end gap-1">
                      <UButton
                        v-if="item.externalUrl"
                        size="xs"
                        variant="ghost"
                        color="primary"
                        icon="i-lucide-external-link"
                        :to="item.externalUrl"
                        target="_blank"
                        title="Order from vendor"
                      />
                      <UButton
                        v-if="order.status === 'to_order' && order.items.length > 1"
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        icon="i-lucide-split"
                        title="Split into its own order"
                        @click="splitPartOut(order.id, item.id)"
                      />
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        icon="i-lucide-pencil"
                        @click="onEditItem({ order, item })"
                      />
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="error"
                        icon="i-lucide-trash-2"
                        @click="onDeleteItem({ order, item })"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div
        v-if="hasEmptyState"
        class="rounded-2xl border border-dashed border-gray-200/60 py-16 text-center"
      >
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          No orders yet
        </h3>
        <p class="mx-auto mt-1 max-w-lg text-sm text-gray-500">
          Add your first part — it'll group into a per-vendor order automatically.
        </p>
        <div class="mt-6">
          <UButton icon="i-lucide-plus" @click="() => openCreateEditor()">
            Add part
          </UButton>
        </div>
      </div>
    </UContainer>

    <OrderEditorSlideover
      v-model:open="isEditorOpen"
      :mode="editorMode"
      :initial-item="editorItem"
      :initial-url="editorInitialUrl"
      :hide-vendor="editorTargetOrderId !== null"
      :loading="isEditorSubmitting"
      :available-tags="availableTags"
      @submit="handleEditorSubmit"
    />

    <OrderDetailsSlideover
      v-model:open="isDetailsOpen"
      :order="detailsOrder"
      :loading="isDetailsSubmitting"
      :payment-methods="paymentMethods"
      @submit="handleDetailsSubmit"
      @order-updated="upsertOrder"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, watchEffect, onMounted } from "vue";
import type {
  Order,
  OrderItem,
  OrderDetailsValues,
  OrderEditorSubmitPayload,
  OrderEditorValues,
  OrderStatus,
  Tag,
} from "~/types/orders";
import { LazyDashboardImport } from "#components";
import { carrierTrackingUrl } from "~/utils/tracking";
import {
  formatCents as formatCurrencyFromCents,
  formatMicros,
  lineTotalCents,
  microsToDollars,
} from "~/utils/money";

definePageMeta({ layout: "app" });

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const orgs = useOrgs();
const toast = useToast();
const overlay = useOverlay();
const importModal = overlay.create(LazyDashboardImport);

const statuses = [
  {
    key: "to_order",
    label: "To order",
    description: "Parts to purchase",
    color: "primary" as const,
  },
  {
    key: "ordered",
    label: "Ordered",
    description: "Placed - awaiting arrival",
    color: "warning" as const,
  },
  {
    key: "arrived",
    label: "Arrived",
    description: "Received",
    color: "success" as const,
  },
] as const;

const statusSequence: OrderStatus[] = ["to_order", "ordered", "arrived"];

function statusLabel(key: OrderStatus) {
  return statuses.find((s) => s.key === key)?.label ?? key;
}
function statusColor(key: OrderStatus) {
  return statuses.find((s) => s.key === key)?.color ?? "neutral";
}
function nextStatus(status: OrderStatus): OrderStatus | null {
  const idx = statusSequence.indexOf(status);
  return idx === -1 ? null : (statusSequence[idx + 1] ?? null);
}

const viewOptions = ref([
  { value: "board", label: "Board", icon: "i-lucide-layout-dashboard" },
  { value: "table", label: "Table", icon: "i-lucide-table" },
]);
type ViewMode = "board" | "table";
const viewMode = ref<ViewMode>("board");

const {
  data: ordersData,
  isPending,
  refetch,
  isError,
  error,
  suspense,
} = useOrdersQuery();
await suspense();

const { data: tagsData } = await useFetch("/api/tags", {
  watch: [() => orgs.organization.value?.id],
});
const availableTags = computed<Tag[]>(
  () => (tagsData.value as { tags: Tag[] } | null)?.tags ?? [],
);

// Payment labels used before (e.g. saved credit cards) for reuse suggestions.
const { data: paymentMethodsData, refresh: refreshPaymentMethods } =
  await useFetch("/api/orders/payment-methods", {
    watch: [() => orgs.organization.value?.id],
  });
const paymentMethods = computed<{ type: string; label: string }[]>(
  () =>
    (paymentMethodsData.value as {
      methods: { type: string; label: string }[];
    } | null)?.methods ?? [],
);

const ordersState = ref<Order[]>([]);
watch(
  () => ordersData.value,
  (next) => {
    if (next) ordersState.value = [...next];
  },
  { immediate: true },
);

// --- filters --------------------------------------------------------------
const startDate = ref<string | null>(null);
const endDate = ref<string | null>(null);
const vendorFilter = ref<string>("");
const statusFilter = ref<OrderStatus | undefined>(undefined);
const tagFilter = ref<string>("");

function vendorKeyForOrder(order: Order) {
  if (order.vendorId) return `id:${order.vendorId}`;
  const name = order.vendorName?.trim();
  return name ? `manual:${name.toLocaleLowerCase()}` : "none";
}

const vendorOptions = computed(() => {
  const map = new Map<string, string>();
  for (const o of ordersState.value) {
    map.set(vendorKeyForOrder(o), o.vendorName?.trim() || "No vendor");
  }
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const tagOptions = computed(() =>
  availableTags.value.map((t) => ({ label: t.name, value: t.id })),
);

function parseISODate(value?: string | Date | null) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const filteredOrders = computed(() =>
  ordersState.value.filter((order) => {
    if (statusFilter.value && order.status !== statusFilter.value) return false;
    if (vendorFilter.value && vendorKeyForOrder(order) !== vendorFilter.value)
      return false;
    if (
      tagFilter.value &&
      !order.items.some((it) => it.tags?.some((t) => t.id === tagFilter.value))
    )
      return false;
    const date = parseISODate(order.orderedAt ?? order.createdAt);
    if (date) {
      if (startDate.value && date < new Date(startDate.value + "T00:00:00"))
        return false;
      if (endDate.value && date > new Date(endDate.value + "T23:59:59"))
        return false;
    }
    return true;
  }),
);

const grandTotalCents = computed(() =>
  filteredOrders.value.reduce((sum, o) => sum + o.grandTotalCents, 0),
);

function orderHasDetails(o: Order) {
  return (
    !!o.trackingNumber ||
    o.shippingCents != null ||
    o.taxCents != null ||
    (o.payments?.length ?? 0) > 0
  );
}
const filteredItemCount = computed(() =>
  filteredOrders.value.reduce((sum, o) => sum + o.itemCount, 0),
);

const boardColumns = computed(() =>
  statuses.map((status) => {
    const orders = filteredOrders.value.filter((o) => o.status === status.key);
    return {
      ...status,
      orders,
      totalCents: orders.reduce((sum, o) => sum + o.grandTotalCents, 0),
    };
  }),
);

function clearFilters() {
  startDate.value = null;
  endDate.value = null;
  vendorFilter.value = "";
  statusFilter.value = undefined;
  tagFilter.value = "";
}

// --- in-flight state ------------------------------------------------------
const updatingIds = ref<Set<string>>(new Set());
const deletingIds = ref<Set<string>>(new Set());
const isOrderUpdating = (id: string) => updatingIds.value.has(id);
const isOrderDeleting = (id: string) => deletingIds.value.has(id);
function setBusy(set: typeof updatingIds, id: string, value: boolean) {
  const next = new Set(set.value);
  if (value) next.add(id);
  else next.delete(id);
  set.value = next;
}

function upsertOrder(order: Order | null | undefined) {
  if (!order) return;
  const idx = ordersState.value.findIndex((o) => o.id === order.id);
  if (idx === -1) ordersState.value = [order, ...ordersState.value];
  else {
    const next = [...ordersState.value];
    next.splice(idx, 1, order);
    ordersState.value = next;
  }
}
function removeOrder(id: string) {
  ordersState.value = ordersState.value.filter((o) => o.id !== id);
}

// --- editor ---------------------------------------------------------------
const isEditorOpen = ref(false);
const editorMode = ref<"create" | "edit">("create");
const editorItem = ref<(OrderItem & { orderId: string }) | null>(null);
const editorInitialUrl = ref<string | null>(null);
const editorTargetOrderId = ref<string | null>(null);
const isEditorSubmitting = ref(false);

function openCreateEditor(initialUrl?: string) {
  editorMode.value = "create";
  editorItem.value = null;
  editorTargetOrderId.value = null;
  editorInitialUrl.value = initialUrl ?? null;
  isEditorOpen.value = true;
}
function openAddToOrder(order: Order) {
  editorMode.value = "create";
  editorItem.value = null;
  editorTargetOrderId.value = order.id;
  editorInitialUrl.value = null;
  isEditorOpen.value = true;
}
function onEditItem({ order, item }: { order: Order; item: OrderItem }) {
  editorMode.value = "edit";
  editorItem.value = { ...item, orderId: order.id };
  editorTargetOrderId.value = order.id;
  editorInitialUrl.value = null;
  isEditorOpen.value = true;
}

// --- order details (tracking / shipping / payments) -----------------------
const isDetailsOpen = ref(false);
const isDetailsSubmitting = ref(false);
const detailsOrder = ref<Order | null>(null);

function openDetails(order: Order) {
  detailsOrder.value = order;
  isDetailsOpen.value = true;
}

async function handleDetailsSubmit({
  orderId,
  values,
}: {
  orderId: string;
  values: OrderDetailsValues;
}) {
  isDetailsSubmitting.value = true;
  try {
    const { order } = await $fetch<{ order: Order }>(
      `/api/orders/${orderId}/details`,
      { method: "PATCH", body: values },
    );
    upsertOrder(order);
    isDetailsOpen.value = false;
    // Pick up any newly-used payment labels for next time's suggestions.
    refreshPaymentMethods();
    toast.add({
      title: "Order details saved",
      color: "success",
      icon: "i-lucide-check-circle",
    });
  } catch (err) {
    notifyError("Unable to save order details", err);
  } finally {
    isDetailsSubmitting.value = false;
  }
}

onMounted(() => {
  const addUrl = route.query.add;
  if (addUrl && typeof addUrl === "string") {
    router.replace({ query: { ...route.query, add: undefined } });
    openCreateEditor(addUrl);
  }
});

async function handleEditorSubmit(payload: OrderEditorSubmitPayload) {
  isEditorSubmitting.value = true;
  try {
    let ok = false;
    if (payload.mode === "edit" && payload.orderId && payload.itemId) {
      ok = await editPart(payload.orderId, payload.itemId, payload.values);
    } else if (editorTargetOrderId.value) {
      ok = await addPartToOrder(editorTargetOrderId.value, payload.values);
    } else {
      ok = await createPart(payload.values);
    }
    if (ok) isEditorOpen.value = false;
  } finally {
    isEditorSubmitting.value = false;
  }
}

// --- mutations ------------------------------------------------------------
async function createPart(values: OrderEditorValues): Promise<boolean> {
  try {
    const { order } = await $fetch<{ order: Order }>("/api/orders", {
      method: "POST",
      body: values,
    });
    upsertOrder(order);
    toast.add({ title: "Part added", color: "success", icon: "i-lucide-check-circle" });
    return true;
  } catch (err) {
    notifyError("Unable to add part", err);
    return false;
  }
}

async function addPartToOrder(
  orderId: string,
  values: OrderEditorValues,
): Promise<boolean> {
  try {
    const { order } = await $fetch<{ order: Order }>(
      `/api/orders/${orderId}/items`,
      { method: "POST", body: values },
    );
    upsertOrder(order);
    toast.add({ title: "Part added", color: "success", icon: "i-lucide-check-circle" });
    return true;
  } catch (err) {
    notifyError("Unable to add part", err);
    return false;
  }
}

async function editPart(
  orderId: string,
  itemId: string,
  values: OrderEditorValues,
): Promise<boolean> {
  try {
    const { order } = await $fetch<{ order: Order }>(
      `/api/orders/${orderId}/items/${itemId}`,
      { method: "PATCH", body: values },
    );
    upsertOrder(order);
    toast.add({ title: "Part updated", color: "success", icon: "i-lucide-check-circle" });
    return true;
  } catch (err) {
    notifyError("Unable to update part", err);
    return false;
  }
}

async function onDeleteItem({ order, item }: { order: Order; item: OrderItem }) {
  setBusy(updatingIds, order.id, true);
  try {
    const { order: updated } = await $fetch<{ order: Order | null }>(
      `/api/orders/${order.id}/items/${item.id}`,
      { method: "DELETE" },
    );
    if (updated) upsertOrder(updated);
    else removeOrder(order.id);
    toast.add({ title: "Part removed", color: "success", icon: "i-lucide-trash-2" });
  } catch (err) {
    notifyError("Unable to remove part", err);
  } finally {
    setBusy(updatingIds, order.id, false);
  }
}

async function setOrderStatus(orderId: string, status: OrderStatus) {
  const order = ordersState.value.find((o) => o.id === orderId);
  if (!order || order.status === status) return;
  setBusy(updatingIds, orderId, true);
  try {
    const { order: updated } = await $fetch<{ order: Order }>(
      `/api/orders/${orderId}`,
      { method: "PATCH", body: { status } },
    );
    upsertOrder(updated);
  } catch (err) {
    notifyError("Unable to update order", err);
  } finally {
    setBusy(updatingIds, orderId, false);
  }
}

async function advanceOrder(order: Order) {
  const next = nextStatus(order.status);
  if (next) await setOrderStatus(order.id, next);
}

async function deleteOrder(order: Order) {
  setBusy(deletingIds, order.id, true);
  try {
    await $fetch(`/api/orders/${order.id}`, { method: "DELETE" });
    removeOrder(order.id);
    toast.add({ title: "Order removed", color: "success", icon: "i-lucide-trash-2" });
  } catch (err) {
    notifyError("Unable to remove order", err);
  } finally {
    setBusy(deletingIds, order.id, false);
  }
}

async function doSplit(orderId: string, itemIds: string[]) {
  setBusy(updatingIds, orderId, true);
  try {
    const { source, created } = await $fetch<{
      source: Order | null;
      created: Order | null;
    }>("/api/orders/split", {
      method: "POST",
      body: { orderId, itemIds },
    });
    if (source) upsertOrder(source);
    else removeOrder(orderId);
    upsertOrder(created);
    toast.add({
      title: "Split into a new order",
      color: "success",
      icon: "i-lucide-split",
    });
  } catch (err) {
    notifyError("Unable to split order", err);
  } finally {
    setBusy(updatingIds, orderId, false);
  }
}

// Separate one part into its own new order — from dragging into empty space
// (board) or the split button (table). No-op if it's the order's only part.
async function splitPartOut(orderId: string, itemId: string) {
  const src = ordersState.value.find((o) => o.id === orderId);
  if (!src || src.status !== "to_order" || src.items.length <= 1) return;
  await doSplit(orderId, [itemId]);
}

// --- drag a part into another open order ("join") -------------------------
const draggingPart = ref<{ orderId: string; itemId: string } | null>(null);
const dropOrderTarget = ref<string | null>(null);

function onPartDragStart({ order, item }: { order: Order; item: OrderItem }) {
  draggingPart.value = { orderId: order.id, itemId: item.id };
  draggingId.value = null; // ensure we're not also order-dragging
}
// Table rows carry the native event so we can prime dataTransfer here.
function onTablePartDragStart(event: DragEvent, order: Order, item: OrderItem) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  }
  onPartDragStart({ order, item });
}
function onPartDragEnd() {
  draggingPart.value = null;
  dropOrderTarget.value = null;
}

function draggedSourceOrder(): Order | undefined {
  return draggingPart.value
    ? ordersState.value.find((o) => o.id === draggingPart.value?.orderId)
    : undefined;
}

// Parts can only be combined between two open orders of the SAME vendor.
function isMoveTarget(order: Order) {
  const src = draggedSourceOrder();
  return (
    !!draggingPart.value &&
    !!src &&
    src.status === "to_order" &&
    order.status === "to_order" &&
    order.id !== draggingPart.value.orderId &&
    vendorKeyForOrder(src) === vendorKeyForOrder(order)
  );
}

function onCardDragOver(event: DragEvent, order: Order) {
  if (!isMoveTarget(order)) return;
  event.preventDefault(); // allow drop
  dropOrderTarget.value = order.id;
}
function onCardDragLeave(order: Order) {
  if (dropOrderTarget.value === order.id) dropOrderTarget.value = null;
}
async function onCardDrop(event: DragEvent, order: Order) {
  if (!draggingPart.value) return; // order drags bubble to the column
  // A drop on a card is a join (or a no-op) — never a split-out, so stop it
  // from reaching the column's drop handler.
  event.stopPropagation();
  const src = draggedSourceOrder();
  const dp = draggingPart.value;
  draggingPart.value = null;
  dropOrderTarget.value = null;
  if (!src || src.id === order.id) return;
  if (src.status !== "to_order" || order.status !== "to_order") {
    toast.add({
      title: "Only parts in a “To order” order can be combined",
      color: "warning",
      icon: "i-lucide-info",
    });
    return;
  }
  if (vendorKeyForOrder(src) !== vendorKeyForOrder(order)) {
    toast.add({
      title: "Parts can only be combined within the same vendor",
      color: "warning",
      icon: "i-lucide-info",
    });
    return;
  }
  await movePart(dp.itemId, order.id, dp.orderId);
}

async function movePart(
  itemId: string,
  targetOrderId: string,
  sourceOrderId: string,
) {
  setBusy(updatingIds, targetOrderId, true);
  setBusy(updatingIds, sourceOrderId, true);
  try {
    const { orders, removedOrderIds } = await $fetch<{
      orders: Order[];
      removedOrderIds: string[];
    }>("/api/orders/move", {
      method: "POST",
      body: { targetOrderId, itemIds: [itemId] },
    });
    for (const id of removedOrderIds) removeOrder(id);
    for (const order of orders) upsertOrder(order);
    toast.add({
      title: "Part moved",
      color: "success",
      icon: "i-lucide-corner-up-right",
    });
  } catch (err) {
    notifyError("Unable to move part", err);
  } finally {
    setBusy(updatingIds, targetOrderId, false);
    setBusy(updatingIds, sourceOrderId, false);
  }
}

// --- board drag (whole order between status columns) ----------------------
const dropTarget = ref<OrderStatus | null>(null);
const draggingId = ref<string | null>(null);
function onDragStart(id: string) {
  draggingId.value = id;
}
function onDragEnd() {
  draggingId.value = null;
  dropTarget.value = null;
}
async function onDrop(status: OrderStatus) {
  // A part dropped on the "To order" column's empty space splits out into its
  // own new order.
  if (draggingPart.value) {
    const dp = draggingPart.value;
    draggingPart.value = null;
    dropTarget.value = null;
    dropOrderTarget.value = null;
    if (status !== "to_order") return;
    const src = ordersState.value.find((o) => o.id === dp.orderId);
    if (src && src.status !== "to_order") {
      toast.add({
        title: "Only parts in a “To order” order can be split out",
        color: "warning",
        icon: "i-lucide-info",
      });
      return;
    }
    await splitPartOut(dp.orderId, dp.itemId);
    return;
  }
  const id = draggingId.value;
  draggingId.value = null;
  dropTarget.value = null;
  if (id) await setOrderStatus(id, status);
}
function onDragOver(status: OrderStatus) {
  if (!draggingId.value) return; // ignore while dragging a part
  dropTarget.value = status;
}
function onDragLeave(status: OrderStatus) {
  if (dropTarget.value === status) dropTarget.value = null;
}

// --- misc -----------------------------------------------------------------
async function refreshOrders() {
  await refetch();
}
async function handleImportClick() {
  const instance = importModal.open();
  await instance.result;
  await refreshOrders();
}

const isExportingCsv = ref(false);
const csvColumns: { label: string; get: (o: Order, i: OrderItem) => string }[] = [
  { label: "Vendor", get: (o) => o.vendorName ?? "" },
  { label: "Order Status", get: (o) => statusLabel(o.status) },
  { label: "Part", get: (_o, i) => i.partName },
  { label: "Quantity", get: (_o, i) => String(i.quantity) },
  {
    label: "Unit Price (USD)",
    // Sub-cent unit prices are real (DigiKey quantity breaks), so export the
    // exact figure rather than rounding it to cents.
    get: (_o, i) =>
      i.unitPriceMicros == null
        ? ""
        : String(microsToDollars(i.unitPriceMicros)),
  },
  {
    label: "Line Total (USD)",
    get: (_o, i) =>
      i.unitPriceMicros == null
        ? ""
        : (lineTotalCents(i.unitPriceMicros, i.quantity) / 100).toFixed(2),
  },
  { label: "Variant", get: (_o, i) => i.variantTitle ?? i.variantId ?? "" },
  { label: "Requested By", get: (_o, i) => i.requestedByName ?? "" },
  { label: "External URL", get: (_o, i) => i.externalUrl ?? "" },
];

function escapeCsv(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function exportOrdersCsv() {
  if (filteredOrders.value.length === 0 || typeof window === "undefined") return;
  isExportingCsv.value = true;
  try {
    const header = csvColumns.map((c) => c.label).join(",");
    const lines: string[] = [];
    for (const order of filteredOrders.value) {
      for (const item of order.items) {
        lines.push(
          csvColumns.map((c) => escapeCsv(c.get(order, item))).join(","),
        );
      }
    }
    const blob = new Blob([[header, ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    notifyError("Unable to export orders", err);
  } finally {
    isExportingCsv.value = false;
  }
}


type ErrorPayload = {
  data?: { statusMessage?: string };
  statusMessage?: string;
  message?: string;
};
function extractErrorMessage(err: unknown) {
  const e = err as ErrorPayload | null;
  if (e && typeof e === "object") {
    if (e.data?.statusMessage) return e.data.statusMessage;
    if (e.statusMessage) return e.statusMessage;
    if (e.message) return e.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
function notifyError(title: string, err: unknown) {
  toast.add({
    title,
    description: extractErrorMessage(err),
    color: "error",
    icon: "i-lucide-alert-triangle",
  });
}

const hasEmptyState = computed(
  () => !isPending.value && ordersState.value.length === 0,
);

watchEffect(() => {
  if (auth.session.value && orgs.organization.value) refreshOrders();
});
</script>
