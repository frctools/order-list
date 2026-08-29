<script setup lang="ts">
import { computed, ref } from 'vue'
import { canBuildVendorCart } from '~/utils/cart'
import type { Order } from '~/types/orders'
import type { CartLinkResult } from '~~/server/utils/cart-link'

const props = defineProps<{
  order: Order
  // Icon-only, for the denser table view.
  compact?: boolean
}>()

const toast = useToast()
const loading = ref(false)

// Handing off to a cart only makes sense while the order is still being
// assembled — once it's placed, the link would just build a second cart.
const visible = computed(
  () => props.order.status === 'to_order' && canBuildVendorCart(props.order)
)

const vendorLabel = computed(
  () => props.order.vendorName?.trim() || 'the vendor'
)

const failureMessage: Record<CartLinkResult['reason'], string> = {
  ok: '',
  'no-vendor': 'These parts don\'t share a single storefront to open a cart on.',
  'unsupported-platform':
    'This vendor\'s store doesn\'t support building a cart from a link.',
  'no-variants':
    'None of these parts could be matched to something on the vendor\'s site.'
}

async function openCart() {
  if (loading.value) return
  // Open the tab up front: a window.open() that happens after an `await` has
  // lost the user gesture and gets caught by popup blockers.
  const tab = window.open('', '_blank')
  loading.value = true

  try {
    const result = await $fetch<CartLinkResult>(
      `/api/orders/${props.order.id}/cart-link`
    )

    if (!result.url) {
      tab?.close()
      toast.add({
        title: 'Nothing to add to the cart',
        description: failureMessage[result.reason],
        color: 'warning'
      })
      return
    }

    if (tab) {
      tab.location.href = result.url
    } else {
      // Popup blocked despite the pre-open — fall back to this tab.
      window.location.href = result.url
    }

    if (result.excluded.length > 0) {
      toast.add({
        title: `Added ${result.included.length} of ${props.order.itemCount} parts`,
        description: `${result.excluded.map(item => item.partName).join(', ')} still need adding by hand.`,
        color: 'warning'
      })
    }
  } catch {
    tab?.close()
    toast.add({
      title: 'Could not build the cart',
      description: `We couldn't reach ${vendorLabel.value} to look up these parts.`,
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UButton
    v-if="visible"
    size="xs"
    :variant="compact ? 'ghost' : 'soft'"
    color="primary"
    icon="i-lucide-shopping-cart"
    :loading="loading"
    :title="`Open a cart at ${vendorLabel} with these parts`"
    :label="compact ? undefined : 'Open cart'"
    @click="openCart"
  />
</template>
