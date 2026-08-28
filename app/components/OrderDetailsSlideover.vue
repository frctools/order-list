<script setup lang="ts">
import { reactive, watch, computed } from 'vue'
import type {
  Order,
  OrderDetailsValues,
  PaymentType
} from '~/types/orders'

const props = defineProps<{
  order: Order | null
  loading?: boolean
  // Payment labels used before, for autocomplete suggestions (e.g. cards).
  paymentMethods?: { type: string, label: string }[]
}>()

// Past labels for a given payment type (deduped, sorted).
function suggestionsFor(type: PaymentType) {
  return [
    ...new Set(
      (props.paymentMethods ?? [])
        .filter(m => m.type === type)
        .map(m => m.label)
    )
  ]
}

const emit = defineEmits<{
  (e: 'submit', payload: { orderId: string, values: OrderDetailsValues }): void
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const paymentTypeOptions: { value: PaymentType, label: string }[] = [
  { value: 'credit_card', label: 'Credit card' },
  { value: 'voucher', label: 'Voucher / Kit of Parts' },
  { value: 'coupon', label: 'Coupon code' },
  { value: 'other', label: 'Other' }
]

interface PaymentRow {
  type: PaymentType
  label: string
  amount: string
}

const form = reactive({
  trackingCarrier: '',
  trackingNumber: '',
  shipping: '',
  tax: '',
  payments: [] as PaymentRow[]
})

watch(
  () => [isOpen.value, props.order?.id],
  () => {
    if (!isOpen.value || !props.order) return
    const o = props.order
    form.trackingCarrier = o.trackingCarrier ?? ''
    form.trackingNumber = o.trackingNumber ?? ''
    form.shipping
      = o.shippingCents != null ? (o.shippingCents / 100).toFixed(2) : ''
    form.tax = o.taxCents != null ? (o.taxCents / 100).toFixed(2) : ''
    form.payments = (o.payments ?? []).map(p => ({
      type: p.type,
      label: p.label,
      amount: (p.amountCents / 100).toFixed(2)
    }))
  },
  { immediate: true }
)

function addPayment() {
  form.payments.push({ type: 'credit_card', label: '', amount: '' })
}
function removePayment(index: number) {
  form.payments.splice(index, 1)
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

function formatCents(value?: number | null) {
  if (value == null) return '$0.00'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value / 100)
}

const itemsTotalCents = computed(() => props.order?.totalCents ?? 0)
const shippingCents = computed(() => dollarsToCents(form.shipping) ?? 0)
const taxCents = computed(() => dollarsToCents(form.tax) ?? 0)
const grandTotalCents = computed(
  () => itemsTotalCents.value + shippingCents.value + taxCents.value
)
const fullTotalAmount = computed(() => (grandTotalCents.value / 100).toFixed(2))
const paidCents = computed(() =>
  form.payments.reduce((sum, p) => sum + (dollarsToCents(p.amount) ?? 0), 0)
)

function handleSubmit() {
  if (!props.order) return
  const values: OrderDetailsValues = {
    trackingCarrier: form.trackingCarrier.trim() || null,
    trackingNumber: form.trackingNumber.trim() || null,
    shippingCents: dollarsToCents(form.shipping),
    taxCents: dollarsToCents(form.tax),
    payments: form.payments
      .filter(p => p.label.trim().length > 0)
      .map(p => ({
        type: p.type,
        label: p.label.trim(),
        amountCents: dollarsToCents(p.amount) ?? 0
      }))
  }
  emit('submit', { orderId: props.order.id, values })
}
</script>

<template>
  <USlideover v-model:open="isOpen" side="right">
    <template #content>
      <UCard class="flex h-full flex-col overflow-y-auto">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Order details
            </h3>
            <p class="text-sm text-gray-500">
              Tracking, shipping cost, and how
              {{ order?.vendorName?.trim() || 'this order' }} was paid for.
            </p>
          </div>
        </template>

        <div class="flex flex-1 flex-col gap-6">
          <!-- Shipping / tracking -->
          <div class="grid gap-4">
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Shipping & tracking
            </h4>
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Carrier">
                <UInput
                  v-model="form.trackingCarrier"
                  placeholder="UPS, FedEx, USPS…"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Tracking number">
                <UInput
                  v-model="form.trackingNumber"
                  placeholder="1Z…"
                  class="w-full"
                />
              </UFormField>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Shipping (USD)">
                <UInput
                  v-model="form.shipping"
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Tax (USD)">
                <UInput
                  v-model="form.tax"
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <!-- Payments -->
          <div class="grid gap-3">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Payment
              </h4>
              <UButton
                size="xs"
                variant="soft"
                icon="i-lucide-plus"
                @click="addPayment"
              >
                Add payment
              </UButton>
            </div>
            <p v-if="form.payments.length === 0" class="text-sm text-gray-500">
              Split how this order was paid — a card, a Kit of Parts voucher, a
              coupon, etc.
            </p>
            <div
              v-for="(payment, index) in form.payments"
              :key="index"
              class="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200/60 p-2 dark:border-gray-800/60"
            >
              <UFormField label="Method" class="w-40">
                <USelectMenu
                  v-model="payment.type"
                  :items="paymentTypeOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Detail" class="min-w-40 flex-1">
                <UInput
                  v-model="payment.label"
                  :list="`pm-${payment.type}`"
                  placeholder="Visa •1234 / FIRST25 / KoP"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Amount (USD)" class="w-28">
                <UInput
                  v-model="payment.amount"
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                />
              </UFormField>
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                icon="i-lucide-equal"
                :title="`Use full order total (${formatCents(grandTotalCents)})`"
                @click="payment.amount = fullTotalAmount"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="removePayment(index)"
              />
            </div>

            <!-- Autocomplete suggestions from previously-used labels. -->
            <datalist
              v-for="opt in paymentTypeOptions"
              :id="`pm-${opt.value}`"
              :key="opt.value"
            >
              <option
                v-for="label in suggestionsFor(opt.value)"
                :key="label"
                :value="label"
              />
            </datalist>
          </div>

          <!-- Summary -->
          <div class="grid gap-1 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-900/40">
            <div class="flex justify-between text-gray-500">
              <span>Items</span><span>{{ formatCents(itemsTotalCents) }}</span>
            </div>
            <div class="flex justify-between text-gray-500">
              <span>Shipping</span><span>{{ formatCents(shippingCents) }}</span>
            </div>
            <div class="flex justify-between text-gray-500">
              <span>Tax</span><span>{{ formatCents(taxCents) }}</span>
            </div>
            <div class="flex justify-between font-semibold text-gray-900 dark:text-white">
              <span>Order total</span><span>{{ formatCents(grandTotalCents) }}</span>
            </div>
            <div
              class="flex justify-between"
              :class="
                paidCents === grandTotalCents
                  ? 'text-success-600 dark:text-success-400'
                  : 'text-gray-500'
              "
            >
              <span>Paid</span><span>{{ formatCents(paidCents) }}</span>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="isOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              icon="i-lucide-save"
              :loading="loading"
              @click="handleSubmit"
            >
              Save details
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </USlideover>
</template>
