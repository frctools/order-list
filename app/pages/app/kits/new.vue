<script setup lang="ts">
import type { SaveKitInput, SharedKit } from "~/types/kits";

definePageMeta({
  layout: "app",
});

const toast = useToast();
const router = useRouter();

const isSaving = ref(false);

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
            Create kit
          </h1>
          <p class="text-sm text-gray-500">
            Build a shareable group of parts from search results or custom items.
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

      <KitEditorForm
        mode="create"
        :loading="isSaving"
        @submit="createKit"
      />
    </UContainer>
  </div>
</template>
