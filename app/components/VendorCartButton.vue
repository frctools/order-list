<script setup lang="ts">
import { computed } from 'vue'
import { buildVendorCartPlan } from '~/utils/cart'
import type { Order } from '~/types/orders'

const props = defineProps<{
  order: Order
  // Icon-only, for the denser table view.
  compact?: boolean
}>()

const plan = computed(() => buildVendorCartPlan(props.order))

const vendorLabel = computed(
  () => props.order.vendorName?.trim() || 'the vendor'
)

// Handing off to a cart only makes sense while the order is still being
// assembled — once it's placed, the link would just build a second cart.
const visible = computed(
  () => props.order.status === 'to_order' && !!plan.value.url
)

const title = computed(() => {
  const { included, excluded } = plan.value
  const count = `${included.length} ${included.length === 1 ? 'part' : 'parts'}`
  const base = `Opens a cart at ${vendorLabel.value} with ${count}`
  return excluded.length > 0
    ? `${base} — ${excluded.length} still need adding by hand`
    : base
})
</script>

<template>
  <UButton
    v-if="visible"
    :to="plan.url!"
    target="_blank"
    size="xs"
    :variant="compact ? 'ghost' : 'soft'"
    color="primary"
    icon="i-lucide-shopping-cart"
    :title="title"
    :label="compact ? undefined : 'Open cart'"
  >
    <template v-if="!compact && plan.excluded.length > 0" #trailing>
      <UBadge size="xs" variant="subtle" color="neutral">
        {{ plan.included.length }}/{{ order.itemCount }}
      </UBadge>
    </template>
  </UButton>
</template>
