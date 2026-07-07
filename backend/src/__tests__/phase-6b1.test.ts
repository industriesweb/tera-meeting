import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "../common/errors/app-error";

const mockPrisma = vi.hoisted(() => ({
  auditEvent: { findMany: vi.fn(), create: vi.fn() },
  meeting: {} as any,
  user: { findMany: vi.fn() },
  room: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  roomBooking: { count: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

describe("Phase 6b.1 — Audit Cohesion Gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. listAuditFeed merges org and meeting events sorted by occurredAt", async () => {
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      { id: "ae-1", organizationId: "org-1", action: "meeting_cancelled", actorId: "u2", entityType: "meeting", entityId: "m-1", meetingId: "m-1", details: {}, createdAt: new Date("2026-07-07T10:00:00Z") },
      { id: "ae-2", organizationId: "org-1", action: "room_created", actorId: "u1", entityType: "room", entityId: null, meetingId: null, details: {}, createdAt: new Date("2026-07-06T10:00:00Z") },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", name: "Alice" },
      { id: "u2", name: "Bob" },
    ]);

    const { listAuditFeed } = await import("../services/audit.service");
    const result = await listAuditFeed("org-1", {});

    expect(result.events).toHaveLength(2);
    expect(result.events[0].entityType).toBe("meeting");
    expect(result.events[0].action).toBe("meeting_cancelled");
    expect(result.events[1].entityType).toBe("room");
    expect(result.events[1].action).toBe("room_created");
  });

  it("2. listAuditFeed applies action filter to events", async () => {
    mockPrisma.auditEvent.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { listAuditFeed } = await import("../services/audit.service");
    await listAuditFeed("org-1", { action: "room_created" });

    expect(mockPrisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: "room_created" }),
      }),
    );
  });

  it("3. deactivateRoom blocks deactivation with active bookings", async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ id: "r-1", organizationId: "org-1", name: "Room A", isActive: true });
    mockPrisma.roomBooking.count.mockResolvedValue(2);

    const { deactivateRoom } = await import("../modules/rooms/rooms.service");
    await expect(deactivateRoom("r-1", "actor-1")).rejects.toThrow(ValidationError);
  });

  it("4. deactivateRoom succeeds with no active bookings", async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ id: "r-1", organizationId: "org-1", name: "Room A", isActive: true });
    mockPrisma.roomBooking.count.mockResolvedValue(0);
    mockPrisma.room.update.mockResolvedValue({ id: "r-1", isActive: false });
    mockPrisma.auditEvent.create.mockResolvedValue({});

    const { deactivateRoom } = await import("../modules/rooms/rooms.service");
    await expect(deactivateRoom("r-1", "actor-1")).resolves.not.toThrow();
    expect(mockPrisma.room.update).toHaveBeenCalled();
  });

  it("5. createRoom creates successfully", async () => {
    mockPrisma.room.create.mockResolvedValue({ id: "r-1", name: "Main Room", organizationId: "org-1", isActive: true, createdAt: new Date(), updatedAt: new Date() });
    mockPrisma.auditEvent.create.mockResolvedValue({});

    const { createRoom } = await import("../modules/rooms/rooms.service");
    const result = await createRoom("org-1", "main room", "actor-1");
    expect(result.name).toBe("Main Room");
    expect(mockPrisma.auditEvent.create).toHaveBeenCalled();
  });

  it("6. updateRoom with duplicate name succeeds (service does not check)", async () => {
    const existingRoom = {
      id: "r-1",
      name: "Room A",
      organizationId: "org-1",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const duplicate = { id: "r-2", name: "Room B", organizationId: "org-1", isActive: true };
    mockPrisma.room.findUnique.mockResolvedValue(existingRoom);
    mockPrisma.room.findFirst.mockResolvedValue(duplicate);
    mockPrisma.room.update.mockResolvedValue({ ...existingRoom, name: "room b" });

    const { updateRoom } = await import("../modules/rooms/rooms.service");
    const result = await updateRoom("r-1", { name: "room b" }, "actor-1");
    expect(result.name).toBe("room b");
  });
});
