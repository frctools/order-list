<template>
  <USlideover
    v-model:open="isOpen"
    side="right"
  >
    <template #content>
      <UCard class="flex h-full flex-col overflow-y-auto">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ headerTitle }}
            </h3>
            <p class="text-sm text-gray-500">
              {{ headerDescription }}
            </p>
          </div>
        </template>

        <UForm
          ref="orderForm"
          :state="formState"
          :schema="orderFormSchema"
          class="flex flex-1 flex-col gap-6"
          @submit="handleSubmit"
        >
          <div class="grid flex-1 gap-4">
            <SearchProduct @select="formState.externalUrl = $event" />
            <UFormField
              name="externalUrl"
              label="External link"
            >
              <UInput
                v-model="formState.externalUrl"
                placeholder="https://supplier.com/listing"
                size="xl"
                class="w-full"
                autofocus
              />
            </UFormField>

            <div
              v-if="isLookingUpVendor"
              class="text-sm text-gray-500"
            >
              <UIcon
                name="i-lucide:loader-circle"
                class="animate-spin"
              />
              Looking up part information...
            </div>

            <UFormField
              name="partName"
              label="Part name"
              required
            >
              <UInput
                v-model="formState.partName"
                placeholder="1/2 in. Round ID Flanged Shielded Bearing (FR8ZZ)"
                class="w-full"
              />
            </UFormField>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField
                name="quantity"
                label="Quantity"
                required
              >
                <UInput
                  v-model.number="formState.quantity"
                  type="number"
                  min="1"
                />
              </UFormField>
              <UFormField
                name="unitPrice"
                label="Unit price (USD)"
              >
                <UInput
                  v-model="formState.unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="49.99"
                />
              </UFormField>
            </div>

            <div
              v-if="priceBreaks.length"
              class="rounded-lg border border-gray-200/70 bg-gray-50/60 p-3 dark:border-gray-800/70 dark:bg-gray-900/40"
            >
              <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                <UIcon name="i-lucide-tags" class="shrink-0" />
                Quantity price breaks
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <UBadge
                  v-for="tier in priceBreaks"
                  :key="tier.quantity"
                  size="xs"
                  :variant="tier.quantity === activeBreak?.quantity ? 'solid' : 'subtle'"
                  :color="tier.quantity === activeBreak?.quantity ? 'primary' : 'neutral'"
                >
                  {{ tier.quantity }}+ &middot; ${{ tier.unitPrice }}
                </UBadge>
              </div>
              <p class="mt-2 text-xs text-gray-500">
                <template v-if="activeBreak">
                  Ordering {{ formState.quantity }} qualifies for the
                  {{ activeBreak.quantity }}+ price of ${{ activeBreak.unitPrice }} each.
                </template>
                <template v-else>
                  Unit price follows whichever break the quantity reaches.
                </template>
              </p>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField
                v-if="mode === 'create' && !hideVendor"
                name="vendorId"
                label="Vendor"
                help="Parts group into this vendor's order."
              >
                <UInput
                  v-model="formState.vendorId"
                  placeholder="Vendor name or identifier"
                />
              </UFormField>
              <UFormField
                name="variantId"
                label="Variant"
              >
                <template v-if="variantOptions.length">
                  <USelectMenu
                    v-model="formState.variantId"
                    :items="variantOptions"
                    value-key="value"
                    searchable
                    placeholder="Select variant"
                  />
                </template>
                <template v-else>
                  <UInput
                    v-model="formState.variantId"
                    placeholder="Variant SKU or ID"
                  />
                </template>
              </UFormField>
            </div>

            <UFormField
              name="variantTitle"
              label="Variant name"
            >
              <UInput
                v-model="formState.variantTitle"
                placeholder="Variant or configuration"
                class="w-full"
              />
            </UFormField>

            <UFormField
              name="description"
              label="Notes"
            >
              <UTextarea
                v-model="formState.description"
                :rows="3"
                placeholder="Add context, specs, or supplier instructions"
              />
            </UFormField>

            <UFormField
              v-if="availableTags && availableTags.length > 0"
              name="tagIds"
              label="Tags"
            >
              <USelectMenu
                v-model="formState.tagIds"
                :items="tagOptions"
                value-key="value"
                multiple
                searchable
                placeholder="Select tags"
              >
                <template #item="{ item }">
                  <span
                    class="mr-2 inline-block h-3 w-3 rounded-full"
                    :style="{ backgroundColor: item.color }"
                  />
                  {{ item.label }}
                </template>
              </USelectMenu>
            </UFormField>
            <div v-else>
              <ProseCallout
                type="tip"
                icon="i-lucide-tag"
                to="/docs/features/tags"
              >
                Add tags to your orders to help organize and categorize them.
              </ProseCallout>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="handleCancel"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              icon="i-lucide-save"
              :loading="loading"
            >
              {{ actionLabel }}
            </UButton>
          </div>
        </UForm>
      </UCard>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { reactive, ref, watch, watchEffect, computed } from 'vue'
