import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, ValidationError } from "../common/errors/app-error";

const mockPrisma = vi.hoisted(() => ({
  meeting: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  functionalTeam: { findUnique: vi.fn() },
  room: { findUnique: vi.fn() },
  meetingTimer: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  meetingAttendee: { findUnique: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
  agendaItem: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  roomBooking: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  meetingNote: { findUnique: vi.fn(), create: vi.fn() },
  auditEvent: { create: vi.fn() },
  parkingLotItem: { findMany: vi.fn(), updateMany: vi.fn() },
  meetingJoinRequest: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

const baseOrgId = "org-1";
const baseMeeting = {
  id: "mtg-1",
  title: "Test",
  status: "IN_PROGRESS",
  plannedDurationSeconds: 1800,
  scheduledAt: new Date(),
  roomId: null,
  createdById: "user-1",
  organizerId: "user-1",
  organizationId: baseOrgId,
  ownerTeamId: "team-1",
  kind: "QUICK_TEAM",
  actualDurationSeconds: null,
};

describe("Phase 2g.1 — Auto-lock worker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("locks expired ENDED_PENDING_SUMMARY meetings", async () => {
    mockPrisma.meeting.updateMany.mockResolvedValue({ count: 2 });

    const { startAutoLockWorker, stopAutoLockWorker } = await import("../workers/auto-lock");
    const intervalId = startAutoLockWorker();
    await new Promise((r) => setTimeout(r, 50));
    stopAutoLockWorker();

    expect(mockPrisma.meeting.updateMany).toHaveBeenCalledWith({
      where: {
        status: "ENDED_PENDING_SUMMARY",
        summaryAutoLockedAt: { lte: expect.any(Date) },
      },
      data: {
        status: "COMPLETED_LOCKED",
        lockedAt: expect.any(Date),
      },
    });
  });
});

describe("Phase 2g.1 — Join request tightening", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects approval when meeting is not IN_PROGRESS", async () => {
    mockPrisma.meetingJoinRequest.findUnique.mockResolvedValue({
      id: "jr-1",
      meetingId: "mtg-1",
      requesterId: "user-2",
      status: "PENDING",
    });
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "ENDED_PENDING_SUMMARY" });

    const { reviewJoinRequest } = await import("../modules/meeting-join-requests/meeting-join-requests.service");
    await expect(reviewJoinRequest("jr-1", "mtg-1", "APPROVED", "organizer-1"))
      .rejects.toThrow(ValidationError);
  });

  it("allows approval during IN_PROGRESS", async () => {
    mockPrisma.meetingJoinRequest.findUnique.mockResolvedValue({
      id: "jr-2",
      meetingId: "mtg-1",
      requesterId: "user-2",
      status: "PENDING",
    });
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS" });
    mockPrisma.meetingJoinRequest.update.mockResolvedValue({ id: "jr-2", status: "APPROVED" });
    mockPrisma.meetingAttendee.upsert.mockResolvedValue({});

    const { reviewJoinRequest } = await import("../modules/meeting-join-requests/meeting-join-requests.service");
    const result = await reviewJoinRequest("jr-2", "mtg-1", "APPROVED", "organizer-1");
    expect(result.status).toBe("APPROVED");
  });
});

describe("Phase 2g.1 — Attendee notes lockdown", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only allows notes during IN_PROGRESS", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizationId: "org-1" });
    mockPrisma.meetingAttendee.findUnique.mockResolvedValue({ userId: "user-1" });
    mockPrisma.meetingNote.findUnique.mockResolvedValue(null);
    mockPrisma.meetingNote.create.mockResolvedValue({ id: "note-1", meetingId: "mtg-1", authorId: "user-1", content: "test", createdAt: new Date() });

    const { createNote } = await import("../modules/notes/entries.service");
    const result = await createNote("mtg-1", "user-1", { content: "test" });
    expect(result).toBeDefined();
  });

  it("only IN_PROGRESS meetings allow notes", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "SCHEDULED" });

    const { createNote } = await import("../modules/notes/entries.service");
    await expect(createNote("mtg-1", "user-1", { content: "hello" }))
      .rejects.toThrow(ValidationError);
  });

  it("only attendee or speaker can add notes", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS" });
    mockPrisma.meetingAttendee.findUnique.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);

    const { createNote } = await import("../modules/notes/entries.service");
    await expect(createNote("mtg-1", "non-attendee", { content: "test" }))
      .rejects.toThrow(ForbiddenError);
  });

  it("one note per user per meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS" });
    mockPrisma.meetingAttendee.findUnique.mockResolvedValue({ userId: "user-1" });
    mockPrisma.meetingNote.findUnique.mockResolvedValue({ id: "existing-note" });

    const { createNote } = await import("../modules/notes/entries.service");
    await expect(createNote("mtg-1", "user-1", { content: "dup" }))
      .rejects.toThrow(ValidationError);
  });

  it("no delete/deleteEntry throws", async () => {
    const { deleteEntry } = await import("../modules/notes/entries.service");
    await expect(deleteEntry("some-id")).rejects.toThrow(ValidationError);
  });
});

