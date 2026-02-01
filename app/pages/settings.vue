<template>
  <div class="min-h-screen bg-default">
    <UContainer class="mx-auto flex flex-col gap-8 py-10">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            class="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-50"
          >
            Settings
          </h1>
          <p class="text-sm text-gray-500">
            Manage your account, notifications, and preferences.
          </p>
        </div>
      </header>

      <!-- Settings Tabs -->
      <UTabs :items="settingsTabs" class="w-full">
        <!-- Account Settings Tab -->
        <template #account>
          <div class="space-y-6">
            <!-- Profile Section -->
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-user" class="w-5 h-5" />
                  <h2
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Profile
                  </h2>
                </div>
              </template>

              <div class="space-y-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Full name
                    </label>
                    <UInput
                      v-model="profileForm.name"
                      placeholder="Your name"
                      :disabled="isSavingProfile"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Email
                    </label>
                    <UInput
                      :model-value="auth.user.value?.email"
                      disabled
                      type="email"
                    />
                    <p class="text-xs text-gray-500 mt-1">
                      Contact support to change your email
                    </p>
                  </div>
                </div>

                <div class="flex justify-end">
                  <UButton
                    :loading="isSavingProfile"
                    :disabled="profileForm.name === auth.user.value?.name"
                    @click="saveProfile"
                  >
                    Save profile
                  </UButton>
                </div>
              </div>
            </UCard>

            <!-- Security Section -->
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-lock" class="w-5 h-5" />
                  <h2
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Security
                  </h2>
                </div>
              </template>

              <div class="space-y-4">
                <div>
                  <label
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Password
                  </label>
                  <UButton
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-key"
                    @click="showChangePasswordModal = true"
                  >
                    Change password
                  </UButton>
                </div>

                <USeparator />

                <div>
                  <h3
                    class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2"
                  >
                    Active Sessions
                  </h3>
                  <p class="text-sm text-gray-500 mb-4">
                    Manage your active sessions and sign out from other devices.
                  </p>

                  <!-- Sessions List -->
                  <div v-if="sessionsLoading" class="space-y-2 mb-4">
                    <USkeleton
                      v-for="i in 2"
                      :key="i"
                      class="h-16 rounded-lg"
                    />
                  </div>

                  <div v-else-if="sessions.length > 0" class="space-y-2 mb-4">
                    <div
                      v-for="sessionItem in sessions"
                      :key="sessionItem.id"
                      class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                      :class="{
                        'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800':
                          sessionItem.token === auth.session.value?.token,
                      }"
                    >
                      <div class="flex items-center gap-3">
                        <UIcon
                          :name="getDeviceIcon(sessionItem.userAgent)"
                          class="w-5 h-5 text-gray-500"
                        />
                        <div>
                          <div class="flex items-center gap-2">
                            <p
                              class="text-sm font-medium text-gray-900 dark:text-gray-100"
                            >
                              {{ parseUserAgent(sessionItem.userAgent) }}
                            </p>
                            <UBadge
                              v-if="
                                sessionItem.token === auth.session.value?.token
                              "
                              color="primary"
                              variant="soft"
                              size="xs"
                            >
                              Current
                            </UBadge>
                          </div>
                          <p class="text-xs text-gray-500">
                            {{ sessionItem.ipAddress || "Unknown IP" }} · Last
                            active {{ formatDate(sessionItem.updatedAt) }}
                          </p>
                        </div>
                      </div>
                      <UButton
                        v-if="sessionItem.token !== auth.session.value?.token"
                        color="error"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-x"
                        :loading="revokingSessionId === sessionItem.token"
                        @click="revokeSession(sessionItem.token)"
                      />
                    </div>
                  </div>

                  <div
                    v-else
                    class="text-center py-4 mb-4 text-sm text-gray-500"
                  >
                    No active sessions found
                  </div>

                  <div class="flex gap-2">
                    <UButton
                      color="neutral"
                      variant="soft"
                      icon="i-lucide-refresh-cw"
                      :loading="sessionsLoading"
                      @click="loadSessions"
                    >
                      Refresh
                    </UButton>
                    <UButton
                      color="error"
                      variant="soft"
                      icon="i-lucide-log-out"
                      :loading="isRevokingAllSessions"
                      :disabled="sessions.length <= 1"
                      @click="revokeOtherSessions"
                    >
                      Sign out from other devices
                    </UButton>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Danger Zone -->
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-alert-triangle"
                    class="w-5 h-5 text-red-500"
                  />
                  <h2
                    class="text-lg font-semibold text-red-600 dark:text-red-400"
                  >
                    Danger Zone
                  </h2>
                </div>
              </template>

              <div class="space-y-4">
                <div
                  class="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                >
                  <h3
                    class="text-sm font-medium text-red-800 dark:text-red-200 mb-1"
                  >
                    Delete Account
                  </h3>
                  <p class="text-sm text-red-600 dark:text-red-400 mb-4">
                    Once you delete your account, there is no going back. All
                    your data will be permanently removed.
                  </p>
                  <UButton
                    color="error"
                    variant="solid"
                    icon="i-lucide-trash-2"
                    @click="showDeleteAccountModal = true"
                  >
                    Delete my account
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>
        </template>

        <template #notifications>
          <div class="space-y-6">
            <UCard v-if="preferences">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-bell" class="w-5 h-5" />
                  <h2
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Email notifications
                  </h2>
                </div>
              </template>

              <NotificationPreferences />
            </UCard>

            <UCard v-else class="text-center py-8">
              <USkeleton class="h-6 w-32 mx-auto mb-2" />
              <USkeleton class="h-4 w-48 mx-auto" />
            </UCard>

            <!-- Notification History -->
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-history" class="w-5 h-5" />
                  <h2
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Notification history
                  </h2>
                </div>
              </template>

              <div v-if="logLoading" class="space-y-2">
                <USkeleton v-for="i in 3" :key="i" class="h-12 rounded" />
              </div>

              <div v-else-if="logs.length > 0" class="space-y-2">
                <div
                  v-for="log in logs"
                  :key="log.id"
                  class="flex items-start justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <p
                        class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                      >
                        {{ log.subject }}
                      </p>
                      <UBadge
                        :color="log.status === 'sent' ? 'success' : 'error'"
                        variant="soft"
                        size="xs"
                      >
                        {{ log.status }}
                      </UBadge>
                    </div>
                    <p class="text-xs text-gray-500">
                      {{ log.recipientEmail }} ·
                      {{ format(log.createdAt, "PPpp") }}
                    </p>
                    <p
                      v-if="log.errorMessage"
                      class="text-xs text-red-600 dark:text-red-400 mt-1"
                    >
                      {{ log.errorMessage }}
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-8">
                <UIcon
                  name="i-lucide-inbox"
                  class="w-8 h-8 text-gray-400 mx-auto mb-2"
                />
                <p class="text-sm text-gray-500">No notifications sent yet</p>
              </div>
            </UCard>
          </div>
        </template>

        <!-- Preferences Tab -->
        <template #preferences>
          <div class="space-y-6">
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sliders" class="w-5 h-5" />
                  <h2
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Display preferences
                  </h2>
                </div>
              </template>

              <div class="space-y-4">
                <div
                  class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div class="flex-1">
                    <p
                      class="text-sm font-medium text-gray-900 dark:text-gray-100"
                    >
                      Dark mode
                    </p>
                    <p class="text-xs text-gray-500 mt-0.5">
                      Use dark theme for the interface
                    </p>
                  </div>
                  <UColorModeSwitch />
                </div>

                <USeparator />
              </div>
            </UCard>
          </div>
        </template>
      </UTabs>

      <!-- Change Password Modal -->
      <UModal v-model:open="showChangePasswordModal">
        <template #content>
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3
                  class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Change Password
                </h3>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  @click="showChangePasswordModal = false"
                />
              </div>
            </template>

            <form class="space-y-4" @submit.prevent="changePassword">
              <div>
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Current password
                </label>
                <UInput
                  v-model="passwordForm.currentPassword"
                  type="password"
                  placeholder="Enter current password"
                  :disabled="isChangingPassword"
                  required
                />
              </div>
              <div>
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  New password
                </label>
                <UInput
                  v-model="passwordForm.newPassword"
                  type="password"
                  placeholder="Enter new password"
                  :disabled="isChangingPassword"
                  required
                />
              </div>
              <div>
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Confirm new password
                </label>
                <UInput
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  :disabled="isChangingPassword"
                  required
                />
              </div>

              <UCheckbox
                v-model="passwordForm.revokeOtherSessions"
                label="Sign out from other devices"
              />

              <p
                v-if="passwordError"
                class="text-sm text-red-600 dark:text-red-400"
              >
                {{ passwordError }}
              </p>

              <div class="flex justify-end gap-2 pt-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  :disabled="isChangingPassword"
                  @click="showChangePasswordModal = false"
                >
                  Cancel
                </UButton>
                <UButton
                  type="submit"
                  :loading="isChangingPassword"
                  :disabled="
                    !passwordForm.currentPassword ||
                    !passwordForm.newPassword ||
                    !passwordForm.confirmPassword
                  "
                >
                  Change password
                </UButton>
              </div>
            </form>
          </UCard>
        </template>
      </UModal>

      <!-- Delete Account Modal -->
      <UModal v-model:open="showDeleteAccountModal">
        <template #content>
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3
                  class="text-lg font-semibold text-red-600 dark:text-red-400"
                >
                  Delete Account
                </h3>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  @click="showDeleteAccountModal = false"
                />
              </div>
            </template>

            <div class="space-y-4">
              <div
                class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              >
                <p class="text-sm text-red-800 dark:text-red-200">
                  <strong>Warning:</strong> This action cannot be undone. This
                  will permanently delete your account and remove all your data
                  from our servers.
                </p>
              </div>

              <div>
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Enter your password to confirm
                </label>
                <UInput
                  v-model="deleteAccountPassword"
                  type="password"
                  placeholder="Enter your password"
                  :disabled="isDeletingAccount"
                />
              </div>

              <p
                v-if="deleteAccountError"
                class="text-sm text-red-600 dark:text-red-400"
              >
                {{ deleteAccountError }}
              </p>

              <div class="flex justify-end gap-2 pt-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  :disabled="isDeletingAccount"
                  @click="showDeleteAccountModal = false"
                >
                  Cancel
                </UButton>
                <UButton
                  color="error"
                  :loading="isDeletingAccount"
                  :disabled="!deleteAccountPassword"
                  @click="deleteAccount"
                >
                  Delete my account
                </UButton>
              </div>
            </div>
          </UCard>
        </template>
      </UModal>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { format } from "date-fns";
