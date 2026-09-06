<script setup lang="ts">
import type { SharedKit } from "~/types/kits";

definePageMeta({
  layout: "app",
});

const toast = useToast();

const { data, status } = await useFetch<{ kits: SharedKit[] }>(
  "/api/kits/mine",
  {
    key: "owned-kits",
  },
);

const kits = computed(() => data.value?.kits ?? []);

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function copyShareLink(shareId: string) {
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  await navigator.clipboard.writeText(
    new URL(`/kits/${shareId}`, window.location.origin).toString(),
  );
  toast.add({
    title: "Kit link copied",
    color: "success",
    icon: "i-lucide-copy",
  });
}
</script>

<template>
  <div class="min-h-screen bg-default">
    <UContainer class="mx-auto flex flex-col gap-8 py-10">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold tracking-tight text-primary-900 dark:text-primary-100">
            My kits
          </h1>
          <p class="text-sm text-gray-500">
            View, share, and edit the kits you’ve created.
          </p>
        </div>

        <UButton to="/app/kits/new" icon="i-lucide-package-plus">
          Create a kit
        </UButton>
      </header>

      <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2">
        <USkeleton v-for="index in 4" :key="index" class="h-48 rounded-2xl" />
      </div>

      <div
        v-else-if="kits.length === 0"
        class="rounded-2xl border border-dashed border-gray-200/60 py-16 text-center"
      >
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          No kits yet
        </h2>
        <p class="mx-auto mt-1 max-w-lg text-sm text-gray-500">
          Build a kit from search results or create a custom one with manual
          parts.
        </p>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2">
        <UPageCard v-for="kit in kits" :key="kit.id">
          <div class="flex h-full flex-col gap-4">
            <div>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ kit.title }}
                  </h2>
                  <p v-if="kit.description" class="text-sm text-muted">
                    {{ kit.description }}
                  </p>
                </div>
                <UBadge variant="soft" color="neutral">
                  {{ kit.items.length }} item{{ kit.items.length === 1 ? "" : "s" }}
                </UBadge>
              </div>
              <p class="mt-2 text-xs text-muted">
                Updated {{ formatDate(kit.updatedAt) }}
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="item in kit.items.slice(0, 4)"
                :key="item.id"
                variant="subtle"
              >
                {{ item.partName }}
              </UBadge>
              <UBadge
                v-if="kit.items.length > 4"
                variant="soft"
                color="neutral"
              >
                +{{ kit.items.length - 4 }} more
              </UBadge>
            </div>

            <div class="mt-auto flex flex-wrap gap-2">
              <UButton
                size="sm"
                variant="soft"
                icon="i-lucide-copy"
                @click="copyShareLink(kit.shareId)"
              >
                Copy link
              </UButton>
              <UButton
                size="sm"
                variant="soft"
                color="neutral"
                icon="i-lucide-external-link"
                :to="`/kits/${kit.shareId}`"
                target="_blank"
              >
                Open
              </UButton>
              <UButton
                size="sm"
                variant="ghost"
                color="neutral"
                icon="i-lucide-pencil"
                :to="`/app/kits/${kit.shareId}`"
              >
                Edit
              </UButton>
              <UButton
                size="sm"
                variant="ghost"
                color="neutral"
                icon="i-lucide-copy-plus"
                :to="{ path: '/app/kits/new', query: { from: kit.shareId } }"
              >
                Start new kit
              </UButton>
            </div>
          </div>
        </UPageCard>
      </div>
    </UContainer>
  </div>
</template>
