<script setup>
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'FRCTools Orders'
const description
  = 'Manage and track your FRC team orders efficiently with FRCTools Orders.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})
</script>

<template>
  <div>
    <UHeader>
      <template #left>
        <NuxtLink
          class="font-bold font-display text-3xl text-blue-950 dark:text-white flex justify-center items-center gap-2"
          to="/"
        >FRCTools <span class="md:inline hidden">Orders</span></NuxtLink>
        <UButton
          to="/search"
          icon="i-lucide-search"
          variant="ghost"
          color="neutral"
          class="ml-4"
        >
          <span class="hidden md:block">Search Parts</span>
        </UButton>
      </template>

      <template #right>
        <div class="flex items-center gap-2">
          <ProfileMenu />
          <UColorModeButton />
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
          Built by Graham • © {{ new Date().getFullYear() }}
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
          aria-label="Donate"
          class="text-pink-500"
          variant="ghost"
          label="Support Development"
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
