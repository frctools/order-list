<template>
  <div class="space-y-4">
    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-16 rounded" />
    </div>

    <template v-else-if="preferences">
      <!-- Order Notifications Section -->
      <div>
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-package" class="w-4 h-4" />
            Orders
          </div>
        </h3>
        <div class="space-y-3">
          <NotificationToggleItem
            v-model="preferences.orderCreated"
            :loading="isUpdating"
            title="New orders created"
            description="Get notified when someone creates a new order"
            @update="updatePreference('orderCreated', $event)"
          />
          <NotificationToggleItem
            v-model="preferences.orderStatusChanged"
            :loading="isUpdating"
            title="Order status changes"
            description="Get notified when an order status is updated"
            @update="updatePreference('orderStatusChanged', $event)"
          />
          <NotificationToggleItem
            v-model="preferences.orderDeleted"
            :loading="isUpdating"
            title="Order deleted"
            description="Get notified when an order is deleted"
            @update="updatePreference('orderDeleted', $event)"
          />
        </div>
      </div>

      <USeparator />

      <div class="hidden">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-mail" class="w-4 h-4" />
            Email digest
          </div>
        </h3>
        <div class="space-y-3">
          <NotificationToggleItem
            v-model="preferences.dailyDigest"
            :loading="isUpdating"
            title="Daily digest"
            description="Receive a daily summary of all activity"
            @update="updatePreference('dailyDigest', $event)"
          />

          <div
            v-if="preferences.dailyDigest"
            class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
          >
            <label
              class="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2"
            >
              Digest delivery time
            </label>
            <div class="flex items-center gap-2">
              <UInput
                v-model="digestTime"
                type="time"
                class="flex-1"
                :disabled="isUpdating"
              />
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Your daily digest will be sent at {{ digestTimeFormatted }}
            </p>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="text-center py-8">
      <p class="text-sm text-gray-500">Failed to load preferences</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const { preferences, updatePreferences, isUpdating } = useNotifications();

const loading = computed(() => !preferences.value);
const digestTime = computed({
  get: () => preferences.value?.digestTime || "09:00",
  set: (value: string) => {
    if (preferences.value) {
      preferences.value.digestTime = value;
      updatePreferences({ digestTime: value });
    }
  },
});
const digestTimeFormatted = computed(() => {
  if (!preferences.value?.digestTime) return "not set";
  const [hours, minutes] = preferences.value.digestTime.split(":");
  const hour = Number.parseInt(hours ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes ?? "00"} ${ampm}`;
});

type NotificationPreferenceKey =
  | "orderCreated"
  | "orderStatusChanged"
  | "orderDeleted"
  | "dailyDigest";

const updatePreference = async (
  key: NotificationPreferenceKey,
  value: boolean,
) => {
  await updatePreferences({ [key]: value });
};


</script>
