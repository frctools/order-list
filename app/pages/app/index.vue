<template>
  <div class="min-h-screen bg-default">
    <UContainer class="mx-auto flex flex-col gap-6 py-6 lg:py-8">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
            Project order board
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <h1
              class="text-3xl font-semibold tracking-tight text-primary-900 dark:text-primary-100"
            >
              Orders
            </h1>
            <ProjectSwitcher @change="handleProjectChange" />
          </div>
          <p class="mt-1 max-w-2xl text-sm text-gray-500">
            {{ projects.project.value?.description || 'Track parts from request to delivery for this project.' }}
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
            Import orders
          </UButton>
          <UButton icon="i-lucide-plus" @click="() => openCreateEditor()">
            New order
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

      <div
        class="sticky top-2 z-20 rounded-2xl border border-default bg-default/90 p-3 shadow-sm backdrop-blur"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="searchFilter"
            icon="i-lucide-search"
            placeholder="Search parts, vendors, people…"
            class="min-w-56 flex-1"
          />
          <USelectMenu
            v-model="vendorFilter"
            :items="vendorOptions"
            value-key="value"
            searchable
            placeholder="All vendors"
            class="w-44"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusOptions"
            value-key="value"
            placeholder="All statuses"
            class="w-40"
          />
          <USelectMenu
            v-model="tagFilter"
            :items="tagOptions"
            value-key="value"
            searchable
            placeholder="All tags"
            class="w-40"
          />
          <UButton
            v-if="activeFilterCount"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            @click="clearFilters"
          >
            Clear {{ activeFilterCount }}
          </UButton>
        </div>
      </div>

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

        <div
          v-else
          class="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
        >
          <section
            v-for="column in boardColumns"
            :key="column.key"
            class="flex min-w-[86vw] snap-center flex-col sm:min-w-96 lg:min-w-0"
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
                {{ column.items.length }}
              </UBadge>
            </div>

            <div
              class="h-[calc(100dvh-18rem)] min-h-96 flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-xl border border-dashed border-gray-300/60 bg-white/80 p-3 transition-all dark:bg-gray-950/60"
              :class="
                dropTarget === column.key
                  ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-transparent'
                  : ''
              "
              @dragover.prevent="onDragOver(column.key)"
              @dragleave="onDragLeave(column.key)"
              @drop.prevent="onDrop(column.key)"
            >
              <p
                v-if="column.items.length === 0"
                class="py-10 text-center text-sm text-gray-500"
              >
                {{ activeFilterCount ? 'No matching orders in this stage.' : 'Drag an order here or create a new one.' }}
              </p>

              <UCard
                v-for="order in column.items"
                :key="order.id"
                class="cursor-grab shadow-sm active:cursor-grabbing"
                :ui="{ header: 'p-3 sm:p-3', body: 'p-3 sm:p-3', footer: 'p-2 sm:p-2' }"
                :draggable="!isOrderUpdating(order.id)"
                @dragstart="onDragStart(order.id)"
                @dragend="onDragEnd"
              >
                <template #header>
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p
                        class="text-sm font-semibold leading-tight text-gray-900 dark:text-white"
                      >
                        {{ order.partName }}
                      </p>
                      <p class="text-xs text-gray-500">
                        Requested by
                        {{ order.requestedByName ?? "unknown user" }}
                      </p>
                    </div>
                    <UBadge color="neutral" variant="soft" size="sm">
                      x{{ order.quantity }}
                    </UBadge>
                  </div>
                </template>

                <div class="space-y-3">
                  <p
                    v-if="order.description"
                    class="line-clamp-2 text-sm text-gray-500 dark:text-gray-300"
                  >
                    {{ order.description }}
                  </p>

                  <div class="grid gap-2 text-xs text-gray-500">
                    <div
                      v-if="order.unitPriceCents !== null"
                      class="flex items-center gap-2"
                    >
                      <UIcon name="i-lucide-banknote" class="text-sm" />
                      <span>{{
                        formatCurrencyFromCents(order.unitPriceCents)
                      }}</span>
                    </div>
                    <div
                      v-if="order.variantTitle || order.variantId"
                      class="flex items-center gap-2"
                    >
                      <UIcon name="i-lucide-tags" class="text-sm" />
                      <span>
                        {{ order.variantTitle ?? order.variantId }}
                        <span
                          v-if="order.variantTitle && order.variantId"
                          class="text-gray-400"
                        >
                          ({{ order.variantId }})
                        </span>
                      </span>
                    </div>
                    <div
                      v-if="order.vendorName"
                      class="flex items-center gap-2"
                    >
                      <UIcon name="i-lucide-store" class="text-sm" />
                      <span>{{ order.vendorName }}</span>
                    </div>

                    <div v-if="order.orderedAt" class="flex items-center gap-2">
                      <UIcon name="i-lucide-calendar-check" class="text-sm" />
                      <span>Ordered {{ formatDate(order.orderedAt) }}</span>
                    </div>
                    <div v-if="order.arrivedAt" class="flex items-center gap-2">
                      <UIcon name="i-lucide-package-check" class="text-sm" />
                      <span>Arrived {{ formatDate(order.arrivedAt) }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-clock-8" class="text-sm" />
                      <span
                        >Updated
                        {{ formatDate(order.updatedAt) ?? "just now" }}</span
                      >
                    </div>
                  </div>

                  <div
                    v-if="order.tags && order.tags.length > 0"
                    class="mt-3 flex flex-wrap gap-1"
                  >
                    <UBadge
                      v-for="tag in order.tags"
                      :key="tag.id"
                      variant="subtle"
                      size="xs"
                      :style="{
                        backgroundColor: tag.color,
                      }"
                      :class="textColor(tag.color)"
                    >
                      {{ tag.name }}
                    </UBadge>
                  </div>
                </div>

                <template #footer>
                  <div class="flex flex-wrap justify-end gap-2">
                    <UButton
                      v-if="order.externalUrl"
                      size="xs"
                      variant="soft"
                      color="neutral"
                      icon="i-lucide-shopping-cart"
                      :to="order.externalUrl"
                      target="_blank"
                    >
                      Order
                    </UButton>
                    <UButton
                      v-if="getNextStatus(order.status)"
                      size="xs"
                      variant="soft"
                      color="primary"
                      icon="i-lucide-chevrons-right"
                      :loading="isOrderUpdating(order.id)"
                      @click="advanceStatus(order)"
                    >
                      Advance
                    </UButton>
                    <UButton
                      size="xs"
                      variant="soft"
                      color="neutral"
                      icon="i-lucide-pencil"
                      :loading="isOrderUpdating(order.id)"
                      @click="openEditEditor(order)"
                    >
                      Edit
                    </UButton>
                    <UButton
                      size="xs"
                      variant="soft"
                      color="error"
                      icon="i-lucide-trash-2"
                      :loading="isOrderDeleting(order.id)"
                      @click="deleteOrder(order)"
                    >
                      Remove
                    </UButton>
                  </div>
                </template>
              </UCard>
            </div>
          </section>
        </div>
      </div>

      <div v-else class="overflow-hidden">
        <div class="mb-4 grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <UFormField label="Start date">
              <UInput
                v-model="startDate"
                type="date"
                class="w-full"
                size="xl"
              />
            </UFormField>
          </div>
          <div class="space-y-2">
            <UFormField label="End date">
              <UInput v-model="endDate" type="date" class="w-full" size="xl" />
            </UFormField>
          </div>
        </div>

        <div class="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">
              Total
              {{
                statusFilter
                  ? statusLookup[statusFilter]?.pastTense
                  : "spent and requested"
              }}
            </h2>
            <p class="text-2xl font-semibold">
              {{ formatCurrencyFromCents(totalSpentCents) ?? "$0.00" }}
            </p>
            <p class="text-sm text-gray-500">
              Showing {{ filteredCount }} orders
            </p>
          </div>

          <div class="flex gap-2">
            <UButton
              variant="soft"
              color="neutral"
              icon="i-lucide-download"
              :disabled="filteredTableRows.length === 0"
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
        <div v-else class="max-h-[70dvh] overflow-auto rounded-xl border border-default">
          <UTable
            :columns="orderTableColumns"
            :data="filteredTableRows"
            :loading="isPending"
            sticky
            class="w-full"
          >
          <template #partName-cell="{ row }">
            <div class="flex flex-col">
              <span
                class="text-sm font-semibold text-gray-900 dark:text-white max-w-48 text-wrap"
              >
                {{ row.getValue("partName") }}
              </span>
              <span
                v-if="row.original.description"
                class="text-xs text-gray-500 max-w-48 text-wrap line-clamp-3"
              >
                {{ row.original.description }}
              </span>
            </div>
          </template>
          <template #tags-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="tag in row.original.tags"
                :key="tag.id"
                variant="subtle"
                size="xs"
                :style="{
                  backgroundColor: tag.color,
                }"
                :class="textColor(tag.color)"
              >
                {{ tag.name }}
              </UBadge>
            </div>
          </template>
          <template #status-cell="{ row }">
            <UBadge
              variant="soft"
              :color="
                statusLookup[
                  row.getValue('status') as keyof typeof statusLookup
                ]?.color ?? 'neutral'
              "
            >
              {{
                statusLookup[
                  row.getValue("status") as keyof typeof statusLookup
                ]?.label ?? row.getValue("status")
              }}
            </UBadge>
          </template>

          <template #quantity-cell="{ row }">
            <span class="font-medium text-gray-900 dark:text-white">
              x{{ row.getValue("quantity") }}
            </span>
          </template>

          <template #unitPriceCents-cell="{ row }">
            {{
              formatCurrencyFromCents(row.getValue("unitPriceCents")) ?? "--"
            }}
          </template>

          <template #vendorName-cell="{ row }">
            {{ row.getValue("vendorName") ?? row.original["vendorId"] ?? "--" }}
          </template>

          <template #requestedByName-cell="{ row }">
            {{
              row.getValue("requestedByName") ??
              row.getValue("requestedBy") ??
              "--"
            }}
          </template>

          <template #updatedAt-cell="{ row }">
            {{ formatDate(row.getValue("updatedAt")) ?? "--" }}
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-2">
              <UButton
                v-if="getNextStatus(row.getValue('status'))"
                size="xs"
                variant="ghost"
                color="primary"
                icon="i-lucide-chevrons-right"
                :loading="isOrderUpdating(row.id)"
                @click="advanceStatus(row.original)"
              >
                Advance
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-pencil"
                :loading="isOrderUpdating(row.id)"
                @click="openEditEditor(row.original)"
              >
                Edit
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                :loading="isOrderDeleting(row.original.id)"
                @click="deleteOrder(row.original)"
              >
                Remove
              </UButton>
            </div>
          </template>
          </UTable>
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
          Start this project by adding its first part request.
        </p>
        <div class="mt-6">
          <UButton icon="i-lucide-plus" @click="() => openCreateEditor()">
            Create order
          </UButton>
        </div>
      </div>
    </UContainer>
    <OrderEditorSlideover
      v-model:open="isEditorOpen"
      :mode="editorMode"
      :initial-order="editorOrder"
      :initial-url="editorInitialUrl"
      :loading="isEditorSubmitting"
      :available-tags="availableTags"
      @submit="handleEditorSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { TinyColor } from "@ctrl/tinycolor";
