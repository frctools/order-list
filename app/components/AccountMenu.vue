<template>
  <div class="flex items-center">
    <UButton
      v-if="!user"
      to="/auth/login"
      size="sm"
      color="primary"
      variant="solid"
    >
      Log in
    </UButton>
    <template v-else>
      <UDropdownMenu
        :items="dropdownItems"
        :content="{ align: 'end' }"
      >
        <UButton
          type="button"
          variant="ghost"
          color="neutral"
          class="flex items-center gap-2"
          aria-label="Account menu"
        >
          <UAvatar
            :src="user.image ?? undefined"
            :alt="user.name ?? user.email ?? 'Profile'"
            size="xs"
          >
            {{ avatarFallback }}
          </UAvatar>
          <span class="hidden max-w-32 truncate text-sm font-medium lg:inline">
            {{ user.name ?? user.email }}
          </span>
          <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed" />
        </UButton>
      </UDropdownMenu>
    </template>
  </div>
</template>

<script setup lang="ts">
const auth = useAuth();
const toast = useToast();

const pending = ref(false);
const user = computed(() => auth.user.value);

const avatarFallback = computed(() => {
  const source = user.value?.name || user.value?.email || "";
  return source.slice(0, 2).toUpperCase();
});

async function handleSignOut() {
  if (pending.value) return;
  try {
    pending.value = true;
    await auth.signOut();
    await refreshNuxtData();
    toast.add({ title: "Signed out" });
    await navigateTo("/auth/login");
  } catch (error) {
    console.error(error);
    toast.add({ title: "Unable to sign out" });
  } finally {
    pending.value = false;
  }
}

const dropdownItems = computed(() => [
  [
    {
      label: user.value?.name ?? "Signed in",
      description: user.value?.email,
      type: "label" as const,
    },
  ],
  [
    {
      label: "Orders",
      to: "/app",
      icon: "i-lucide-layout-dashboard",
    },
    {
      label: "My Kits",
      to: "/app/kits",
      icon: "i-lucide-package",
    },
  ],
  [
    {
      label: "Settings",
      to: "/settings",
      icon: "i-lucide-settings",
    },
  ],
  [
    {
      label: pending.value ? "Signing out…" : "Sign out",
      icon: "i-lucide-log-out",
      disabled: pending.value,
      onSelect: handleSignOut,
    },
  ],
]);
</script>
