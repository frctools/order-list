<script setup lang="ts">
import type { SharedKit } from "~/types/kits";
import type { Order, OrderEditorValues } from "~/types/orders";

definePageMeta({
  layout: "default",
});

const route = useRoute();
const auth = useAuth();
const orgs = useOrgs();
const toast = useToast();

const shareId = computed(() => String(route.params.shareId ?? ""));

const { data, status, error } = await useFetch<{ kit: SharedKit }>(
  () => `/api/kits/${shareId.value}`,
  {
    key: () => `kit-${shareId.value}`,
  },
);

const kit = computed(() => data.value?.kit ?? null);
const isImporting = ref(false);

const pageTitle = computed(() =>
  kit.value ? `${kit.value.title} kit` : "Shared kit",
);
const pageDescription = computed(
  () =>
    kit.value?.description ||
    "A shareable bundle of products that can be turned into orders.",
);

useSeoMeta({
  title: () => pageTitle.value,
  description: () => pageDescription.value,
  ogTitle: () => pageTitle.value,
  ogDescription: () => pageDescription.value,
});

const canImportToOrders = computed(
  () => Boolean(auth.session.value && orgs.organization.value),
);

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

function buildOrderPayload(): OrderEditorValues[] {
  return (
    kit.value?.items.map((item) => ({
      partName: item.partName,
      quantity: item.quantity,
      description: item.description ?? undefined,
      vendorId: item.vendorId ?? item.vendorName ?? null,
      unitPriceCents: item.unitPriceCents ?? undefined,
      variantId: item.variantId ?? undefined,
      variantTitle: item.variantTitle ?? undefined,
      externalUrl: item.externalUrl ?? undefined,
      tagIds: [],
    })) ?? []
  );
}

async function addKitToOrders() {
  if (!canImportToOrders.value || !kit.value) return;

  isImporting.value = true;
  try {
    const response = await $fetch<{ orders: Order[] }>("/api/orders/bulk", {
      method: "POST",
      body: {
        orders: buildOrderPayload(),
      },
    });

    toast.add({
      title: "Kit added to orders",
      description: `${response.orders.length} order${response.orders.length === 1 ? "" : "s"} created`,
      color: "success",
      icon: "i-lucide-check-circle",
    });

    await navigateTo("/app");
  } catch (err) {
    toast.add({
      title: "Unable to add kit to orders",
      description: err instanceof Error ? err.message : "Please try again.",
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
  } finally {
    isImporting.value = false;
  }
}
</script>

<template>
  <div>
    <UPageHero
      :title="kit?.title || 'Shared kit'"
      :description="kit?.description || 'A saved bundle of products ready to review.'"
    />

    <UContainer class="py-8">
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-alert-triangle"
        title="Unable to load this kit"
        :description="error.message"
      />

      <div v-else-if="status === 'pending'" class="space-y-3">
        <USkeleton class="h-32 rounded-2xl" />
        <USkeleton class="h-32 rounded-2xl" />
        <USkeleton class="h-32 rounded-2xl" />
      </div>

      <template v-else-if="kit">
        <UPageCard class="mb-6">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-sm text-muted">
                Shared by {{ kit.createdByName || "a teammate" }}
                <span v-if="kit.organizationName">
                  from {{ kit.organizationName }}
                </span>
              </p>
              <p class="text-sm text-muted">
                {{ kit.items.length }} item{{ kit.items.length === 1 ? "" : "s" }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="canImportToOrders"
                icon="i-lucide-shopping-cart"
                :loading="isImporting"
                @click="addKitToOrders"
              >
                Add all to orders
              </UButton>
              <UButton
                v-else
                to="/auth/login"
                icon="i-lucide-log-in"
                variant="soft"
              >
                Log in to order
              </UButton>
              <UButton
                to="/search"
                variant="ghost"
                color="neutral"
                icon="i-lucide-search"
              >
                Search more parts
              </UButton>
            </div>
          </div>
        </UPageCard>

        <div class="space-y-4">
          <UPageCard v-for="item in kit.items" :key="item.id">
            <div class="flex flex-col gap-4 sm:flex-row">
              <div class="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-elevated">
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.partName"
                  class="h-full w-full object-contain"
                />
                <div v-else class="flex h-full w-full items-center justify-center">
                  <UIcon name="i-lucide-package" class="h-10 w-10 text-muted" />
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                      {{ item.partName }}
                    </h2>
                    <p v-if="item.description" class="text-sm text-muted">
                      {{ item.description }}
                    </p>
                  </div>
                  <div class="text-sm text-muted md:text-right">
                    <p>Qty {{ item.quantity }}</p>
                    <p v-if="formatCurrencyFromCents(item.unitPriceCents)" class="font-medium text-primary">
                      {{ formatCurrencyFromCents(item.unitPriceCents) }}
                    </p>
                  </div>
                </div>

                <div class="mt-3 flex flex-wrap gap-2">
                  <UBadge v-if="item.vendorName" variant="subtle">
                    {{ item.vendorName }}
                  </UBadge>
                  <UBadge v-if="item.variantTitle" color="neutral" variant="soft">
                    {{ item.variantTitle }}
                  </UBadge>
                </div>

                <div class="mt-4 flex flex-wrap gap-2">
                  <UButton
                    v-if="item.externalUrl"
                    :to="item.externalUrl"
                    target="_blank"
                    icon="i-lucide-external-link"
                    variant="soft"
                  >
                    View product
                  </UButton>
                </div>
              </div>
            </div>
          </UPageCard>
        </div>
      </template>
    </UContainer>
  </div>
</template>