import * as z from 'zod'
import type { FormSubmitEvent } from '#ui/types'
import type {
  OrderEditorSubmitPayload,
  OrderEditorValues,
  OrderItem,
  Tag
} from '~/types/orders'

const props = defineProps<{
  mode: 'create' | 'edit'
  loading?: boolean
  // The line item being edited (with its parent order id).
  initialItem?: (OrderItem & { orderId: string }) | null
  initialUrl?: string | null
  availableTags?: Tag[]
  // When adding a part to a specific existing order, vendor is inherited.
  hideVendor?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', payload: OrderEditorSubmitPayload): void
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const orderFormSchema = z.object({
  partName: z.string().trim().min(1, 'Part name is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  description: z
    .string()
    .trim()
    .max(1000, 'Notes must be 1000 characters or less')
    .optional()
    .transform(value => (value && value.length > 0 ? value : null)),
  vendorId: z
    .string()
    .trim()
    .optional()
    .transform(value => (value && value.length > 0 ? value : null)),
  unitPrice: z
    .union([z.string(), z.number(), z.literal(''), z.null(), z.undefined()])
    .transform((value, ctx) => {
      if (value === undefined || value === null || value === '') return null
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric) || numeric < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Unit price must be zero or more'
        })
        return z.NEVER
      }
      return numeric
    }),
  variantId: z
    .string()
    .trim()
    .optional()
    .transform(value => (value && value.length > 0 ? value : null)),
  variantTitle: z
    .string()
    .trim()
    .optional()
    .transform(value => (value && value.length > 0 ? value : null)),
  externalUrl: z
    .string()
    .trim()
    .url('Enter a valid URL')
    .optional()
    .or(z.literal(''))
    .transform(value => (value && value.length > 0 ? value : null))
})

type OrderFormSchema = z.infer<typeof orderFormSchema>

const formState = reactive({
  externalUrl: '',
  partName: '',
  quantity: 1,
  unitPrice: '',
  vendorId: '',
  variantId: '',
  variantTitle: '',
  description: '',
  tagIds: [] as string[]
})

const isLookingUpVendor = ref(false)
const skipNextVendorLookup = ref(false)

const variantOptions = ref<VariantOption[]>([])

// Quantity discount tiers from the vendor (DigiKey publishes them). Held only
// for the current lookup — prices move, so they're re-fetched rather than
// stored on the item.
type PriceBreak = { quantity: number, unitPrice: number }
const priceBreaks = ref<PriceBreak[]>([])

// The tier a quantity qualifies for: the last break it reaches.
function breakForQuantity(quantity: number): PriceBreak | null {
  let applicable: PriceBreak | null = null
  for (const tier of priceBreaks.value) {
    if (quantity >= tier.quantity) applicable = tier
  }
  return applicable
}

const activeBreak = computed(() => breakForQuantity(formState.quantity))

// DigiKey links, so an existing part can pull its breaks back without
// re-running a full lookup that would overwrite the user's edits.
function isDigiKeyUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.toLowerCase().replace(/^www\./, '')
    if (host !== 'digikey.com' && host !== 'digikey.ca') return false
    return /\/products\/detail\/|\/product-detail\//i.test(pathname)
  } catch {
    return false
  }
}

const tagOptions = computed(() =>
  (props.availableTags || []).map(tag => ({
    label: tag.name,
    value: tag.id,
    color: tag.color
  }))
)

const headerTitle = computed(() =>
  props.mode === 'edit' ? 'Edit part' : 'Add part'
)
const headerDescription = computed(() =>
  props.mode === 'edit'
    ? 'Update this part and save your changes.'
    : 'Add a part — it groups into the vendor\'s order automatically.'
)
const actionLabel = computed(() =>
  props.mode === 'edit' ? 'Save changes' : 'Add part'
)

