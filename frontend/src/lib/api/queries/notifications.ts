import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { notificationKeys } from "@/lib/api/query-keys";
import type { Notification, NotificationPreference } from "@/types/api";

function fetchNotifications(): Promise<Notification[]> {
  return unwrap<Notification[]>(api.get("notifications"));
}

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: fetchNotifications,
  });
}

function fetchUnreadCount(): Promise<{ count: number }> {
  return unwrap<{ count: number }>(api.get("notifications/unread"));
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap<{ success: true }>(api.post("notifications/read-all")),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.list() });
      qc.invalidateQueries({ queryKey: notificationKeys.unread() });
    },
  });
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<Notification>(api.post(`notifications/${id}/read`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.list() });
      qc.invalidateQueries({ queryKey: notificationKeys.unread() });
    },
  });
}

function fetchNotificationPreferences(): Promise<NotificationPreference> {
  return unwrap<NotificationPreference>(api.get("notifications/preferences"));
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: fetchNotificationPreferences,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { meetingReminderEmail?: boolean }) =>
      unwrap<NotificationPreference>(api.patch("notifications/preferences", { json: data })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: notificationKeys.preferences() }); },
  });
}
