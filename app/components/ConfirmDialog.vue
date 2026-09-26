<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  color?: 'error' | 'primary' | 'warning' | 'neutral'
  icon?: string
}>(), {
  description: undefined,
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  color: 'error',
  icon: undefined
})

const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :close="false"
    :ui="{ footer: 'justify-end' }"
  >
    <template
      v-if="icon"
      #title
    >
      <span class="flex items-center gap-2">
        <UIcon
          :name="icon"
          class="size-5 shrink-0"
          :class="color === 'error' ? 'text-error' : 'text-primary'"
        />
        {{ title }}
      </span>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="ghost"
        :label="cancelLabel"
        @click="emit('close', false)"
      />
      <UButton
        :color="color"
        :label="confirmLabel"
        autofocus
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