import { UAParser } from "ua-parser-js";

const auth = useAuth();
const toast = useToast();
const {
  preferences,
  logs,
  logLoading,
} = useNotifications();

interface Session {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const profileForm = ref({
  name: auth.user.value?.name || "",
});
const isSavingProfile = ref(false);

const sessions = ref<Session[]>([]);
const sessionsLoading = ref(false);
const revokingSessionId = ref<string | null>(null);
const isRevokingAllSessions = ref(false);

const showChangePasswordModal = ref(false);
const isChangingPassword = ref(false);
const passwordError = ref("");
const passwordForm = ref({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  revokeOtherSessions: true,
});

const showDeleteAccountModal = ref(false);
const isDeletingAccount = ref(false);
const deleteAccountPassword = ref("");
const deleteAccountError = ref("");

const settingsTabs = [
  {
    key: "account",
    label: "Account",
    icon: "i-lucide-user",
    slot: "account" as const,
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: "i-lucide-bell",
    slot: "notifications" as const,
  },
  {
    key: "preferences",
    label: "Preferences",
    icon: "i-lucide-sliders",
    slot: "preferences" as const,
  },
];

const saveProfile = async () => {
  if (profileForm.value.name === auth.user.value?.name) return;

  isSavingProfile.value = true;
  try {
    await auth.client.updateUser({
      name: profileForm.value.name,
    });
    await auth.fetchSession();
    toast.add({
      title: "Profile updated",
      description: "Your profile has been updated successfully.",
      color: "success",
    });
  } catch (error: any) {
    toast.add({
      title: "Error",
      description: error?.message || "Failed to update profile",
      color: "error",
    });
  } finally {
    isSavingProfile.value = false;
  }
};

const loadSessions = async () => {
  sessionsLoading.value = true;
  try {
    const response = await auth.client.listSessions();
    sessions.value = (response.data || []) as Session[];
  } catch (error: any) {
    toast.add({
      title: "Error",
      description: "Failed to load sessions",
      color: "error",
    });
  } finally {
    sessionsLoading.value = false;
  }
};

const revokeSession = async (token: string) => {
  revokingSessionId.value = token;
  try {
    await auth.client.revokeSession({ token });
    sessions.value = sessions.value.filter((s) => s.token !== token);
    toast.add({
      title: "Session revoked",
      description: "The session has been signed out.",
      color: "success",
    });
  } catch (error: any) {
    toast.add({
      title: "Error",
      description: error?.message || "Failed to revoke session",
      color: "error",
    });
  } finally {
    revokingSessionId.value = null;
  }
};

const revokeOtherSessions = async () => {
  isRevokingAllSessions.value = true;
  try {
    await auth.client.revokeOtherSessions();
    await loadSessions();
    toast.add({
      title: "Sessions revoked",
      description: "All other sessions have been signed out.",
      color: "success",
    });
  } catch (error: any) {
    toast.add({
      title: "Error",
      description: error?.message || "Failed to revoke sessions",
      color: "error",
    });
  } finally {
    isRevokingAllSessions.value = false;
  }
};

const changePassword = async () => {
  passwordError.value = "";

  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordError.value = "New passwords do not match";
    return;
  }