import { computed, ref, watch, watchEffect, onMounted } from "vue";
import type { TableColumn } from "#ui/types";
import type {
  Order,
  OrderEditorSubmitPayload,
  OrderEditorValues,
  Tag,
} from "~/types/orders";
import { LazyDashboardImport } from "#components";

definePageMeta({
  layout: "app",
});

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const orgs = useOrgs();
const projects = useProjects();
await projects.fetchProjects();
const activeProjectId = computed(() => projects.project.value?.id ?? null);

const toast = useToast();
const overlay = useOverlay();

const importModal = overlay.create(LazyDashboardImport);

const statuses = [
  {
    key: "to_order",
    label: "To order",
    pastTense: "requested",
    description: "Parts requests - awaiting purchase",
    color: "primary",
  },
  {
    key: "ordered",
    label: "Ordered",
    pastTense: "ordered",
    description: "Placed orders - awaiting arrival",
    color: "warning",
  },
  {
    key: "arrived",
    label: "Arrived",
    pastTense: "arrived",
    description: "Items received",
    color: "success",
  },
] as const;

type StatusKey = (typeof statuses)[number]["key"];

const statusLookup = Object.fromEntries(
  statuses.map((status) => [status.key, status]),
) as Record<StatusKey, (typeof statuses)[number]>;

