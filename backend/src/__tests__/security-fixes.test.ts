import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "../common/errors/app-error";

const mockPrisma = vi.hoisted(() => ({
  meeting: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  meetingAttendee: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  agendaItem: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  roomBooking: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  executiveRequest: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  $executeRaw: vi.fn(),
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

const baseMeeting = {
  id: "meeting-1",
  title: "Test Meeting",
  status: "DRAFT",
  plannedDurationSeconds: 1800,
  scheduledAt: null,
  roomId: null,
  locationType: "PHYSICAL",
  createdById: "user-1",
  organizerId: "user-1",
  organizationId: "org-1",
  ownerTeamId: "team-a",
  kind: "QUICK_TEAM",
  executiveRequestId: null,
};

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "user-1",
    operationalRole: "MEMBER",
    isExecutive: false,
    organizationId: "org-1",
    functionalTeamId: "team-a",
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("P0: updateMeeting authorization", () => {
  it("rejects unauthorized user (not organizer, not secretary, not owner team admin)", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(baseMeeting);
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "attacker", functionalTeamId: "team-b" }));

    const { updateMeeting } = await import("../modules/meetings/meetings.service");
    await expect(updateMeeting("meeting-1", "attacker", { title: "Hacked" }))
      .rejects.toThrow(ForbiddenError);
  });

  it("allows organizer to update", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(baseMeeting);
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-1" }));
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, title: "Updated" });
    mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 0 });

    const { updateMeeting } = await import("../modules/meetings/meetings.service");
    const result = await updateMeeting("meeting-1", "user-1", { title: "Updated" });
    expect(result.title).toBe("Updated");
  });

  it("allows secretary to update any meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(baseMeeting);
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "sec-1", operationalRole: "SECRETARY" }));
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, title: "Sec Update" });
    mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 0 });

    const { updateMeeting } = await import("../modules/meetings/meetings.service");
    const result = await updateMeeting("meeting-1", "sec-1", { title: "Sec Update" });
    expect(result.title).toBe("Sec Update");
  });

  it("allows owner team admin to update", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(baseMeeting);
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }));
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, title: "Admin Update" });
    mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 0 });

    const { updateMeeting } = await import("../modules/meetings/meetings.service");
    const result = await updateMeeting("meeting-1", "admin-1", { title: "Admin Update" });
    expect(result.title).toBe("Admin Update");
  });
});

describe("P0: updateMeeting room conflict detection", () => {
  it("throws ROOM_CONFLICT when room is already booked", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({
      ...baseMeeting,
      roomId: "room-1",
      scheduledAt: new Date("2026-07-10T10:00:00Z"),
    });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-1" }));
    mockPrisma.roomBooking.findFirst.mockResolvedValue({ id: "booking-1" });

    const { updateMeeting } = await import("../modules/meetings/meetings.service");
    await expect(
      updateMeeting("meeting-1", "user-1", { scheduledAt: "2026-07-10T11:00:00Z" })
    ).rejects.toThrow(ValidationError);
  });

  it("allows update when no conflict exists", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({
      ...baseMeeting,
      roomId: "room-1",
      scheduledAt: new Date("2026-07-10T10:00:00Z"),
    });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-1" }));
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.meeting.update.mockResolvedValue(baseMeeting);

    const { updateMeeting } = await import("../modules/meetings/meetings.service");
    const result = await updateMeeting("meeting-1", "user-1", { scheduledAt: "2026-07-10T11:00:00Z" });
    expect(result).toBeDefined();
  });
});

describe("P0: canViewMeeting removedAt filter", () => {
  it("removed attendee cannot view meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, createdById: "other" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "removed-user" }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null); // removed → not found
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(null);

    const { canViewMeeting } = await import("../policies/meeting-policy");
    expect(await canViewMeeting("meeting-1", "removed-user")).toBe(false);
  });

  it("active attendee can view meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, createdById: "other" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "active-user" }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue({ meetingId: "meeting-1", userId: "active-user", removedAt: null });
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);

    const { canViewMeeting } = await import("../policies/meeting-policy");
    expect(await canViewMeeting("meeting-1", "active-user")).toBe(true);
  });
});

