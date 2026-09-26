<script setup>
const auth = useAuth();

useHead({
  meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
  link: [{ rel: "icon", href: "/favicon.ico" }],
  htmlAttrs: {
    lang: "en",
  },
});

const title = "FRCTools Orders";
const description =
  "Manage and track your FRC team orders efficiently with FRCTools Orders.";

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
});
</script>

<template>
  <div>
    <UHeader :toggle="false">
      <template #left>
        <NuxtLink
          class=" font-bold flex items-center gap-2 text-3xl font-bold tracking-tight text-primary-950 dark:text-white"
          to="/"
          aria-label="FRCTools Orders home"
          >FRCTools <span class="hidden font-medium text-primary md:inline">Orders</span></NuxtLink
        >
        <UButton
          to="/search"
          icon="i-lucide-search"
          variant="ghost"
          color="neutral"
          class="ml-2 md:ml-4"
          aria-label="Search parts"
        >
          <span class="hidden md:block">Search parts</span>
        </UButton>
      </template>

      <template #right>
        <div class="flex items-center gap-1 sm:gap-2">
          <UColorModeButton />
          <UButton
            v-if="auth.loggedIn.value"
            to="/app"
            trailing-icon="i-lucide-arrow-right"
            size="sm"
          >
            Open app
          </UButton>
          <AccountMenu />
        </div>
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>

    <USeparator />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Built by Graham · © {{ new Date().getFullYear() }}
        </p>
      </template>

      <template #right>
        <UButton
          to="/docs"
          icon="i-lucide-book-open"
          aria-label="Documentation"
          color="neutral"
          variant="ghost"
        >
          Documentation
        </UButton>
        <UButton
          to="https://www.buymeacoffee.com/grahamsh"
          target="_blank"
          icon="i-lucide-heart"
          aria-label="Support development"
          color="neutral"
          variant="ghost"
          label="Support development"
          :ui="{ leadingIcon: 'text-pink-500' }"
        />
        <UButton
          to="https://github.com/frctools/order-list"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
      </template>
    </UFooter>
  </div>
</template>
