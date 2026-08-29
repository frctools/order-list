<script setup lang="ts">
import { computed } from 'vue'
import { TinyColor } from '@ctrl/tinycolor'
import { useStatusLookup } from '~/composables/status'
import { carrierTrackingUrl } from '~/utils/tracking'
import { formatCents as formatCurrencyFromCents, formatMicros, lineTotalCents } from '~/utils/money'
import type { Order, OrderItem } from '~/types/orders'

const props = defineProps<{
  order: Order
  updating?: boolean
  deleting?: boolean
}>()

const emit = defineEmits<{
  advance: [order: Order]
  'delete-order': [order: Order]
  'add-item': [order: Order]
  'edit-item': [payload: { order: Order, item: OrderItem }]
  'delete-item': [payload: { order: Order, item: OrderItem }]
  'order-dragstart': []
  'order-dragend': []
  'part-dragstart': [payload: { order: Order, item: OrderItem }]
  'part-dragend': []
  'open-details': [order: Order]
}>()

// Whether any post-order detail (tracking / shipping / tax / payment) is set.
const hasDetails = computed(
  () =>
    !!props.order.trackingNumber
    || props.order.shippingCents != null
    || props.order.taxCents != null
    || (props.order.payments?.length ?? 0) > 0
)

// A link to the carrier's tracking page, derived from carrier + number.
const trackLink = computed(() =>
  carrierTrackingUrl(props.order.trackingCarrier, props.order.trackingNumber)
)

function onPartDragStartNative(event: DragEvent, item: OrderItem) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.id)
  }
  emit('part-dragstart', { order: props.order, item })
}

function onOrderDragStartNative(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', props.order.id)
  }
  emit('order-dragstart')
}

const statusMeta = computed(
  () => useStatusLookup[props.order.status] ?? null
)

const nextStatusLabel = computed(() => {
  const seq = ['to_order', 'ordered', 'arrived'] as const
  const idx = seq.indexOf(props.order.status)
  const next = idx === -1 ? null : seq[idx + 1]
  return next ? useStatusLookup[next]?.label ?? null : null
})

const vendorLabel = computed(
  () => props.order.vendorName?.trim() || 'No vendor'
)

function itemTotalCents(item: OrderItem) {
  return lineTotalCents(item.unitPriceMicros, item.quantity)
}

