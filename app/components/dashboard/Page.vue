<script setup lang="ts">
withDefaults(defineProps<{
  id: string
  title?: string
  description?: string
  standaloneHeader?: boolean
  bodyClass?: string
}>(), {
  title: undefined,
  description: undefined,
  standaloneHeader: true,
  bodyClass: undefined
})

const inDashboard = inject('dashboard-layout', false)
</script>

<template>
  <UDashboardPanel
    v-if="inDashboard"
    :id="id"
    :ui="{ body: bodyClass }"
  >
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template
          v-if="$slots.title"
          #title
        >
          <slot name="title" />
        </template>

        <template #right>
          <slot name="actions" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar
        v-if="$slots.toolbar"
        :ui="{ root: 'py-2' }"
      >
        <slot name="toolbar" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <p
        v-if="description"
        class="-mt-1 text-sm text-muted"
      >
        {{ description }}
      </p>
      <slot />
    </template>
  </UDashboardPanel>

  <UContainer
    v-else
    class="flex flex-col gap-6 py-6 lg:py-10"
  >
    <header
      v-if="standaloneHeader"
      class="flex flex-wrap items-end justify-between gap-4"
    >
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
          <slot name="title">
            {{ title }}
          </slot>
        </h1>
        <p
          v-if="description"
          class="mt-1 text-sm text-muted"
        >
          {{ description }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot name="toolbar" />
    <slot />
  </UContainer>
</template>