watch(
  () => [isOpen.value, props.mode, props.initialItem],
  () => {
    if (!isOpen.value) {
      return
    }
    initializeFormState()
  },
  { immediate: true }
)
// Follow the price breaks as the quantity changes — reaching a tier is the
// whole point of them.
watch(
  () => formState.quantity,
  (quantity) => {
    const tier = breakForQuantity(quantity)
    if (tier) formState.unitPrice = String(tier.unitPrice)
  }
)

const orderForm = useTemplateRef('orderForm')
watch(
  () => formState.variantId,
  (variantId) => {
    if (variantOptions.value.length === 0) return
    if (!variantId) {
      formState.variantTitle = ''
      return
    }
    const option = variantOptions.value.find(
      item => item.value === variantId
    )
    if (!option) return
    formState.variantTitle = option.title
    if (option.price != null) {
      formState.unitPrice = option.price
    }
  }
)

watchEffect((onCleanup) => {
  if (!isOpen.value) return
  const externalUrl = formState.externalUrl?.trim()
  if (!externalUrl) {
    variantOptions.value = []
    priceBreaks.value = []
    isLookingUpVendor.value = false
    return
  }

  if (skipNextVendorLookup.value) {
    skipNextVendorLookup.value = false
    // Editing an existing part: a full lookup would overwrite what's already
    // in the form. A DigiKey part still needs its breaks back, so fetch them
    // and take nothing else — the saved price stands until the quantity moves.
    if (isDigiKeyUrl(externalUrl)) {
      const breaksController = new AbortController()
      onCleanup(() => breaksController.abort())
      void (async () => {
        try {
          const extracted = await $fetch<ExtractionResponse>(
            '/api/vendors/extract',
            { query: { url: externalUrl }, signal: breaksController.signal }
          )
          priceBreaks.value = extracted.product?.priceBreaks ?? []
        } catch {
          priceBreaks.value = []
        }
      })()
    }
    return
  }

  const controller = new AbortController()
  onCleanup(() => controller.abort());

  (async () => {
    try {
      isLookingUpVendor.value = true

      // Primary: self-contained extractor (Shopify JSON / JSON-LD / OpenGraph)
      // that covers common FRC vendors directly from the product page.
      const extracted = await $fetch<ExtractionResponse>(
        '/api/vendors/extract',
        {
          query: { url: externalUrl },
          signal: controller.signal
        }
      )

      if (extracted.product) {
        await applyExtractedProduct(extracted)
        return
      }

      // Fallback: the external scraper service (BigCommerce/Amazon/etc.).
      const data = await $fetch<VendorProductResponse>('/api/vendors', {
        query: { url: externalUrl },
        signal: controller.signal
      })
      await applyScraperProduct(data)
    } catch (error) {
      if (!controller.signal.aborted) {
        variantOptions.value = []
        console.error('Vendor lookup failed', error)
      }
    } finally {
      if (!controller.signal.aborted) {
        isLookingUpVendor.value = false
      }
    }
  })()
})

async function applyExtractedProduct(data: ExtractionResponse) {
  const product = data.product
  if (!product) {
    variantOptions.value = []
    return
  }

  if (data.vendorName) {
    formState.vendorId = data.vendorName
  }

  if (product.title) {
    formState.partName = product.title
    await orderForm.value?.validate({ name: 'partName' })
  }

  // Auto-fill Notes with the product description, but never clobber notes the
  // user has already typed.
  if (product.description && !formState.description.trim()) {
    formState.description = product.description
  }

  // The stored "variant" value is the SKU when we have one (falls back to the
  // platform variant id), matching the field's "Variant SKU or ID" intent.
  const options = product.variants.map((variant) => {
    const priceString = variant.price != null ? String(variant.price) : null
    const formattedPrice = formatVariantPriceLabel(priceString)
    return {
      label: formattedPrice
        ? `${variant.title} · ${formattedPrice}`
        : variant.title,
      value: variant.sku ?? variant.id,
      title: variant.title,
      price: priceString
    } satisfies VariantOption
  })
  variantOptions.value = options

  if (options.length > 0) {
    const existing = options[0]!
    formState.variantId = existing.value
    formState.variantTitle = existing.title
    if (existing.price != null) {
      formState.unitPrice = existing.price
    }
  } else {
    formState.variantId = product.sku ?? ''
    formState.variantTitle = product.variantTitle ?? ''
  }

  if (product.price != null && !formState.unitPrice) {
    formState.unitPrice = String(product.price)
  }

  priceBreaks.value = product.priceBreaks ?? []
  const tier = breakForQuantity(formState.quantity)
  if (tier) formState.unitPrice = String(tier.unitPrice)
}

