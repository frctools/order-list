import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";

interface NotificationPreferences {
  id: string;
  userId: string;
  organizationId: string;
  orderCreated: boolean;
  orderStatusChanged: boolean;
  orderDeleted: boolean;
  dailyDigest: boolean;
  digestTime: string;
  createdAt: string;
  updatedAt: string;
}

interface NotificationLog {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  subject: string;
  recipientEmail: string;
  status: string;
  errorMessage?: string;
  createdAt: string;
}

export const useNotifications = () => {
  const queryClient = useQueryClient();

  const {
    data: preferences,
    isLoading: preferencesLoading,
    error: preferencesError,
  } = useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: async () => {
      const response = await fetch("/api/notifications/preferences");
      if (!response.ok) throw new Error("Failed to fetch preferences");
      return (await response.json()) as NotificationPreferences;
    },
  });

  const {
    data: logData,
    isLoading: logLoading,
    error: logError,
  } = useQuery({
    queryKey: ["notifications", "log"],
    queryFn: async () => {
      const response = await fetch("/api/notifications/log?limit=20");
      if (!response.ok) throw new Error("Failed to fetch log");
      const data = await response.json();
      return {
        logs: (data.logs || []) as NotificationLog[],
        total: data.total || 0,
      };
    },
  });
  // mutation to update preferences
  const { mutate: updatePreferences, isPending: isUpdating } = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update preferences");
      return (await response.json()) as NotificationPreferences;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["notifications", "preferences"], data);
    },
  });

  return {
    preferences: computed(() => preferences.value),
    preferencesLoading,
    preferencesError,
    updatePreferences,
    isUpdating,

    logs: computed(() => logData.value?.logs || []),
    logTotal: computed(() => logData.value?.total || 0),
    logLoading,
    logError,
  };
};
