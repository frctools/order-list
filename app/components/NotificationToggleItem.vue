<template>
  <div
    class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
  >
    <div class="flex-1">
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
        {{ title }}
      </p>
      <p class="text-xs text-gray-500 mt-0.5">
        {{ description }}
      </p>
    </div>
    <USwitch
      :model-value="modelValue"
      :disabled="loading"
      @update:model-value="$emit('update', $event)"
    />
  </div>
</template>

<script setup lang="ts">
defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["update"]);
</script>
