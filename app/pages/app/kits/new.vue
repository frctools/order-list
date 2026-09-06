<script setup lang="ts">
import type { SaveKitInput, SharedKit } from "~/types/kits";

definePageMeta({
  layout: "app",
});

const toast = useToast();
const router = useRouter();
const route = useRoute();

const isSaving = ref(false);
const sourceKit = ref<SharedKit | null>(null);
const sourceError = ref<Error | null>(null);

const sourceShareId = Array.isArray(route.query.from)
  ? route.query.from[0]
  : route.query.from;

if (sourceShareId) {
  try {
    const response = await $fetch<{ kit: SharedKit }>(
      `/api/kits/${encodeURIComponent(sourceShareId)}`,
    );
    sourceKit.value = response.kit;
  } catch (error) {
    sourceError.value =
      error instanceof Error ? error : new Error("Unable to load the source kit.");
  }
}

const initialTitle = computed(() =>
  sourceKit.value ? `Copy of ${sourceKit.value.title}`.slice(0, 120) : undefined,
);

type CreateKitResponse = {
  kit: SharedKit;
  sharePath: string;
};

async function createKit(payload: SaveKitInput) {
  isSaving.value = true;
  try {
    const response = await $fetch<CreateKitResponse>("/api/kits", {
      method: "POST",
      body: payload,
    });

    toast.add({
      title: "Kit created",
      description: "Your shareable link is ready.",
      color: "success",
      icon: "i-lucide-check-circle",
    });

    await router.push(`/app/kits/${response.kit.shareId}`);
  } catch (error) {
    toast.add({
      title: "Unable to create kit",
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
            {{ sourceKit ? "Create from kit" : "Create kit" }}
          </h1>
          <p class="text-sm text-gray-500">
            <template v-if="sourceKit">
              Starting with the items from {{ sourceKit.title }}. Your changes
              won’t affect the original kit.
            </template>
            <template v-else>
              Build a shareable group of parts from search results or custom items.
            </template>
          </p>
        </div>

        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-left"
          to="/app/kits"
        >
          Back to kits
        </UButton>
      </header>

      <UAlert
        v-if="sourceError"
        color="warning"
        variant="soft"
        icon="i-lucide-alert-triangle"
        title="Unable to load the source kit"
        description="You can still create a new kit from scratch."
      />

      <KitEditorForm
        mode="create"
        :loading="isSaving"
        :initial-title="initialTitle"
        :initial-description="sourceKit?.description"
        :initial-items="sourceKit?.items"
        @submit="createKit"
      />
    </UContainer>
  </div>
</template>