  if (passwordForm.value.newPassword.length < 8) {
    passwordError.value = "Password must be at least 8 characters";
    return;
  }

  isChangingPassword.value = true;
  try {
    await auth.client.changePassword({
      currentPassword: passwordForm.value.currentPassword,
      newPassword: passwordForm.value.newPassword,
      revokeOtherSessions: passwordForm.value.revokeOtherSessions,
    });

    showChangePasswordModal.value = false;
    passwordForm.value = {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: true,
    };

    if (passwordForm.value.revokeOtherSessions) {
      await loadSessions();
    }

    toast.add({
      title: "Password changed",
      description: "Your password has been updated successfully.",
      color: "success",
    });
  } catch (error: any) {
    passwordError.value = error?.message || "Failed to change password. Make sure your current password is correct.";
  } finally {
    isChangingPassword.value = false;
  }
};

const deleteAccount = async () => {
  deleteAccountError.value = "";
  isDeletingAccount.value = true;

  try {
    await auth.client.deleteUser({
      password: deleteAccountPassword.value,
    });

    toast.add({
      title: "Account deleted",
      description: "Your account has been permanently deleted.",
      color: "success",
    });

    await auth.signOut({ redirectTo: "/" });
  } catch (error: any) {
    deleteAccountError.value = error?.message || "Failed to delete account. Make sure your password is correct.";
  } finally {
    isDeletingAccount.value = false;
  }
};

const formatDate = (date: string | Date) => {
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
};

const parseUserAgent = (userAgent: string | null): string => {
  const parsed = new UAParser(userAgent || "");
  const browser = parsed.getBrowser();
  if (!userAgent) return "Unknown device";
  return `${browser.name || "Unknown Browser"} ${browser.version || ""}`.trim();

};

const getDeviceIcon = (userAgent: string | null): string => {
  const parsed = new UAParser(userAgent || "");
  const device = parsed.getDevice();
  if (device.type === "mobile") return "i-lucide-smartphone";
  if (device.type === "tablet") return "i-lucide-tablet";
  if (device.type === "console") return "i-lucide-gamepad";
  if (device.type === "wearable") return "i-lucide-watch";
  if (device.type === "smarttv") return "i-lucide-tv";
  return "i-lucide-monitor";
};

onMounted(() => {
  loadSessions();
});
</script>