const statusOptions = statuses.map(status => ({
  value: status.key,
  label: status.label,
}));

const viewOptions = ref([
  {
    value: "board",
    label: "Board",
    icon: "i-lucide-layout-dashboard",
  },
  {
    value: "table",
    label: "Table",
    icon: "i-lucide-table",
  },
]);

type ViewMode = (typeof viewOptions)["value"][number]["value"];

const viewMode = ref<ViewMode>("board");

function vendorKeyForOrder(order: Pick<Order, "vendorId" | "vendorName">) {
  if (order.vendorId) {
    return `id:${order.vendorId}`;
  }
  const name = order.vendorName?.trim();
  if (name && name.length > 0) {
    return `manual:${name.toLocaleLowerCase()}`;
  }
  return "";
}

function vendorLabelForOrder(order: Pick<Order, "vendorId" | "vendorName">) {
  return order.vendorName?.trim() ?? order.vendorId ?? "Unknown vendor";
}

type OrderTableRow = Order & {
  actions: string;
  vendorKey: string;
};

const orderTableColumns: TableColumn<OrderTableRow>[] = [
  { accessorKey: "partName", header: "Part" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = statusLookup[row.original.status];
      return status ? status.label : row.original.status;
    },
  },
  {
    accessorKey: "tags",
    header: "Tags",
  },
  { accessorKey: "quantity", header: "Qty" },
  { accessorKey: "unitPriceCents", header: "Unit price" },
  {
    header: "Total price",
    cell: ({ row }) => {
      const qty = row.original.quantity ?? 0;
      const unitCents = row.original.unitPriceCents ?? 0;
      const totalCents = qty * unitCents;
      return totalCents > 0 ? formatCurrencyFromCents(totalCents) : "--";
    },
  },
  { accessorKey: "vendorName", header: "Vendor" },
  { accessorKey: "requestedByName", header: "Requested by" },
  { accessorKey: "updatedAt", header: "Updated" },
  { accessorKey: "actions", header: "" },
];

