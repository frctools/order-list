<template>
  <div>
    <UPageHero
      title="Track team orders with ease"
      description="Plan, purchase, and receive parts in one place. FRCTools Orders gives your team a clear board and table view across the entire purchasing pipeline."
      :links="heroLinks"
    >
      <template #top>
        <HeroBackground />
      </template>
    </UPageHero>
    <UPageSection>
      <PromoVideo />
    </UPageSection>
    <UPageSection
      id="features"
      title="Built for FRC teams"
      description="Everything you need to manage your team's orders in one place."
      class="border-t border-default"
      :features="features"
    />

    <UPageSection>
      <UPageCTA
        :title="ctaTitle"
        :description="ctaDescription"
        variant="subtle"
        :links="ctaLinks"
      />
    </UPageSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const { user } = useAuth()

const pageTitle = 'FRCTools Orders: Track and manage purchases'
const pageDescription
  = 'An orders board for FRC teams. Create requests, place orders, and track spending.'

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  ogTitle: pageTitle,
  ogDescription: pageDescription
})

// `user` is a ref — checking it directly is always truthy, which showed
// signed-out visitors the "View orders" links.
const isSignedIn = computed(() => Boolean(user.value))

const heroLinks = computed(() => {
  if (isSignedIn.value) {
    return [
      {
        label: 'Open your orders',
        to: '/app',
        size: 'lg' as const,
        trailingIcon: 'i-lucide-arrow-right'
      },
      {
        label: 'Search parts',
        to: '/search',
        size: 'lg' as const,
        color: 'neutral' as const,
        variant: 'subtle' as const,
        icon: 'i-lucide-search'
      }
    ]
  }
  return [
    {
      label: 'Get started free',
      to: '/auth/signup',
      size: 'lg' as const,
      trailingIcon: 'i-lucide-arrow-right'
    },
    {
      label: 'Search parts',
      to: '/search',
      size: 'lg' as const,
      color: 'neutral' as const,
      variant: 'subtle' as const,
      icon: 'i-lucide-search'
    },
    {
      label: 'Read the docs',
      to: '/docs',
      size: 'lg' as const,
      color: 'neutral' as const,
      variant: 'ghost' as const,
      icon: 'i-lucide-book-open'
    }
  ]
})

const features = [
  {
    title: 'Paste a link, get the details',
    description:
      'Paste a product URL and FRCTools Orders fills in the title, vendor, variants, and price from popular FRC suppliers.',
    icon: 'i-lucide-clipboard-check'
  },
  {
    title: 'Request management',
    description:
      'Team members can submit purchase requests with details and links. Organizers can review, approve, and purchase requests in a clear board view.',
    icon: 'i-lucide-clipboard-list'
  },
  {
    title: 'Order tracking',
    description:
      'Easily convert approved requests into orders. Track order status, price information, and vendor links all in one place.',
    icon: 'i-lucide-package'
  },
  {
    title: 'Receiving workflow',
    description:
      'Keep your team informed by marking items as received when they arrive.',
    icon: 'i-lucide-truck'
  },
  {
    title: 'Multi-organization support',
    description:
      'Manage multiple teams or groups under one account. Switch between organizations seamlessly to keep purchases organized.',
    icon: 'i-lucide-building-2'
  },
  {
    title: 'Price tracking',
    description:
      'Track unit prices and total spending for each order. Stay within budget and monitor team expenses easily.',
    icon: 'i-lucide-dollar-sign'
  }
]

const ctaTitle = computed(() =>
  isSignedIn.value ? 'Jump back into your orders' : 'Ready to organize purchases?'
)
const ctaDescription = computed(() =>
  isSignedIn.value
    ? 'Open the app to create a request or advance an order.'
    : 'Create an account and set up your organization in minutes.'
)
const ctaLinks = computed(() =>
  isSignedIn.value
    ? [
        {
          label: 'Open the app',
          to: '/app',
          trailingIcon: 'i-lucide-arrow-right'
        }
      ]
    : [
        {
          label: 'Sign up free',
          to: '/auth/signup',
          trailingIcon: 'i-lucide-arrow-right'
        },
        {
          label: 'Log in',
          to: '/auth/login',
          color: 'neutral' as const,
          variant: 'subtle' as const,
          icon: 'i-lucide-log-in'
        }
      ]
)
</script>