async function applyScraperProduct(data: VendorProductResponse) {
  formState.vendorId = data.vendor.id

  const product = data.productData?.product
  if (!product) {
    variantOptions.value = []
    return
  }

  if (product.title) {
    formState.partName = product.title
    await orderForm.value?.validate({ name: 'partName' })
  }

  const options
    = product.variants?.map((variant) => {
      const formattedPrice = formatVariantPriceLabel(variant.price ?? null)
      return {
        label: formattedPrice
          ? `${variant.title} · ${formattedPrice}`
          : variant.title,
        value: String(variant.id),
        title: variant.title,
        price: variant.price ?? null
      } satisfies VariantOption
    }) ?? []

  variantOptions.value = options

  if (options.length > 0) {
    const preferredId = data.variantId
      ? String(data.variantId)
      : formState.variantId
    const existing
      = options.find(option => option.value === preferredId) ?? options[0]
    if (existing) {
      formState.variantId = existing.value
      formState.variantTitle = existing.title
      if (existing.price != null) {
        formState.unitPrice = existing.price
      }
    }
  } else {
    formState.variantId = ''
    formState.variantTitle = ''
  }
}

function initializeFormState() {
  if (props.mode === 'edit' && props.initialItem) {
    skipNextVendorLookup.value = true
    formState.externalUrl = props.initialItem.externalUrl ?? ''
    formState.partName = props.initialItem.partName
    formState.quantity = props.initialItem.quantity
    formState.unitPrice
      = props.initialItem.unitPriceCents !== null
        ? (props.initialItem.unitPriceCents / 100).toFixed(2)
        : ''
    // Vendor lives on the order, not the item, so it isn't edited here.
    formState.vendorId = ''
    formState.variantId = props.initialItem.variantId ?? ''
    formState.variantTitle = props.initialItem.variantTitle ?? ''
    formState.description = props.initialItem.description ?? ''
    formState.tagIds = props.initialItem.tags?.map(t => t.id) ?? []
  } else {
    resetFormState()
  }
  variantOptions.value = []
  priceBreaks.value = []
}

function resetFormState() {
  formState.externalUrl = props.initialUrl ?? ''
  formState.partName = ''
  formState.quantity = 1
  formState.unitPrice = ''
  formState.vendorId = ''
  formState.variantId = ''
  formState.variantTitle = ''
  formState.description = ''
  formState.tagIds = []
}

function handleCancel() {
  isOpen.value = false
}

function handleSubmit(event: FormSubmitEvent<OrderFormSchema>) {
  const payload: OrderEditorValues = {
    partName: event.data.partName,
    quantity: event.data.quantity,
    description: event.data.description ?? undefined,
    vendorId: event.data.vendorId ?? null,
    unitPriceCents: event.data.unitPrice != null
      ? Math.ceil(Number(event.data.unitPrice) * 100)
      : undefined,
    variantId: event.data.variantId ?? undefined,
    variantTitle: event.data.variantTitle ?? undefined,
    externalUrl: event.data.externalUrl ?? undefined,
    tagIds: formState.tagIds.length > 0 ? formState.tagIds : []
  }

  emit('submit', {
    mode: props.mode,
    orderId: props.initialItem?.orderId ?? null,
    itemId: props.initialItem?.id ?? null,
    values: payload
  })
}

function formatVariantPriceLabel(price?: string | null) {
  if (price == null) return null
  const numeric = Number(price)
  if (Number.isNaN(numeric)) return price
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(numeric)
  } catch {
    return price
  }
}

interface VariantOption {
  label: string
  value: string
  title: string
  price?: string | null
}

interface ExtractionResponse {
  vendorName: string
  source:
    | 'shopify'
    | 'amazon'
    | 'digikey'
    | 'json-ld'
    | 'opengraph'
    | 'scraper'
    | 'url'
    | 'none'
  product: {
    title: string
    description: string | null
    price: number | null
    currency: string | null
    sku: string | null
    variantTitle: string | null
    variants: Array<{
      id: string
      sku: string | null
      title: string
      price: number | null
    }>
    priceBreaks?: Array<{ quantity: number, unitPrice: number }>
  } | null
}

interface VendorProductResponse {
  vendor: {
    id: string
    name: string
    type: 'shopify'
    config: string
    hostname: string
  }
  productData?: {
    product?: {
      title?: string
      variants?: Array<{
        id: string | number
        title: string
        price?: string | null
      }>
    }
  }
  variantId?: string | number | null
}
</script>
