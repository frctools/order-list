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
      <OrganizationMenu />

      <UDropdownMenu
        :items="dropdownItems"
        :popper="{ placement: 'bottom-end' }"
      >
        <UButton
          type="button"
          variant="ghost"
          color="neutral"
          class="flex items-center gap-2"
        >
          <UAvatar
            :src="user.image ?? undefined"
            :alt="user.name ?? user.email ?? 'Profile'"
            size="xs"
          >
            {{ avatarFallback }}
          </UAvatar>
          <span class="hidden md:inline text-sm font-medium">
            {{ user.name ?? user.email }}
          </span>
          <UIcon name="i-heroicons-chevron-down-20-solid" class="h-4 w-4" />
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
      label: "Dashboard",
      to: "/app",
      icon: "i-heroicons-home",
    },
  ],
  [
    {
      label: "Settings",
      to: "/settings",
      icon: "i-heroicons-cog-6-tooth",
    },
  ],
  [
    {
      label: pending.value ? "Signing out…" : "Sign out",
      icon: "i-heroicons-arrow-left-on-rectangle",
      disabled: pending.value,
      onClick: handleSignOut,
    },
  ],
]);
</script>
