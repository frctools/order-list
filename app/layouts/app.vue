<script setup lang="ts">
import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: { lang: 'en' }
})

provide('dashboard-layout', true)

const route = useRoute()
const auth = useAuth()
const { organization, isLoading, loaded } = useOrgs()
const activeMemberQuery = auth.client.useActiveMember()
const isCreateOrganizationOpen = useState('create-organization-open', () => false)

const open = ref(false)

const canManageOrganization = computed(() => {
  const role = activeMemberQuery.value?.data?.role
  return role === 'admin' || role === 'owner'
})

const requiresOrganization = computed(() => route.path.startsWith('/app'))
const hasOrganization = computed(() => {
  if (!auth.user.value || !auth.session.value) return false
  return Boolean(organization.value)
})

function closeSidebar() {
  open.value = false
}

const links = computed<NavigationMenuItem[][]>(() => [
  [
    {
      label: 'Orders',
      icon: 'i-lucide-clipboard-list',
      to: '/app',
      exact: true,
      onSelect: closeSidebar
    },
    {
      label: 'Kits',
      icon: 'i-lucide-package',
      to: '/app/kits',
      onSelect: closeSidebar
    },
    {
      label: 'Search parts',
      icon: 'i-lucide-search',
      to: '/search',
      onSelect: closeSidebar
    },
    ...(canManageOrganization.value
      ? [{
          label: 'Organization',
          icon: 'i-lucide-building-2',
          to: '/organization',
          onSelect: closeSidebar
        }]
      : []),
    {
      label: 'Settings',
      icon: 'i-lucide-settings',
      to: '/settings',
      onSelect: closeSidebar
    }
  ],
  [
    {
      label: 'Documentation',
      icon: 'i-lucide-book-open',
      to: '/docs',
      target: '_blank'
    },
    {
      label: 'GitHub',
      icon: 'i-simple-icons-github',
      to: 'https://github.com/frctools/order-list',
      target: '_blank'
    },
    {
      label: 'Support development',
      icon: 'i-lucide-heart',
      to: 'https://www.buymeacoffee.com/grahamsh',
      target: '_blank',
      ui: {
        linkLeadingIcon: 'text-pink-500'
      }
      
    }
  ]
])

const searchGroups = computed<CommandPaletteGroup[]>(() => [
  {
    id: 'links',
    label: 'Go to',
    items: [
      ...links.value.flat(),
      {
        label: 'Home page',
        icon: 'i-lucide-house',
        to: '/'
      }
    ]
  },
  {
    id: 'actions',
    label: 'Actions',
    items: [
      {
        id: 'new-kit',
        label: 'Create a kit',
        icon: 'i-lucide-package-plus',
        to: '/app/kits/new'
      },
      {
        id: 'new-organization',
        label: 'Create organization',
        icon: 'i-lucide-plus',
        onSelect: () => {
          isCreateOrganizationOpen.value = true
        }
      }
    ]
  }
])
</script>

<template>
  <UDashboardGroup unit="rem" storage="cookie">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/"
          class="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 font-bold tracking-tight text-highlighted transition-colors hover:bg-elevated/50"
          :class="collapsed && 'mx-auto'"
          aria-label="FRCTools Orders home"
        >
          <img
            src="/logo.svg"
            alt=""
            class="size-6 shrink-0"
            v-if="collapsed"
          >
          <span
            v-if="!collapsed"
            class="truncate text-lg"
          >
            FRCTools <span class="font-medium text-primary">Orders</span>
          </span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <OrganizationMenu :collapsed="collapsed" />

        <UDashboardSearchButton
          :collapsed="collapsed"
          class="bg-transparent ring-default"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <ProfileMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="searchGroups" />

    <slot v-if="!requiresOrganization || hasOrganization" />

    <UDashboardPanel
      v-else
      id="no-organization"
    >
      <template #header>
        <UDashboardNavbar title="Welcome">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="flex flex-1 items-center justify-center">
          <USkeleton
            v-if="isLoading || !loaded"
            class="h-48 w-full max-w-sm rounded-xl"
          />
          <UPageCard
            v-else
            variant="subtle"
            class="w-full max-w-sm"
            title="Create an organization"
            description="Organizations hold your team's projects and orders. Create one, or ask a teammate to send you an invite."
            icon="i-lucide-building-2"
          >
            <UButton
              icon="i-lucide-plus"
              block
              @click="isCreateOrganizationOpen = true"
            >
              Create organization
            </UButton>
          </UPageCard>
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
