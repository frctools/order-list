<template>
  <USlideover
    v-model:open="isOpen"
    side="right"
  >
    <template #content>
      <UCard class="flex h-full flex-col">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Create a tag
            </h3>
            <p class="text-sm text-gray-500">
              Tags help organize and categorize orders.
            </p>
          </div>
        </template>

        <UForm
          :state="formState"
          :schema="createTagSchema"
          class="flex flex-1 flex-col gap-6"
          @submit="handleSubmit"
        >
          <div class="grid flex-1 gap-4">
            <UFormField
              label="Tag name"
              name="name"
              required
            >
              <UInput
                v-model="formState.name"
                placeholder="e.g., Urgent, Electronics, etc."
                size="xl"
                class="w-full"
                autofocus
              />
            </UFormField>

            <UFormField
              label="Color"
              name="color"
            >
              <UPopover>
                <UButton
                  label="Choose color"
                  color="neutral"
                  variant="outline"
                  size="xl"
                >
                  <template #leading>
                    <span
                      :style="chipStyle"
                      class="size-4 rounded-full"
                    />
                  </template>
                </UButton>

                <template #content>
                  <UColorPicker
                    v-model="formState.color"
                    class="p-2"
                  />
                </template>
              </UPopover>
            </UFormField>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              @click="handleCancel"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="isSubmitting"
            >
              Create tag
            </UButton>
          </div>
        </UForm>
      </UCard>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import * as z from 'zod'
import type { FormSubmitEvent } from '#ui/types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'created'): void
}>()

const toast = useToast()

const isOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})

const createTagSchema = z.object({
  name: z
    .string()
    .min(1, 'Tag name is required')
    .max(50, 'Tag name must be 50 characters or less'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color')
})

type TagForm = z.infer<typeof createTagSchema>

const formState = reactive<TagForm>({
  name: '',
  color: '#6366f1'
})

const isSubmitting = ref(false)

const chipStyle = computed(() => ({ backgroundColor: formState.color }))

function resetForm() {
  formState.name = ''
  formState.color = '#6366f1'
}

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      resetForm()
    }
  }
)

function handleCancel() {
  isOpen.value = false
}

function extractErrorMessage(err: unknown) {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const candidate = err as {
      message?: string
      data?: { statusMessage?: string }
    }
    return (
      candidate.message
      ?? candidate.data?.statusMessage
      ?? 'Something went wrong. Please try again.'
    )
  }
  return 'Something went wrong. Please try again.'
}

async function handleSubmit(event: FormSubmitEvent<TagForm>) {
  isSubmitting.value = true
  try {
    await $fetch('/api/tags', {
      method: 'POST',
      body: {
        name: event.data.name,
        color: event.data.color
      }
    })
    toast.add({
      title: 'Tag created',
      color: 'success',
      icon: 'i-lucide-tag'
    })
    isOpen.value = false
    emit('created')
  } catch (err) {
    toast.add({
      title: 'Unable to create tag',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>