type CsvColumn = {
  label: string;
  getValue: (row: OrderTableRow) => string | number | null | undefined;
};

const csvExportColumns: CsvColumn[] = [
  { label: "Part", getValue: (row) => row.partName },
  { label: "Description", getValue: (row) => row.description ?? "" },
  {
    label: "Status",
    getValue: (row) =>
      statusLookup[row.status as StatusKey]?.label ?? row.status,
  },
  { label: "Quantity", getValue: (row) => row.quantity ?? "" },
  {
    label: "Unit Price (USD)",
    getValue: (row) =>
      row.unitPriceCents === undefined || row.unitPriceCents === null
        ? ""
        : (row.unitPriceCents / 100).toFixed(2),
  },
  {
    label: "Vendor",
    getValue: (row) => row.vendorName ?? row.vendorId ?? "",
  },
  {
    label: "Requested By",
    getValue: (row) => row.requestedByName ?? row.requestedBy ?? "",
  },
  { label: "Ordered At", getValue: (row) => row.orderedAt ?? "" },
  { label: "Arrived At", getValue: (row) => row.arrivedAt ?? "" },
  { label: "Updated At", getValue: (row) => row.updatedAt ?? "" },
  { label: "External URL", getValue: (row) => row.externalUrl ?? "" },
];

const {
  data: ordersData,
  isPending,
  refetch,
  isError,
  error,
  suspense,
} = useOrdersQuery(activeProjectId);
await suspense();

const { data: tagsData } = await useFetch("/api/tags", {
  watch: [() => orgs.organization.value?.id],
});

