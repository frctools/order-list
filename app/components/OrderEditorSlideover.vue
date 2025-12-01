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

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField
                name="vendorId"
                label="Vendor"
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
import { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'
import type {
  Order,
  OrderEditorSubmitPayload,
  OrderEditorValues,
  Tag
} from '~/types/orders'

const props = defineProps<{
  mode: 'create' | 'edit'
  loading?: boolean
  initialOrder?: Order | null
  initialUrl?: string | null
  availableTags?: Tag[]
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

const variantOptions = ref<VariantOption[]>([])

const tagOptions = computed(() =>
  (props.availableTags || []).map(tag => ({
    label: tag.name,
    value: tag.id,
    color: tag.color
  }))
)

const headerTitle = computed(() =>
  props.mode === 'edit' ? 'Edit order' : 'New order'
)
const headerDescription = computed(() =>
  props.mode === 'edit'
    ? 'Update the order details and save your changes.'
    : 'Fill out the details below to create a new order request.'
)
const actionLabel = computed(() =>
  props.mode === 'edit' ? 'Save changes' : 'Create order'
)

watch(
  () => [isOpen.value, props.mode, props.initialOrder],
  () => {
    if (!isOpen.value) {
      return
    }
    initializeFormState()
  },
  { immediate: true }
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
    if (option.price) {
      formState.unitPrice = option.price
    }
  }
)

watchEffect((onCleanup) => {
  if (!isOpen.value) return
  const externalUrl = formState.externalUrl?.trim()
  if (!externalUrl) {
    variantOptions.value = []
    isLookingUpVendor.value = false
    return
  }

  const controller = new AbortController()
  onCleanup(() => controller.abort());

  (async () => {
    try {
      isLookingUpVendor.value = true
      const data = await $fetch<VendorProductResponse>('/api/vendors', {
        query: { url: externalUrl },
        signal: controller.signal
      })
      isLookingUpVendor.value = false
      formState.vendorId = data.vendor.id

      const product = data.productData?.product
      if (!product) {
        variantOptions.value = []
        return
      }

      if (product.title) {
        formState.partName = product.title
        await orderForm.value?.validate({
          name: 'partName'
        })
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
          if (existing.price) {
            formState.unitPrice = existing.price
          }
        }
      } else {
        formState.variantId = ''
        formState.variantTitle = ''
      }
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

function initializeFormState() {
  if (props.mode === 'edit' && props.initialOrder) {
    formState.externalUrl = props.initialOrder.externalUrl ?? ''
    formState.partName = props.initialOrder.partName
    formState.quantity = props.initialOrder.quantity
    formState.unitPrice
      = props.initialOrder.unitPriceCents !== null
        ? (props.initialOrder.unitPriceCents / 100).toFixed(2)
        : ''
    formState.vendorId = props.initialOrder.vendorId ?? ''
    if (!formState.vendorId) {
      formState.vendorId = props.initialOrder.vendorName ?? ''
    }
    formState.variantId = props.initialOrder.variantId ?? ''
    formState.variantTitle = props.initialOrder.variantTitle ?? ''
    formState.description = props.initialOrder.description ?? ''
    formState.tagIds = props.initialOrder.tags?.map(t => t.id) ?? []
  } else {
    resetFormState()
  }
  variantOptions.value = []
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
    unitPriceCents: event.data.unitPrice
      ? Math.ceil(Number(event.data.unitPrice) * 100)
      : undefined,
    variantId: event.data.variantId ?? undefined,
    variantTitle: event.data.variantTitle ?? undefined,
    externalUrl: event.data.externalUrl ?? undefined,
    tagIds: formState.tagIds.length > 0 ? formState.tagIds : undefined
  }

  emit('submit', {
    mode: props.mode,
    orderId: props.initialOrder?.id ?? null,
    values: payload
  })
}

function formatVariantPriceLabel(price?: string | null) {
  if (!price) return null
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
