<script setup lang="ts">
import type { SaveKitInput, SharedKit } from "~/types/kits";

definePageMeta({
  layout: "app",
});

const route = useRoute();
const toast = useToast();

const shareId = computed(() => String(route.params.shareId ?? ""));

const { data, status, error, refresh } = await useFetch<{ kit: SharedKit }>(
  () => `/api/kits/${shareId.value}`,
  {
    key: () => `owned-kit-editor-${shareId.value}`,
  },
);

const kit = computed(() => data.value?.kit ?? null);
const isSaving = ref(false);

async function saveKit(payload: SaveKitInput) {
  if (!kit.value) return;

  isSaving.value = true;
  try {
    const endpoint: string = `/api/kits/${kit.value.shareId}`;
    await $fetch(endpoint, {
      method: "PATCH",
      body: payload,
    });

    await refresh();
    toast.add({
      title: "Kit updated",
      color: "success",
      icon: "i-lucide-check-circle",
    });
  } catch (error) {
    toast.add({
      title: "Unable to update kit",
      description: error instanceof Error ? error.message : "Please try again.",
      color: "error",
      icon: "i-lucide-alert-triangle",
    });
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-default">
    <UContainer class="mx-auto flex flex-col gap-8 py-10">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold tracking-tight text-primary-900 dark:text-primary-100">
            {{ kit?.title || "Edit kit" }}
          </h1>
          <p class="text-sm text-gray-500">
            Update the parts, notes, and shareable contents of this kit.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="kit"
            variant="soft"
            color="neutral"
            icon="i-lucide-external-link"
            :to="`/kits/${kit.shareId}`"
            target="_blank"
          >
            Open shared page
          </UButton>
          <UButton
            v-if="kit"
            variant="soft"
            color="neutral"
            icon="i-lucide-copy-plus"
            :to="{ path: '/app/kits/new', query: { from: kit.shareId } }"
          >
            Start new kit
          </UButton>
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-left"
            to="/app/kits"
          >
            Back to kits
          </UButton>
        </div>
      </header>

      <div v-if="status === 'pending'" class="space-y-3">
        <USkeleton class="h-40 rounded-2xl" />
        <USkeleton class="h-72 rounded-2xl" />
      </div>

      <KitEditorForm
        v-else-if="kit"
        mode="edit"
        :loading="isSaving"
        :initial-title="kit.title"
        :initial-description="kit.description"
        :initial-items="kit.items"
        @submit="saveKit"
      />

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-alert-triangle"
        title="Unable to load this kit"
        :description="error.message"
      />

      <UPageCard v-else class="border border-dashed border-default py-16 text-center">
        <div class="space-y-3">
          <UIcon name="i-lucide-package-x" class="mx-auto h-10 w-10 text-muted" />
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              Kit not found
            </h2>
            <p class="text-sm text-muted">
              It may have been deleted or you may not have access to edit it.
            </p>
          </div>
          <UButton to="/app/kits" variant="soft" color="neutral">
            Back to kits
          </UButton>
        </div>
      </UPageCard>
    </UContainer>
  </div>
</template>
