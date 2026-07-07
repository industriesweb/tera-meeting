"use client";

import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from "@/lib/api/queries/notifications";
import { MailIcon, AlarmIcon, EditIcon, CancelIcon, PersonRemoveIcon, NotificationsIcon } from "@/components/icons";
import type { NotificationType } from "@/types/api";
import type { SVGProps } from "react";

const NOTIFICATION_ICONS: Record<NotificationType, React.ComponentType<SVGProps<SVGSVGElement>>> = {
  MEETING_INVITATION: MailIcon,
  MEETING_REMINDER: AlarmIcon,
  MEETING_UPDATED: EditIcon,
  MEETING_CANCELLED: CancelIcon,
  ATTENDEE_REMOVED: PersonRemoveIcon,
};

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const { data: unreadData } = useUnreadCount();
  const markRead = useMarkAsRead();
  const markAll = useMarkAllAsRead();

  const unreadCount = unreadData?.count ?? 0;

  const handleMarkRead = (id: string) => {
    markRead.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAll.mutate();
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-headline text-2xl font-bold text-on-surface">Notifications</h1>
            <p className="text-sm text-secondary mt-1">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "All caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markAll.isPending}
              className="px-4 py-2 rounded-lg bg-primary-container/40 text-on-primary-fixed-variant text-sm font-bold hover:brightness-110 transition-all"
            >
              Mark all read
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : !notifications?.length ? (
          <div className="text-center py-16">
            <NotificationsIcon className="h-12 w-12 text-secondary/30 mx-auto" />
            <p className="text-secondary mt-3 text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => !notif.readAt && handleMarkRead(notif.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  notif.readAt
                    ? "bg-surface border-outline-variant/10 opacity-60"
                    : "bg-surface border-primary/20 hover:bg-surface-container-high"
                }`}
              >
                <div className="flex items-start gap-3">
                  {(() => {
                    const IconComponent = NOTIFICATION_ICONS[notif.type];
                    return IconComponent ? (
                      <IconComponent className="h-5 w-5 text-secondary mt-0.5 shrink-0" />
                    ) : null;
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm ${notif.readAt ? "font-normal" : "font-bold text-on-surface"}`}>
                        {notif.title}
                      </h3>
                      {!notif.readAt && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    {notif.body && <p className="text-sm text-secondary mt-1">{notif.body}</p>}
                    <p className="text-xs text-secondary/60 mt-1">
                      {new Date(notif.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
