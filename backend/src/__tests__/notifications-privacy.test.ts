import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("../config/database", () => ({
  prisma: {
    notification: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
    meetingAttendee: { findMany: vi.fn() },
  },
}));

let mockPrisma: any;

describe("Notification privacy rules", () => {
  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("1. User cannot read another user's notifications", async () => {
    const service = await import("../modules/notifications/notifications.service");
    mockPrisma.notification.findMany.mockResolvedValue([]);

    const result = await service.listNotifications("user-a");
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-a" } })
    );
    expect(result).toEqual([]);
  });

  it("2. User cannot mark another user's notification as read", async () => {
    const service = await import("../modules/notifications/notifications.service");
    mockPrisma.notification.findUnique.mockResolvedValue({ id: "n-1", userId: "user-b", readAt: null });

    await expect(service.markAsRead("n-1", "user-a")).rejects.toThrow();
  });

  it("3. Mark all read affects only own notifications", async () => {
    const service = await import("../modules/notifications/notifications.service");
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await service.markAllAsRead("user-a");
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-a", readAt: null } })
    );
  });

  it("4. Unread count queries only own notifications", async () => {
    const service = await import("../modules/notifications/notifications.service");
    mockPrisma.notification.count.mockResolvedValue(5);

    const count = await service.getUnreadCount("user-a");
    expect(mockPrisma.notification.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-a", readAt: null } })
    );
    expect(count).toBe(5);
  });

  it("5. Mark as read succeeds for own notification", async () => {
    const service = await import("../modules/notifications/notifications.service");
    mockPrisma.notification.findUnique.mockResolvedValue({ id: "n-1", userId: "user-a", readAt: null });
    mockPrisma.notification.update.mockResolvedValue({ id: "n-1", userId: "user-a", readAt: new Date() });

    const result = await service.markAsRead("n-1", "user-a");
    expect(result.readAt).toBeTruthy();
  });

  it("6. List notifications returns max 100 items", async () => {
    const service = await import("../modules/notifications/notifications.service");
    mockPrisma.notification.findMany.mockResolvedValue([]);

    await service.listNotifications("user-a");
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });
});
