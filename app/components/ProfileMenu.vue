<template>
  <UButton
    v-if="!user"
    to="/auth/login"
    icon="i-lucide-log-in"
    :label="collapsed ? undefined : 'Log in'"
    color="neutral"
    variant="ghost"
    block
    :square="collapsed"
  />

  <UDropdownMenu
    v-else
    :items="dropdownItems"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-56' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      :avatar="{
        src: user.image ?? undefined,
        alt: user.name || user.email || 'Profile',
        text: avatarFallback
      }"
      :label="collapsed ? undefined : (user.name || user.email)"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
      aria-label="Account menu"
    />
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

defineProps<{
  collapsed?: boolean;
}>();

const auth = useAuth();
const toast = useToast();
const colorMode = useColorMode();

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

const dropdownItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      type: "label",
      label: user.value?.name ?? "Signed in",
      description: user.value?.email,
      avatar: {
        src: user.value?.image ?? undefined,
        alt: user.value?.name || user.value?.email || "Profile",
        text: avatarFallback.value,
      },
    },
  ],
  [
    {
      label: "Settings",
      to: "/settings",
      icon: "i-lucide-settings",
    },
    {
      label: "Appearance",
      icon: "i-lucide-sun-moon",
      children: [
        {
          label: "System",
          icon: "i-lucide-monitor",
          type: "checkbox",
          checked: colorMode.preference === "system",
          onSelect(e: Event) {
            e.preventDefault();
            colorMode.preference = "system";
          },
        },
        {
          label: "Light",
          icon: "i-lucide-sun",
          type: "checkbox",
          checked: colorMode.preference === "light",
          onSelect(e: Event) {
            e.preventDefault();
            colorMode.preference = "light";
          },
        },
        {
          label: "Dark",
          icon: "i-lucide-moon",
          type: "checkbox",
          checked: colorMode.preference === "dark",
          onSelect(e: Event) {
            e.preventDefault();
            colorMode.preference = "dark";
          },
        },
      ],
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
