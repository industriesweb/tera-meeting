import { prisma } from "../../config/database";
import { NotFoundError } from "../../common/errors/app-error";

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markAsRead(id: string, userId: string) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new NotFoundError("Notification");
  if (notification.userId !== userId) throw new NotFoundError("Notification");

  return prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function createNotification(
  userId: string,
  data: { type: string; title: string; body?: string; meta?: any }
) {
  return prisma.notification.create({
    data: {
      userId,
      type: data.type as any,
      title: data.title,
      body: data.body,
      data: data.meta,
    },
  });
}

export async function notifyMeetingParticipants(
  meetingId: string,
  eventType: string,
  title: string,
  body: string,
  meta?: any
) {
  const attendees = await prisma.meetingAttendee.findMany({
    where: { meetingId },
    select: { userId: true },
  });

  const notifications = attendees.map((a) => ({
    userId: a.userId,
    type: eventType as any,
    title,
    body,
    data: meta ?? {},
  }));

  await prisma.notification.createMany({ data: notifications });
}

// --- Notification Preferences ---

export async function getPreferences(userId: string) {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
  return prefs ?? { userId, meetingReminderEmail: false, outcomePromptEmail: false };
}

export async function updatePreferences(
  userId: string,
  data: { meetingReminderEmail?: boolean; outcomePromptEmail?: boolean }
) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