const textColor = (colorStr: string) => {
  const color = new TinyColor(colorStr)
  return color.isLight() ? 'text-black' : 'text-white'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span
              class="shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
              draggable="true"
              title="Drag to change status"
              @dragstart.stop="onOrderDragStartNative"
              @dragend="emit('order-dragend')"
            >
              <UIcon name="i-lucide-grip-vertical" class="text-sm" />
            </span>
            <UIcon name="i-lucide-store" class="text-sm shrink-0" />
            <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {{ vendorLabel }}
            </p>
          </div>
          <p class="text-xs text-gray-500">
            {{ order.itemCount }} {{ order.itemCount === 1 ? 'part' : 'parts' }}
            · opened by {{ order.requestedByName ?? 'unknown' }}
          </p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-base font-semibold text-gray-900 dark:text-white">
            {{ formatCurrencyFromCents(order.grandTotalCents) ?? '$0.00' }}
          </p>
          <UBadge
            v-if="statusMeta"
            variant="soft"
            size="sm"
            :color="statusMeta.color"
          >
            {{ statusMeta.label }}
          </UBadge>
        </div>
      </div>
    </template>

    <div class="space-y-2">
      <div
        v-for="item in order.items"
        :key="item.id"
        draggable="true"
        class="flex cursor-grab select-none items-start gap-2 rounded-lg border border-gray-200/60 p-2 active:cursor-grabbing dark:border-gray-800/60"
        title="Drag onto another order to combine, or into empty space to split out"
        @dragstart.stop="onPartDragStartNative($event, item)"
        @dragend="emit('part-dragend')"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <p class="truncate text-sm font-medium text-gray-900 dark:text-white">
              {{ item.partName }}
            </p>
            <span class="shrink-0 text-xs text-gray-500">x{{ item.quantity }}</span>
          </div>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
            <span v-if="item.unitPriceMicros !== null">
              {{ formatMicros(item.unitPriceMicros) }}
              <span class="text-gray-400">each</span>
            </span>
            <span v-if="itemTotalCents(item) > 0" class="font-medium">
              = {{ formatCurrencyFromCents(itemTotalCents(item)) }}
            </span>
            <span v-if="item.variantTitle || item.variantId">
              {{ item.variantTitle ?? item.variantId }}
            </span>
          </div>
          <div
            v-if="item.tags && item.tags.length > 0"
            class="mt-1 flex flex-wrap gap-1"
          >
            <UBadge
              v-for="tag in item.tags"
              :key="tag.id"
              variant="subtle"
              size="xs"
              :style="{ backgroundColor: tag.color }"
              :class="textColor(tag.color)"
            >
              {{ tag.name }}
            </UBadge>
          </div>
        </div>
        <div class="flex shrink-0 flex-col gap-1">
          <UButton
            v-if="item.externalUrl"
            size="xs"
            variant="ghost"
            color="primary"
            icon="i-lucide-external-link"
            :to="item.externalUrl"
            target="_blank"
            :draggable="false"
            title="Order from vendor"
          />
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-pencil"
            @click="emit('edit-item', { order, item })"
          />
          <UButton
            size="xs"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            @click="emit('delete-item', { order, item })"
          />
        </div>
      </div>
    </div>

    <div
      v-if="hasDetails"
      class="mt-3 space-y-1 border-t border-gray-200/60 pt-2 text-xs dark:border-gray-800/60"
    >
      <div
        v-if="order.trackingNumber"
        class="flex items-center gap-1.5 text-gray-500"
      >
        <UIcon name="i-lucide-truck" class="shrink-0" />
        <a
          :href="trackLink!"
          target="_blank"
          class="inline-flex items-center gap-1 truncate text-primary-500 hover:underline"
        >
          <span class="truncate">{{ order.trackingCarrier ? order.trackingCarrier + " " : "" }}{{ order.trackingNumber }}</span>
          <UIcon name="i-lucide-external-link" class="shrink-0" />
        </a>
      </div>
      <div
        v-if="order.shippingCents != null || order.taxCents != null"
        class="flex items-center gap-1.5 text-gray-500"
      >
        <UIcon name="i-lucide-package" class="shrink-0" />
        <span>
          Items {{ formatCurrencyFromCents(order.totalCents) }}
          <template v-if="order.shippingCents != null"> · Shipping {{ formatCurrencyFromCents(order.shippingCents) }}</template>
          <template v-if="order.taxCents != null"> · Tax {{ formatCurrencyFromCents(order.taxCents) }}</template>
        </span>
      </div>
      <div
        v-if="order.payments && order.payments.length > 0"
        class="flex flex-wrap items-center gap-1"
      >
        <UIcon name="i-lucide-credit-card" class="shrink-0 text-gray-500" />
        <UBadge
          v-for="p in order.payments"
          :key="p.id"
          variant="soft"
          size="xs"
          color="neutral"
        >
          {{ p.label }} · {{ formatCurrencyFromCents(p.amountCents) }}
        </UBadge>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <VendorCartButton :order="order" />
        <UButton
          v-if="order.status !== 'to_order'"
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-receipt"
          @click="emit('open-details', order)"
        >
          Details
        </UButton>
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-plus"
          @click="emit('add-item', order)"
        >
          Add part
        </UButton>
        <UButton
          v-if="nextStatusLabel"
          size="xs"
          variant="soft"
          color="primary"
          icon="i-lucide-chevrons-right"
          :loading="updating"
          @click="emit('advance', order)"
        >
          {{ nextStatusLabel }}
        </UButton>
        <UButton
          size="xs"
          variant="soft"
          color="error"
          icon="i-lucide-trash-2"
          :loading="deleting"
          @click="emit('delete-order', order)"
        >
          Delete
        </UButton>
      </div>
    </template>
  </UCard>
</template>
