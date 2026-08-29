<template>
  <div>
    <UPageHero
      title="Track team orders with ease"
      description="Plan, purchase, and receive parts in one place. Innovators Parts gives your team a clear board and table view across the entire purchasing pipeline."
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
      class="border-t border-primary"
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

const { loggedIn } = useAuth()

const pageTitle = 'Innovators Parts: Track and manage purchases'
const pageDescription
  = 'An orders board for FRC teams. Create requests, place orders, and track spending.'

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  ogTitle: pageTitle,
  ogDescription: pageDescription
})

const heroLinks = computed(() => {
  if (loggedIn.value) {
    return [
      {
        label: 'View orders',
        to: '/app',
        trailingIcon: 'i-lucide-arrow-right'
        // size: "xl",
        // color: "neutral",
        // variant: "subtle",
      },
      {
        label: 'Read the documentation',
        to: '/docs',
        icon: 'i-lucide-book-open'
        // size: "xl",
      }
    ]
  }
  // Signups are invitation-only, so there is no "get started" path to offer a
  // visitor -- an admin invites them and the email carries the link.
  return [
    {
      label: 'Log in',
      to: '/auth/login',
      trailingIcon: 'i-lucide-arrow-right'
    },
    {
      label: 'Search parts',
      to: '/search',
      icon: 'i-lucide-search'
    },
    {
      label: 'Read the documentation',
      to: '/docs',
      icon: 'i-lucide-book-open'
    }
  ]
})

const features = [
  {
    title: 'Smart product inputting',
    description:
      'Just paste a URL, and Innovators Parts will automatically fetch product details like title, vendor, and pricing from popular suppliers.',
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
  loggedIn.value ? 'Jump back into your orders' : 'Ready to organize purchases?'
)
const ctaDescription = computed(() =>
  loggedIn.value
    ? 'Open the app to create a request or advance an order.'
    : 'Accounts are created by invitation. Ask a team admin to send you one.'
)
const ctaLinks = computed(() =>
  loggedIn.value
    ? [
        {
          label: 'Open the app',
          to: '/app',
          trailingIcon: 'i-lucide-arrow-right'
          // color: "neutral",
        }
      ]
    : [
        {
          label: 'Log in',
          to: '/auth/login',
          trailingIcon: 'i-lucide-arrow-right'
          // color: "neutral",
        },
        {
          label: 'Read the documentation',
          to: '/docs',
          icon: 'i-lucide-book-open'
          // variant: "outline",
          // color: "neutral",
        }
      ]
)
</script>