const availableTags = computed<Tag[]>(
  () => (tagsData.value as { tags: Tag[] } | null)?.tags ?? [],
);

const ordersState = ref<Order[]>([]);

watch(
  () => ordersData.value,
  (newOrders) => {
    if (newOrders) {
      ordersState.value = [...newOrders];
    }
  },
  { immediate: true },
);

const startDate = ref<string | undefined>(undefined);
const endDate = ref<string | undefined>(undefined);
const searchFilter = ref("");
const vendorFilter = ref<string>("");
const statusFilter = ref<StatusKey | undefined>(undefined);
const tagFilter = ref<string>("");

const vendorsForFilter = computed(() => {
  const map = new Map<string, { id: string; name: string }>();
  for (const o of ordersState.value) {
    const key = vendorKeyForOrder(o);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { id: key, name: vendorLabelForOrder(o) });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const vendorOptions = computed(() =>
  vendorsForFilter.value.map((v) => ({ label: v.name, value: v.id })),
);

const tagOptions = computed(() =>
  availableTags.value.map((t) => ({ label: t.name, value: t.id })),
);

function parseISODate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const filteredTableRows = computed(() => {
  return tableRows.value.filter((row) => {
    if (searchFilter.value.trim()) {
      const search = searchFilter.value.trim().toLocaleLowerCase();
      const haystack = [
        row.partName,
        row.description,
        row.vendorName,
        row.requestedByName,
        row.variantTitle,
        ...(row.tags?.map(tag => tag.name) ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (vendorFilter.value && row.vendorKey !== vendorFilter.value)
      return false;
    if (statusFilter.value && row.status != statusFilter.value) return false;
    if (tagFilter.value && !row.tags?.some((t) => t.id === tagFilter.value))
      return false;
    const date = parseISODate(row.orderedAt ?? row.createdAt);
    if (!date) return true;
    if (startDate.value) {
      const s = new Date(startDate.value + "T00:00:00");
      if (date < s) return false;
    }
    if (endDate.value) {
      const e = new Date(endDate.value + "T23:59:59");
      if (date > e) return false;
    }
    return true;
  });
});

const totalSpentCents = computed(() => {
  return filteredTableRows.value.reduce((sum, row) => {
    const cents = row.unitPriceCents ?? null;
    if (cents === null || cents === undefined) return sum;
    return sum + cents * (row.quantity ?? 0);
  }, 0);
});

const filteredCount = computed(() => filteredTableRows.value.length);

const isExportingCsv = ref(false);

function clearFilters() {
  searchFilter.value = "";
  startDate.value = undefined;
  endDate.value = undefined;
  vendorFilter.value = "";
  statusFilter.value = undefined;
  tagFilter.value = "";
}

const activeFilterCount = computed(() =>
  [
    searchFilter.value,
    vendorFilter.value,
    statusFilter.value,
    tagFilter.value,
    startDate.value,
    endDate.value,
  ].filter(Boolean).length,
);

const statusSequence: StatusKey[] = statuses.map((status) => status.key);

const boardColumns = computed(() =>
  statuses.map((status) => ({
    ...status,
    items: filteredTableRows.value.filter(
      (order) => order.status === status.key,
    ),
  })),
);

const tableRows = computed<OrderTableRow[]>(() =>
  ordersState.value.map((order) => ({
    ...order,
    actions: order.id,
    vendorKey: vendorKeyForOrder(order),
  })),
);

const dropTarget = ref<StatusKey | null>(null);
const draggingId = ref<string | null>(null);
const updatingIds = ref<string[]>([]);
const deletingIds = ref<string[]>([]);

const isEditorOpen = ref(false);
const editorMode = ref<"create" | "edit">("create");
const editorOrder = ref<Order | null>(null);
const editorInitialUrl = ref<string | null>(null);
const isEditorSubmitting = ref(false);

function openCreateEditor(initialUrl?: string) {
  editorMode.value = "create";
  editorOrder.value = null;
  editorInitialUrl.value = initialUrl ?? null;
  isEditorSubmitting.value = false;
  isEditorOpen.value = true;
}

function openEditEditor(order: Order) {
  editorMode.value = "edit";
  editorOrder.value = { ...order };
  editorInitialUrl.value = null;
  isEditorSubmitting.value = false;
  isEditorOpen.value = true;
}

onMounted(() => {
  const addUrl = route.query.add;
  if (addUrl && typeof addUrl === "string") {
    router.replace({ query: { ...route.query, add: undefined } });
    openCreateEditor(addUrl);
  }
});

type ErrorWithStatusMessage = {
  data?: {
    statusMessage?: string;
  };
  statusMessage?: string;
  message?: string;
};

function hasStatusMessagePayload(err: unknown): err is ErrorWithStatusMessage {
  if (!err || typeof err !== "object") return false;
  const candidate = err as Partial<ErrorWithStatusMessage>;
  return Boolean(
    candidate.statusMessage || candidate.message || candidate.data,
  );
}

function extractErrorMessage(err: unknown) {
  if (hasStatusMessagePayload(err)) {
    if (err.data?.statusMessage) return err.data.statusMessage;
    if (err.statusMessage) return err.statusMessage;
    if (err.message) return err.message;
  }
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

function setUpdating(id: string, value: boolean) {
  if (value) {
    if (!updatingIds.value.includes(id)) {
      updatingIds.value = [...updatingIds.value, id];
    }
  } else {
    updatingIds.value = updatingIds.value.filter((existing) => existing !== id);
  }
}

function setDeleting(id: string, value: boolean) {
  if (value) {
    if (!deletingIds.value.includes(id)) {
      deletingIds.value = [...deletingIds.value, id];
    }
  } else {
    deletingIds.value = deletingIds.value.filter((existing) => existing !== id);
  }
}

const isOrderUpdating = (id: string) => updatingIds.value.includes(id);
const isOrderDeleting = (id: string) => deletingIds.value.includes(id);

function upsertOrder(order: Order) {
  const index = ordersState.value.findIndex((item) => item.id === order.id);
  if (index === -1) {
    ordersState.value = [order, ...ordersState.value];
  } else {
    const next = [...ordersState.value];
    next.splice(index, 1, order);
    ordersState.value = next;
  }
}

async function createOrderFromEditor(
  values: OrderEditorValues,
): Promise<boolean> {
  try {
    const response = await $fetch<{ order: Order }>("/api/orders", {
      method: "POST",
      body: { ...values, projectId: activeProjectId.value },
    });

    upsertOrder(response.order);
    toast.add({
      title: "Order created",
      color: "success",
      icon: "i-lucide-check-circle",
    });
    return true;
  } catch (err) {
    toast.add({
      title: "Unable to create order",
      description: extractErrorMessage(err),
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
    return false;
  }
}

async function updateOrderFromEditor(
  orderId: string,
  values: OrderEditorValues,
): Promise<boolean> {
  try {
    const response = await $fetch<{ order: Order }>(`/api/orders/${orderId}`, {
      method: "PATCH",
      body: values,
    });

    upsertOrder(response.order);
    toast.add({
      title: "Order updated",
      color: "success",
      icon: "i-lucide-check-circle",
    });
    return true;
  } catch (err) {
    toast.add({
      title: "Unable to update order",
      description: extractErrorMessage(err),
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
    return false;
  }
}

async function handleEditorSubmit(payload: OrderEditorSubmitPayload) {
  isEditorSubmitting.value = true;
  try {
    if (payload.mode === "create") {
      const created = await createOrderFromEditor(payload.values);
      if (created) {
        isEditorOpen.value = false;
      }
    } else if (payload.mode === "edit" && payload.orderId) {
      const updated = await updateOrderFromEditor(
        payload.orderId,
        payload.values,
      );
      if (updated) {
        isEditorOpen.value = false;
      }
    }
  } finally {
    isEditorSubmitting.value = false;
  }
}

async function updateOrderStatus(orderId: string, status: StatusKey) {
  const order = ordersState.value.find((item) => item.id === orderId);
  if (!order || order.status === status) return;

  setUpdating(orderId, true);
  try {
    const response = await $fetch<{ order: Order }>(`/api/orders/${orderId}`, {
      method: "PATCH",
      body: { status },
    });

    upsertOrder(response.order);
    toast.add({
      title: "Order updated",
      color: "success",
      icon: "i-lucide-check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Unable to update order",
      description: extractErrorMessage(err),
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
  } finally {
    setUpdating(orderId, false);
  }
}

function getNextStatus(status: StatusKey): StatusKey | null {
  const index = statusSequence.indexOf(status);
  if (index === -1) return null;
  return statusSequence[index + 1] ?? null;
}

async function advanceStatus(order: Order) {
  const next = getNextStatus(order.status);
  if (!next) return;
  await updateOrderStatus(order.id, next);
}

function onDragStart(orderId: string) {
  draggingId.value = orderId;
}

function onDragEnd() {
  draggingId.value = null;
  dropTarget.value = null;
}

async function onDrop(status: StatusKey) {
  if (!draggingId.value) return;
  const id = draggingId.value;
  draggingId.value = null;
  dropTarget.value = null;
  await updateOrderStatus(id, status);
}

function onDragOver(status: StatusKey) {
  dropTarget.value = status;
}

function onDragLeave(status: StatusKey) {
  if (dropTarget.value === status) {
    dropTarget.value = null;
  }
}

async function deleteOrder(order: Pick<Order, "id">) {
  setDeleting(order.id, true);
  try {
    await $fetch(`/api/orders/${order.id}`, { method: "DELETE" });
    ordersState.value = ordersState.value.filter(
      (item) => item.id !== order.id,
    );
    toast.add({
      title: "Order removed",
      color: "success",
      icon: "i-lucide-trash-2",
    });
  } catch (err) {
    toast.add({
      title: "Unable to remove order",
      description: extractErrorMessage(err),
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
  } finally {
    setDeleting(order.id, false);
  }
}

async function refreshOrders() {
  await refetch();
}

async function handleProjectChange() {
  ordersState.value = [];
  clearFilters();
  await nextTick();
  await refetch();
}

async function handleImportClick() {
  const instance = importModal.open();
  await instance.result;
  await refreshOrders();
}

function escapeCsvValue(value: string | number | null | undefined) {
  const raw = value ?? "";
  const stringValue = typeof raw === "string" ? raw : String(raw);
  if (/[",\r\n]/.test(stringValue)) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

function buildCsvContent(rows: OrderTableRow[]) {
  const header = csvExportColumns.map((column) => column.label).join(",");
  const dataLines = rows.map((row) =>
    csvExportColumns
      .map((column) => escapeCsvValue(column.getValue(row)))
      .join(","),
  );
  return [header, ...dataLines].join("\r\n");
}

async function exportOrdersCsv() {
  if (filteredTableRows.value.length === 0) return;
  if (typeof window === "undefined") return;

  isExportingCsv.value = true;
  try {
    const csvContent = buildCsvContent(filteredTableRows.value);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `orders-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.add({
      title: "Export ready",
      description: `${filteredTableRows.value.length} orders downloaded`,
      color: "success",
      icon: "i-lucide-download",
    });
  } catch (err) {
    toast.add({
      title: "Unable to export orders",
      description: extractErrorMessage(err),
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
  } finally {
    isExportingCsv.value = false;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function formatCurrencyFromCents(value?: number | null) {
  if (value === undefined || value === null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value / 100);
  } catch {
    return `${(value / 100).toFixed(2)}`;
  }
}

const hasEmptyState = computed(
  () => !isPending.value && ordersState.value.length === 0,
);

watchEffect(() => {
  if (auth.session.value && orgs.organization.value) {
    refreshOrders();
  }
});

watch(
  () => orgs.organization.value?.id,
  async (organizationId, previousOrganizationId) => {
    if (!organizationId || organizationId === previousOrganizationId) return;
    ordersState.value = [];
    clearFilters();
    await projects.fetchProjects({ force: true });
  },
);

const textColor = (colorStr: string) => {
  const color = new TinyColor(colorStr);
  return color.isLight() ? "text-black" : "text-white";
};
</script>