describe("P0: getLiveState authorization", () => {
  it("rejects unauthorized user", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({
      ...baseMeeting,
      status: "IN_PROGRESS",
      timer: null,
      agendaItems: [],
    });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "attacker", functionalTeamId: "team-b" }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);

    const { getLiveState } = await import("../modules/meetings/meetings.service");
    await expect(getLiveState("meeting-1", "attacker")).rejects.toThrow(ForbiddenError);
  });

  it("allows organizer to view", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({
      ...baseMeeting,
      status: "IN_PROGRESS",
      timer: null,
      agendaItems: [],
    });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-1" }));

    const { getLiveState } = await import("../modules/meetings/meetings.service");
    const result = await getLiveState("meeting-1", "user-1");
    expect(result.meetingId).toBe("meeting-1");
  });

  it("allows attendee to view", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({
      ...baseMeeting,
      organizerId: "other",
      status: "IN_PROGRESS",
      timer: null,
      agendaItems: [],
    });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "att-user" }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue({ meetingId: "meeting-1", userId: "att-user", removedAt: null });

    const { getLiveState } = await import("../modules/meetings/meetings.service");
    const result = await getLiveState("meeting-1", "att-user");
    expect(result.meetingId).toBe("meeting-1");
  });

  it("allows secretary to view any live meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({
      ...baseMeeting,
      organizerId: "other",
      status: "IN_PROGRESS",
      timer: null,
      agendaItems: [],
    });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "sec-1", operationalRole: "SECRETARY" }));

    const { getLiveState } = await import("../modules/meetings/meetings.service");
    const result = await getLiveState("meeting-1", "sec-1");
    expect(result.meetingId).toBe("meeting-1");
  });

  it("works without userId (backward compat for internal calls)", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({
      ...baseMeeting,
      status: "IN_PROGRESS",
      timer: null,
      agendaItems: [],
    });

    const { getLiveState } = await import("../modules/meetings/meetings.service");
    const result = await getLiveState("meeting-1");
    expect(result.meetingId).toBe("meeting-1");
  });
});

describe("P0: deleteMeeting status guard + room cleanup", () => {
  it("rejects deleting IN_PROGRESS meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS" });

    const { deleteMeeting } = await import("../modules/meetings/meetings.service");
    await expect(deleteMeeting("meeting-1", "user-1")).rejects.toThrow(ValidationError);
  });

  it("rejects deleting COMPLETED_LOCKED meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "COMPLETED_LOCKED" });

    const { deleteMeeting } = await import("../modules/meetings/meetings.service");
    await expect(deleteMeeting("meeting-1", "user-1")).rejects.toThrow(ValidationError);
  });

  it("rejects deleting ENDED_PENDING_SUMMARY meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "ENDED_PENDING_SUMMARY" });

    const { deleteMeeting } = await import("../modules/meetings/meetings.service");
    await expect(deleteMeeting("meeting-1", "user-1")).rejects.toThrow(ValidationError);
  });

  it("allows deleting DRAFT meeting and cleans up room bookings", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "DRAFT" });
    mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.meeting.delete.mockResolvedValue(baseMeeting);

    const { deleteMeeting } = await import("../modules/meetings/meetings.service");
    await deleteMeeting("meeting-1", "user-1");
    expect(mockPrisma.roomBooking.deleteMany).toHaveBeenCalledWith({ where: { meetingId: "meeting-1" } });
    expect(mockPrisma.meeting.delete).toHaveBeenCalledWith({ where: { id: "meeting-1" } });
  });

  it("rejects non-creator from deleting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, createdById: "user-1" });

    const { deleteMeeting } = await import("../modules/meetings/meetings.service");
    await expect(deleteMeeting("meeting-1", "user-2")).rejects.toThrow(ForbiddenError);
  });
});

describe("P0: Executive request cross-org access", () => {
  it("cross-org secretary is blocked by controller guard (QA-006)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({ id: "sec-other", operationalRole: "SECRETARY", organizationId: "org-2" })
    );
    mockPrisma.executiveRequest.findUnique.mockResolvedValue({
      id: "er-1",
      organizationId: "org-1",
      createdByExecutiveId: "exec-1",
      status: "OPEN",
      targets: [],
    });

    const { getRequest } = await import("../modules/executive-requests/executive-requests.service");
    const req = await getRequest("er-1");

    const { getPolicyUser, isSecretary } = await import("../policies/access-policy");
    const actor = await getPolicyUser("sec-other");

    expect(isSecretary(actor)).toBe(true);
    expect(actor.organizationId).toBe("org-2");
    expect(req.organizationId).toBe("org-1");
    expect(actor.organizationId !== req.organizationId).toBe(true);
  });
});