describe("Phase 3a — Meeting creation paths", () => {
  beforeEach(() => vi.clearAllMocks());

  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation((callback: any) => callback(mockPrisma));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", organizationId: baseOrgId, functionalTeamId: "team-1", operationalRole: "TEAM_ADMIN", isExecutive: false, isActive: true });
    mockPrisma.user.findMany.mockResolvedValue([{ id: "user-2", organizationId: baseOrgId, functionalTeamId: "team-1", isActive: true }]);
    mockPrisma.functionalTeam.findUnique.mockResolvedValue({ id: "team-1", organizationId: baseOrgId, isActive: true });
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([]);
  });

  it("QUICK_TEAM meeting created without agenda", async () => {
    mockPrisma.meeting.create.mockResolvedValue({ ...baseMeeting, kind: "QUICK_TEAM", id: "new-mtg" });

    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    const result = await createQuickMeeting("user-1", {
      title: "Quick standup",
      ownerTeamId: "team-1",
      plannedDurationSeconds: 900,
      organizationId: baseOrgId,
      locationType: "ONLINE",
      onlineLink: "https://meet.example.com/quick",
    });

    expect(result.kind).toBe("QUICK_TEAM");
    expect(mockPrisma.meeting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "QUICK_TEAM" }),
      })
    );
  });

  it("STRUCTURED meeting requires at least one agenda item", async () => {
    const { createStructuredMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createStructuredMeeting("user-1", {
      title: "Structured",
      ownerTeamId: "team-1",
      plannedDurationSeconds: 3600,
      organizationId: baseOrgId,
      locationType: "ONLINE",
      onlineLink: "https://meet.example.com/structured",
      agendaItems: [],
    })).rejects.toThrow(ValidationError);
  });

  it("STRUCTURED agenda total cannot exceed meeting duration", async () => {
    const { createStructuredMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createStructuredMeeting("user-1", {
      title: "Too long",
      ownerTeamId: "team-1",
      plannedDurationSeconds: 1800,
      organizationId: baseOrgId,
      agendaItems: [
        { title: "Intro", durationSeconds: 1200 },
        { title: "Deep dive", durationSeconds: 1200 },
      ],
    })).rejects.toThrow(ValidationError);
  });

  it("STRUCTURED meeting with valid agenda succeeds", async () => {
    mockPrisma.meeting.create.mockResolvedValue({ ...baseMeeting, kind: "STRUCTURED", id: "structured-mtg" });

    const { createStructuredMeeting } = await import("../modules/meetings/meetings.service");
    const result = await createStructuredMeeting("user-1", {
      title: "Structured review",
      ownerTeamId: "team-1",
      plannedDurationSeconds: 3600,
      organizationId: baseOrgId,
      locationType: "ONLINE",
      onlineLink: "https://meet.example.com/structured",
      agendaItems: [
        { title: "Intro", durationSeconds: 600, speakerIds: ["user-2"] },
        { title: "Deep dive", durationSeconds: 1800 },
      ],
    });

    expect(result.kind).toBe("STRUCTURED");
    expect(mockPrisma.meeting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "STRUCTURED" }),
      })
    );
  });

  it("STRUCTURED meeting links parking lot items at creation", async () => {
    mockPrisma.meeting.create.mockResolvedValue({ ...baseMeeting, kind: "STRUCTURED", id: "structured-mtg" });
    mockPrisma.meeting.create.mockImplementation(async ({ data }: any) => ({
      ...baseMeeting,
      id: "structured-mtg",
      kind: data.kind || "QUICK_TEAM",
    }));
    mockPrisma.parkingLotItem.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([
      { id: "pl-1", organizationId: baseOrgId, teamId: "team-1", status: "APPROVED", agendaMeetingId: null },
      { id: "pl-2", organizationId: baseOrgId, teamId: "team-1", status: "APPROVED", agendaMeetingId: null },
    ]);

    const { createStructuredMeeting } = await import("../modules/meetings/meetings.service");
    await createStructuredMeeting("user-1", {
      title: "With PL items",
      ownerTeamId: "team-1",
      plannedDurationSeconds: 3600,
      organizationId: baseOrgId,
      locationType: "ONLINE",
      onlineLink: "https://meet.example.com/parking",
      agendaItems: [{ title: "Intro", durationSeconds: 600 }],
      parkingLotItemIds: ["pl-1", "pl-2"],
    });

    expect(mockPrisma.parkingLotItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["pl-1", "pl-2"] }, status: "APPROVED", agendaMeetingId: null },
      data: { status: "USED_IN_AGENDA", agendaMeetingId: "structured-mtg" },
    });
  });
});
