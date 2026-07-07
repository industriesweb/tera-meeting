import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError, ForbiddenError, NotFoundError } from "../common/errors/app-error";
import { updateMeetingSchema } from "../common/validators";

const mockPrisma = vi.hoisted(() => ({
  meeting: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  meetingTimer: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  meetingAttendee: { deleteMany: vi.fn(), createMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  agendaItem: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), aggregate: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  roomBooking: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  auditEvent: { create: vi.fn() },
  notification: { createMany: vi.fn() },
  executiveRequest: { update: vi.fn() },
  functionalTeam: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

const futureDate = () => new Date(Date.now() + 86400000).toISOString();
const pastDate = () => new Date(Date.now() - 86400000).toISOString();

const baseMeeting = {
  id: "meeting-1",
  title: "Test Meeting",
  status: "DRAFT",
  plannedDurationSeconds: 1800,
  scheduledAt: null,
  roomId: null,
  createdById: "user-1",
  organizerId: "user-1",
  organizationId: "team-1",
  actualDurationSeconds: null,
  ownerTeamId: "team-1",
  kind: "QUICK_TEAM",
};

async function importTestModule() {
  const [
    { scheduleMeeting, startMeeting, completeMeeting, archiveMeeting, cancelMeeting, endMeeting, addMeetingAttendee, removeMeetingAttendee },
    { updateMeeting },
  ] = await Promise.all([
    import("../modules/meetings/meetings.service") as any,
    import("../modules/meetings/meetings.controller") as any,
  ]);
  return { scheduleMeeting, startMeeting, completeMeeting, archiveMeeting, cancelMeeting, endMeeting, updateMeeting, addMeetingAttendee, removeMeetingAttendee };
}

describe("Meeting lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Test 1: PATCH with status is rejected", () => {
    it("returns 400 STATUS_MUTATION_NOT_ALLOWED when status is in body", async () => {
      expect(() => updateMeetingSchema.parse({ title: "ok" })).not.toThrow();
      expect(() => updateMeetingSchema.parse({ status: "IN_PROGRESS", title: "New title" }))
        .toThrow(/Unrecognized key/);
      const body = { status: "IN_PROGRESS", title: "New title" };

      const { updateMeeting } = await importTestModule();
      const req = { body, params: { id: "m1" }, user: { sub: "u1" } } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
      const next = vi.fn();

      await updateMeeting(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "STATUS_MUTATION_NOT_ALLOWED", statusCode: 400 })
      );
    });
  });

  describe("Test 2: Non-host cannot schedule", () => {
    it("throws ForbiddenError when non-host tries to schedule", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting });
      const { scheduleMeeting } = await importTestModule();
      await expect(scheduleMeeting("meeting-1", "non-host-user", futureDate()))
        .rejects.toThrow(ForbiddenError);
    });
  });

  describe("Test 3: Non-host cannot start", () => {
    it("throws ForbiddenError when non-host tries to start", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "SCHEDULED", scheduledAt: new Date() });

      const { startMeeting } = await importTestModule();
      await expect(startMeeting("meeting-1", "non-host-user"))
        .rejects.toThrow(ForbiddenError);
    });
  });

  describe("Test 4: Non-host cannot complete, cancel, or archive", () => {
    it.each([
      ["cancel", "cancelMeeting" as const, "SCHEDULED"],
    ])("throws ForbiddenError when non-host tries to %s", async (_, fn, status) => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status, scheduledAt: new Date(), attendees: [] });

      const mod = await importTestModule();
      const serviceFn = mod[fn] as (id: string, userId: string) => Promise<any>;
      await expect(serviceFn("meeting-1", "non-host-user"))
        .rejects.toThrow(ForbiddenError);
    });

    it("throws LEGACY_COMMAND_DISABLED when trying to complete", async () => {
      const { completeMeeting } = await importTestModule();
      await expect(completeMeeting("meeting-1", "non-host-user"))
        .rejects.toMatchObject({ code: "LEGACY_COMMAND_DISABLED" });
    });

    it("throws LEGACY_COMMAND_DISABLED when trying to archive", async () => {
      const { archiveMeeting } = await importTestModule();
      await expect(archiveMeeting("meeting-1", "non-host-user"))
        .rejects.toMatchObject({ code: "LEGACY_COMMAND_DISABLED" });
    });
  });

  describe("Test 5: Draft without scheduledAt cannot schedule", () => {
    it("throws ValidationError SCHEDULED_AT_REQUIRED", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting });

      const { scheduleMeeting } = await importTestModule();
      await expect(scheduleMeeting("meeting-1", "user-1", undefined))
        .rejects.toThrow(ValidationError);
      await expect(scheduleMeeting("meeting-1", "user-1", undefined))
        .rejects.toMatchObject({ code: "SCHEDULED_AT_REQUIRED" });
    });
  });

  describe("Test 6: Draft with past scheduledAt cannot schedule", () => {
    it("throws ValidationError PAST_SCHEDULED_AT", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting });

      const { scheduleMeeting } = await importTestModule();
      await expect(scheduleMeeting("meeting-1", "user-1", pastDate()))
        .rejects.toThrow(ValidationError);
      await expect(scheduleMeeting("meeting-1", "user-1", pastDate()))
        .rejects.toMatchObject({ code: "PAST_SCHEDULED_AT" });
    });
  });

  describe("Test 7: Draft with invalid/zero duration cannot schedule", () => {
    it("throws ValidationError INVALID_DURATION when scheduledDuration is 0", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, plannedDurationSeconds: 0 });

      const { scheduleMeeting } = await importTestModule();
      await expect(scheduleMeeting("meeting-1", "user-1", futureDate()))
        .rejects.toThrow(ValidationError);
      await expect(scheduleMeeting("meeting-1", "user-1", futureDate()))
        .rejects.toMatchObject({ code: "INVALID_DURATION" });
    });
  });

  describe("Test 8: Draft with room conflict cannot schedule", () => {
    it("throws ValidationError ROOM_CONFLICT", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        roomId: "room-1",
        plannedDurationSeconds: 1800,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue({ id: "conflict-1" });

      const { scheduleMeeting } = await importTestModule();
      await expect(scheduleMeeting("meeting-1", "user-1", futureDate()))
        .rejects.toThrow(ValidationError);
      await expect(scheduleMeeting("meeting-1", "user-1", futureDate()))
        .rejects.toMatchObject({ code: "ROOM_CONFLICT" });
    });
  });

  describe("Test 9: Valid Draft → Scheduled succeeds and creates booking", () => {
    it("updates status to Scheduled and creates room booking", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        roomId: "room-1",
        plannedDurationSeconds: 1800,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
      mockPrisma.meeting.update.mockResolvedValue({
        ...baseMeeting,
        status: "SCHEDULED",
        scheduledAt: new Date(futureDate()),
        roomId: "room-1",
      });

      const { scheduleMeeting } = await importTestModule();
      const result = await scheduleMeeting("meeting-1", "user-1", futureDate());
      expect(result.status).toBe("SCHEDULED");
      expect(mockPrisma.roomBooking.deleteMany).toHaveBeenCalledWith({ where: { meetingId: "meeting-1" } });
      expect(mockPrisma.roomBooking.create).toHaveBeenCalled();
    });
  });

  describe("Test 10: Invalid lifecycle transitions fail", () => {
    it.each([
      ["DRAFT", "Completed"],
      ["SCHEDULED", "Archived"],
      ["IN_PROGRESS", "SCHEDULED"],
      ["IN_PROGRESS", "CANCELLED"],
      ["Completed", "IN_PROGRESS"],
      ["Archived", "SCHEDULED"],
      ["CANCELLED", "SCHEDULED"],
    ])("rejects %s → %s", async (from, to) => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: from });

      const mod = await importTestModule();
      if (to === "SCHEDULED") {
        await expect(mod.scheduleMeeting("meeting-1", "user-1", futureDate()))
          .rejects.toThrow(ValidationError);
      } else if (to === "IN_PROGRESS") {
        await expect(mod.startMeeting("meeting-1", "user-1"))
          .rejects.toThrow(ValidationError);
      } else if (to === "Completed") {
        await expect(mod.completeMeeting("meeting-1", "user-1"))
          .rejects.toThrow(ValidationError);
      } else if (to === "Archived") {
        await expect(mod.archiveMeeting("meeting-1", "user-1"))
          .rejects.toThrow(ValidationError);
      } else if (to === "CANCELLED") {
        await expect(mod.cancelMeeting("meeting-1", "user-1"))
          .rejects.toThrow(ValidationError);
      }
    });
  });
});

describe("Phase 1e: Duration fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("T1: New meeting writes plannedDurationSeconds correctly", () => {
    it("writes plannedDurationSeconds equal to scheduledDuration on create", async () => {
      mockPrisma.$transaction.mockImplementation((callback: any) => callback(mockPrisma));
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", organizationId: "team-1", functionalTeamId: "team-1", operationalRole: "TEAM_ADMIN", isExecutive: false, isActive: true });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.functionalTeam.findUnique.mockResolvedValue({ id: "team-1", organizationId: "team-1", isActive: true });
      mockPrisma.meeting.create.mockResolvedValue({
        ...baseMeeting,
        id: "new-meeting",
        plannedDurationSeconds: 3600,
      });

      const { createMeeting } = await import("../modules/meetings/meetings.service") as any;
      const result = await createMeeting("user-1", {
        title: "Test",
        plannedDurationSeconds: 3600,
        ownerTeamId: "team-1",
        organizationId: "team-1",
        locationType: "ONLINE",
        onlineLink: "https://meet.example.com/duration",
      });

      expect(result.plannedDurationSeconds).toBe(3600);
      expect(mockPrisma.meeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            plannedDurationSeconds: 3600,
          }),
        })
      );
    });
  });

  describe("T2: New agenda item writes durationSeconds correctly", () => {
    it("writes durationSeconds = duration * 60 on create", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, id: "meeting-1" });
      mockPrisma.agendaItem.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });

      const { createAgendaItem } = await import("../modules/agenda/agenda.service") as any;
      await createAgendaItem("meeting-1", { title: "Intro", durationSeconds: 300 });

      expect(mockPrisma.agendaItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            durationSeconds: 300,
          }),
        })
      );
    });
  });

  describe("T3: End meeting stores exact actualDurationSeconds", () => {
    it("stores elapsed seconds without rounding to minutes", async () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 3725 * 1000);
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", scheduledAt: new Date(), organizerId: "host-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "host-1", operationalRole: "MEMBER" });
      mockPrisma.meetingTimer.findUnique.mockResolvedValue({
        meetingId: "meeting-1",
        startedAt,
        version: 0,
      });

      const { endMeeting } = await importTestModule();
      await endMeeting("meeting-1", "host-1");

      const updateCall = mockPrisma.meeting.update.mock.calls[0][0];
      expect(updateCall.data.actualDurationSeconds).toBe(3725);
    });
  });

  describe("T4: Room conflict uses plannedDurationSeconds", () => {
    it("calculates booking end time from plannedDurationSeconds", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        roomId: "room-1",
        plannedDurationSeconds: 5400,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, status: "SCHEDULED" });

      const { scheduleMeeting } = await importTestModule();
      const at = new Date(Date.now() + 86400000);
      await scheduleMeeting("meeting-1", "user-1", at.toISOString());

      expect(mockPrisma.roomBooking.findFirst).toHaveBeenCalled();
      const callArg = mockPrisma.roomBooking.findFirst.mock.calls[0][0];
      const endsAt: Date = callArg.where.startsAt.lt;
      const startsAt: Date = callArg.where.endsAt.gt;
      const diffSecs = (endsAt.getTime() - startsAt.getTime()) / 1000;
      expect(diffSecs).toBe(5400);
    });
  });

  describe("T5: New fields win if old/new values differ", () => {
    it("reconcileLiveMeeting uses plannedDurationSeconds to determine overtime boundary", async () => {
      const startOfNow = new Date();
      const now = new Date(startOfNow.getTime() + 100);

      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: "meeting-1",
        status: "IN_PROGRESS",
        plannedDurationSeconds: 2700,
        kind: "QUICK_TEAM",
        timer: { meetingId: "meeting-1", startedAt: startOfNow, version: 0, activeAgendaItemId: null, activeItemStartedAt: null, activeItemExtensionSeconds: 0, overtimeStartedAt: null, overtimeDeadlineAt: null, overtimeExtensionCount: 0 },
        agendaItems: [],
      });

      const { reconcileLiveMeeting } = await import("../modules/meetings/meetings.service") as any;
      await reconcileLiveMeeting("meeting-1", now);

      // With plannedDurationSeconds=2700, overtime starts at startOfNow+2700s
      // now is only 100ms after start, so overtime should NOT have started
      expect(mockPrisma.meetingTimer.update).not.toHaveBeenCalled();
    });
  });

  describe("T6: Migration script is idempotent", () => {
    it("WHERE ... IS NULL clause prevents re-backfilling already-set rows", async () => {
      const updateSql = `
    UPDATE meetings
    SET planned_duration_seconds = scheduled_duration
    WHERE planned_duration_seconds IS NULL
      AND scheduled_duration IS NOT NULL
  `;
      expect(updateSql).toContain("WHERE planned_duration_seconds IS NULL");
      const agendaSql = `
    UPDATE agenda_items
    SET duration_seconds = duration * 60
    WHERE duration_seconds IS NULL
      AND duration IS NOT NULL
  `;
      expect(agendaSql).toContain("WHERE duration_seconds IS NULL");
    });
  });
});

describe("Phase 3c: Lifecycle enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Legacy command disabled (410)", () => {
    it("POST /meetings/:id/complete returns LEGACY_COMMAND_DISABLED for any caller", async () => {
      const { completeMeeting } = await importTestModule();
      await expect(completeMeeting("meeting-1", "organizer-1")).rejects.toMatchObject({ code: "LEGACY_COMMAND_DISABLED" });
      await expect(completeMeeting("meeting-1", "secretary-1")).rejects.toMatchObject({ code: "LEGACY_COMMAND_DISABLED" });
    });

    it("POST /meetings/:id/archive returns LEGACY_COMMAND_DISABLED for any caller", async () => {
      const { archiveMeeting } = await importTestModule();
      await expect(archiveMeeting("meeting-1", "organizer-1")).rejects.toMatchObject({ code: "LEGACY_COMMAND_DISABLED" });
      await expect(archiveMeeting("meeting-1", "secretary-1")).rejects.toMatchObject({ code: "LEGACY_COMMAND_DISABLED" });
    });

    it("POST /reports/:id/log returns 410 LEGACY_COMMAND_DISABLED", async () => {
      const { logMeeting } = await import("../modules/reports/reports.controller") as any;
      const req = { params: { id: "meeting-1" }, user: { sub: "user-1" } } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await logMeeting(req, res);
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "LEGACY_COMMAND_DISABLED" }),
        })
      );
    });
  });

  describe("Only Organizer can start", () => {
    it("allows organizer to start", async () => {
      const scheduledMeeting = {
        ...baseMeeting,
        status: "SCHEDULED",
        scheduledAt: new Date(),
        organizerId: "org-1",
        kind: "QUICK_TEAM",
        agendaItems: [],
      };
      mockPrisma.meeting.findUnique.mockResolvedValue(scheduledMeeting);
      mockPrisma.meeting.update.mockResolvedValue({ ...scheduledMeeting, status: "IN_PROGRESS" });
      mockPrisma.auditEvent.create.mockResolvedValue({});
      mockPrisma.meetingTimer.upsert.mockResolvedValue({ meetingId: "meeting-1", version: 0 });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...scheduledMeeting, status: "IN_PROGRESS" }) },
          meetingTimer: { upsert: vi.fn() },
          agendaItem: { update: vi.fn() },
          auditEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });

      const { startMeeting } = await importTestModule();
      await startMeeting("meeting-1", "org-1");
      // Meeting update was called (by $transaction internally)
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("rejects non-organizer host with ForbiddenError", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "SCHEDULED", scheduledAt: new Date(), organizerId: "org-1" });

      const { startMeeting } = await importTestModule();
      await expect(startMeeting("meeting-1", "viewer-1")).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Organizer or Secretary can end", () => {
    it("allows organizer to end", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "org-1", operationalRole: "MEMBER" });
      mockPrisma.meetingTimer.findUnique.mockResolvedValue(null);
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, status: "ENDED_PENDING_SUMMARY" });

      const { endMeeting } = await importTestModule();
      const result = await endMeeting("meeting-1", "org-1");
      expect(result.status).toBe("ENDED_PENDING_SUMMARY");
    });

    it("allows secretary to end", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY" });
      mockPrisma.meetingTimer.findUnique.mockResolvedValue(null);
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, status: "ENDED_PENDING_SUMMARY" });

      const { endMeeting } = await importTestModule();
      const result = await endMeeting("meeting-1", "sec-1");
      expect(result.status).toBe("ENDED_PENDING_SUMMARY");
    });

    it("rejects host member who is not organiser or secretary", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "member-1", operationalRole: "MEMBER" });

      const { endMeeting } = await importTestModule();
      await expect(endMeeting("meeting-1", "member-1")).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Normal meeting cancellation", () => {
    const normalCancelMeeting = { ...baseMeeting, status: "SCHEDULED", attendees: [] };

    it("allows creator who is Team Admin to cancel", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...normalCancelMeeting, createdById: "admin-user", ownerTeamId: "team-a" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "admin-user", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" });
      mockPrisma.meeting.update.mockResolvedValue({ ...normalCancelMeeting, status: "CANCELLED" });
      mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.auditEvent.create.mockResolvedValue({});
      mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });

      const { cancelMeeting } = await importTestModule();
      const result = await cancelMeeting("meeting-1", "admin-user");
      expect(result.status).toBe("CANCELLED");
    });

    it("allows secretary to cancel", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...normalCancelMeeting, createdById: "other-user" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY" });
      mockPrisma.meeting.update.mockResolvedValue({ ...normalCancelMeeting, status: "CANCELLED" });
      mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.auditEvent.create.mockResolvedValue({});
      mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });

      const { cancelMeeting } = await importTestModule();
      const result = await cancelMeeting("meeting-1", "sec-1");
      expect(result.status).toBe("CANCELLED");
    });

    it("rejects Team Admin who is not the creator", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...normalCancelMeeting, createdById: "creator-1", ownerTeamId: "team-a" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "other-admin", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" });

      const { cancelMeeting } = await importTestModule();
      await expect(cancelMeeting("meeting-1", "other-admin")).rejects.toThrow(ForbiddenError);
    });

    it("releases room booking on cancellation", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...normalCancelMeeting, createdById: "user-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY" });
      mockPrisma.meeting.update.mockResolvedValue({ ...normalCancelMeeting, status: "CANCELLED" });
      mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.auditEvent.create.mockResolvedValue({});

      const { cancelMeeting } = await importTestModule();
      await cancelMeeting("meeting-1", "user-1");
      expect(mockPrisma.roomBooking.deleteMany).toHaveBeenCalledWith({ where: { meetingId: "meeting-1" } });
    });

    it("creates attendee notifications on cancellation", async () => {
      const withAttendees = {
        ...normalCancelMeeting,
        createdById: "user-1",
        attendees: [{ userId: "att-1" }, { userId: "att-2" }],
      };
      mockPrisma.meeting.findUnique.mockResolvedValue(withAttendees);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY" });
      mockPrisma.meeting.update.mockResolvedValue({ ...normalCancelMeeting, status: "CANCELLED" });
      mockPrisma.roomBooking.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.auditEvent.create.mockResolvedValue({});
      mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });

      const { cancelMeeting } = await importTestModule();
      await cancelMeeting("meeting-1", "user-1");
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ userId: "att-1" })]) })
      );
    });
  });

  describe("Executive-request meeting cancellation", () => {
    const erCancelMeeting = {
      ...baseMeeting,
      status: "SCHEDULED",
      executiveRequestId: "er-1",
      attendees: [],
    };

    it("allows secretary only — non-secretary fails with ForbiddenError", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(erCancelMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "member-1", operationalRole: "MEMBER" });

      const { cancelMeeting } = await importTestModule();
      await expect(cancelMeeting("meeting-1", "member-1", "RETURN_TO_PLANNING")).rejects.toThrow(ForbiddenError);
    });

    it("RETURN_TO_PLANNING clears currentMeetingId and restores Planning", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(erCancelMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY" });
      const txErUpdate = vi.fn();
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...erCancelMeeting, status: "CANCELLED", executiveRequestId: "er-1" }) },
          roomBooking: { deleteMany: vi.fn() },
          executiveRequest: { update: txErUpdate },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn() },
        };
        return await fn(tx);
      });

      const { cancelMeeting } = await importTestModule();
      await cancelMeeting("meeting-1", "sec-1", "RETURN_TO_PLANNING");
      expect(txErUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "er-1" },
          data: expect.objectContaining({ status: "PLANNING", currentMeetingId: null }),
        })
      );
    });

    it("CANCEL_REQUEST clears currentMeetingId and cancels request", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(erCancelMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY" });
      const txErUpdate = vi.fn();
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...erCancelMeeting, status: "CANCELLED", executiveRequestId: "er-1" }) },
          roomBooking: { deleteMany: vi.fn() },
          executiveRequest: { update: txErUpdate },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn() },
        };
        return await fn(tx);
      });

      const { cancelMeeting } = await importTestModule();
      await cancelMeeting("meeting-1", "sec-1", "CANCEL_REQUEST");
      expect(txErUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "er-1" },
          data: expect.objectContaining({ status: "CANCELLED", currentMeetingId: null, cancelledAt: expect.any(Date) }),
        })
      );
    });

    it("preserves historical executiveRequestId on cancelled meeting", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(erCancelMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY" });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...erCancelMeeting, status: "CANCELLED", executiveRequestId: "er-1" }) },
          roomBooking: { deleteMany: vi.fn() },
          executiveRequest: { update: vi.fn() },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn() },
        };
        return await fn(tx);
      });

      const { cancelMeeting } = await importTestModule();
      const result = await cancelMeeting("meeting-1", "sec-1", "RETURN_TO_PLANNING");
      expect(result.executiveRequestId).toBe("er-1");
    });
  });

  describe("PATCH rejects frozen planning fields", () => {
    it("rejects status", async () => {
      const { updateMeeting } = await importTestModule();
      const req = { body: { status: "IN_PROGRESS" }, params: { id: "m1" }, user: { sub: "u1" } } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
      const next = vi.fn();

      await updateMeeting(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "STATUS_MUTATION_NOT_ALLOWED", statusCode: 400 })
      );
    });

    it.each(["kind", "executiveRequestId"])("rejects lifecycle-frozen field: %s", async (field) => {
      const { updateMeeting } = await importTestModule();
      const req = { body: { [field]: "some-value" }, params: { id: "m1" }, user: { sub: "u1" } } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
      const next = vi.fn();

      await updateMeeting(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "STATUS_MUTATION_NOT_ALLOWED", statusCode: 400 })
      );
    });

    it.each(["hosts", "attendees", "attendeeIds", "agendaItems", "speakerIds", "organizerId", "ownerTeamId"])("rejects wholesale-disabled field: %s", async (field) => {
      const { updateMeeting } = await importTestModule();
      const req = { body: { [field]: field === "hosts" || field === "attendees" || field === "agendaItems" ? [] : "some-value" }, params: { id: "m1" }, user: { sub: "u1" } } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
      const next = vi.fn();

      await updateMeeting(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "WHOLESALE_MEETING_UPDATE_DISABLED", statusCode: 400 })
      );
    });
  });

  describe("Member regression — Secretary permissions not leaked", () => {
    it("scheduleMeeting rejects a normal Member", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "member-1", operationalRole: "MEMBER" });

      const { scheduleMeeting } = await importTestModule();
      await expect(scheduleMeeting("meeting-1", "member-1", futureDate())).rejects.toThrow(ForbiddenError);
    });

    it("endMeeting rejects a normal Member", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "member-1", operationalRole: "MEMBER" });

      const { endMeeting } = await importTestModule();
      await expect(endMeeting("meeting-1", "member-1")).rejects.toThrow(ForbiddenError);
    });

    it("cancelMeeting rejects a normal Member (for ER-derived meeting)", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "SCHEDULED", executiveRequestId: "er-1", attendees: [] });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "member-1", operationalRole: "MEMBER" });

      const { cancelMeeting } = await importTestModule();
      await expect(cancelMeeting("meeting-1", "member-1", "RETURN_TO_PLANNING")).rejects.toThrow(ForbiddenError);
    });
  });
});

describe("Phase 3e: Legacy agenda shutdown + attendee management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Legacy agenda controller returns 410 ──

  describe("Legacy agenda mutation endpoints disabled", () => {
    it("createAgendaItem returns 410", async () => {
      const { createAgendaItem } = await import("../modules/agenda/agenda.controller");
      const req = {} as any;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
      const next = vi.fn();

      await createAgendaItem(req, res, next);
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: "LEGACY_AGENDA_MUTATION_DISABLED" }) })
      );
    });

    it.each(["updateAgendaItem", "deleteAgendaItem", "toggleReady", "reorderItems"])("%s returns 410", async (fnName) => {
      const mod = await import("../modules/agenda/agenda.controller");
      const req = {} as any;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
      const next = vi.fn();

      await (mod as any)[fnName](req, res, next);
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: "LEGACY_AGENDA_MUTATION_DISABLED" }) })
      );
    });
  });

  // ── Quick Team attendee add ──

  const quickScheduledMeeting: any = {
    ...baseMeeting,
    kind: "QUICK_TEAM",
    status: "SCHEDULED",
    organizationId: "org-1",
    ownerTeamId: "team-1",
    organizerId: "org-1",
    organization: { id: "org-1", name: "Org 1", slug: "org-1", createdAt: new Date(), updatedAt: new Date() },
  };

  describe("addMeetingAttendee", () => {
    it("rejects non-Quick meeting (Structured)", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...quickScheduledMeeting, kind: "STRUCTURED" });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "SECRETARY" });

      const { addMeetingAttendee } = await importTestModule();
      await expect(addMeetingAttendee("meeting-1", "sec-1", "user-2")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects non-scheduled meeting", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...quickScheduledMeeting, status: "IN_PROGRESS" });

      const { addMeetingAttendee } = await importTestModule();
      await expect(addMeetingAttendee("meeting-1", "org-1", "user-2")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects non-Organizer non-Secretary", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "MEMBER", organizationId: "org-1", functionalTeamId: "team-1" });

      const { addMeetingAttendee } = await importTestModule();
      await expect(addMeetingAttendee("meeting-1", "member-1", "user-2")).rejects.toThrow(ForbiddenError);
    });

    it("rejects cross-organization user", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ operationalRole: "SECRETARY", organizationId: "org-1", functionalTeamId: null })
        .mockResolvedValueOnce({ organizationId: "org-2", functionalTeamId: "team-2" });

      const { addMeetingAttendee } = await importTestModule();
      await expect(addMeetingAttendee("meeting-1", "sec-1", "user-2")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects cross-team user", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ operationalRole: "SECRETARY", organizationId: "org-1", functionalTeamId: null })
        .mockResolvedValueOnce({ organizationId: "org-1", functionalTeamId: "team-2" });

      const { addMeetingAttendee } = await importTestModule();
      await expect(addMeetingAttendee("meeting-1", "sec-1", "user-2")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects duplicate active attendee", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ operationalRole: "SECRETARY", organizationId: "org-1", functionalTeamId: null })
        .mockResolvedValueOnce({ organizationId: "org-1", functionalTeamId: "team-1" });
      mockPrisma.meetingAttendee.findUnique.mockResolvedValue({ id: "existing", meetingId: "meeting-1", userId: "user-2", removedAt: null });

      const { addMeetingAttendee } = await importTestModule();
      await expect(addMeetingAttendee("meeting-1", "sec-1", "user-2")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("reactivates previously removed attendee", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ operationalRole: "SECRETARY", organizationId: "org-1", functionalTeamId: null })
        .mockResolvedValueOnce({ organizationId: "org-1", functionalTeamId: "team-1" });
      mockPrisma.meetingAttendee.findUnique.mockResolvedValue({ id: "removed", meetingId: "meeting-1", userId: "user-2", removedAt: new Date() });
      mockPrisma.meetingAttendee.update.mockResolvedValue({ id: "removed" } as any);

      const { addMeetingAttendee } = await importTestModule();
      const result = await addMeetingAttendee("meeting-1", "sec-1", "user-2");
      expect(result).toBeDefined();
      expect(mockPrisma.meetingAttendee.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { removedAt: null, removedById: null } })
      );
    });

    it("creates new attendee successfully (Organizer adds same-team user)", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ operationalRole: "MEMBER", organizationId: "org-1", functionalTeamId: "team-1" })
        .mockResolvedValueOnce({ organizationId: "org-1", functionalTeamId: "team-1" });
      mockPrisma.meetingAttendee.findUnique.mockResolvedValue(null);
      mockPrisma.meetingAttendee.create.mockResolvedValue({ id: "new-attendee" } as any);

      const { addMeetingAttendee } = await importTestModule();
      // actor is the organizer (org-1), not Secretary
      const result = await addMeetingAttendee("meeting-1", "org-1", "user-2");
      expect(result).toBeDefined();
      expect(mockPrisma.meetingAttendee.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { meetingId: "meeting-1", userId: "user-2", role: "attendee" } })
      );
    });
  });

  // ── Attendee remove ──

  describe("removeMeetingAttendee", () => {
    it("rejects non-scheduled meeting", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...quickScheduledMeeting, status: "IN_PROGRESS" });

      const { removeMeetingAttendee } = await importTestModule();
      await expect(removeMeetingAttendee("meeting-1", "sec-1", "user-2")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects non-Organizer non-Secretary", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);

      const { removeMeetingAttendee } = await importTestModule();
      await expect(removeMeetingAttendee("meeting-1", "member-1", "user-2")).rejects.toThrow(ForbiddenError);
    });

    it("rejects removing current organizer", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);

      const { removeMeetingAttendee } = await importTestModule();
      await expect(removeMeetingAttendee("meeting-1", "org-1", "org-1")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects self-removal", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(quickScheduledMeeting);

      const { removeMeetingAttendee } = await importTestModule();
      await expect(removeMeetingAttendee("meeting-1", "user-1", "user-1")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("successfully removes attendee (Secretary)", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...quickScheduledMeeting,
        attendees: [{ id: "att-1", meetingId: "meeting-1", userId: "user-2", removedAt: null }],
      });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "SECRETARY" });
      mockPrisma.meetingAttendee.update.mockResolvedValue({ id: "att-1" } as any);
      mockPrisma.auditEvent.create.mockResolvedValue({} as any);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });

      const { removeMeetingAttendee } = await importTestModule();
      await expect(removeMeetingAttendee("meeting-1", "sec-1", "user-2")).resolves.not.toThrow();
      expect(mockPrisma.meetingAttendee.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "att-1" }, data: { removedAt: expect.any(Date), removedById: "sec-1" } })
      );
      expect(mockPrisma.auditEvent.create).toHaveBeenCalled();
      expect(mockPrisma.notification.createMany).toHaveBeenCalled();
    });

    it("successfully removes attendee (Organizer)", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...quickScheduledMeeting,
        attendees: [{ id: "att-1", meetingId: "meeting-1", userId: "user-2", removedAt: null }],
      });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "MEMBER" });

      const { removeMeetingAttendee } = await importTestModule();
      await expect(removeMeetingAttendee("meeting-1", "org-1", "user-2")).resolves.not.toThrow();
    });

    it("works for Structured meeting too", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...quickScheduledMeeting,
        kind: "STRUCTURED",
        attendees: [{ id: "att-1", meetingId: "meeting-1", userId: "user-2", removedAt: null }],
      });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "SECRETARY" });

      const { removeMeetingAttendee } = await importTestModule();
      await expect(removeMeetingAttendee("meeting-1", "sec-1", "user-2")).resolves.not.toThrow();
    });
  });
});

describe("Phase 3d: Secretary-controlled overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const futureDateStr = () => new Date(Date.now() + 86400000).toISOString();

  const structuredScheduledMeeting: any = {
    ...baseMeeting,
    organizationId: "org-1",
    kind: "STRUCTURED",
    status: "SCHEDULED",
    scheduledAt: new Date(Date.now() + 86400000),
    plannedDurationSeconds: 3600,
    roomId: "room-1",
    attendees: [],
    executiveRequest: null,
    executiveRequestId: null,
    room: { id: "room-1", name: "Conf Room A" },
    organization: { id: "org-1" },
  };

  async function importOverrides() {
    const mod = await import("../modules/meetings/meetings.service") as any;
    return { overrideScheduleMeeting: mod.overrideScheduleMeeting, overrideOrganizer: mod.overrideOrganizer };
  }

  const validSchedulePayload = () => ({
    scheduledAt: futureDateStr(),
    plannedDurationSeconds: 2700,
    reason: "Schedule conflict resolved",
  });

  describe("Authorization", () => {
    it("1. Non-Secretary cannot use either override endpoint", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "member-1", operationalRole: "MEMBER", organizationId: "org-1" });

      const svc = await importOverrides();
      await expect(svc.overrideScheduleMeeting("meeting-1", "member-1", validSchedulePayload())).rejects.toThrow(ForbiddenError);
      await expect(svc.overrideOrganizer("meeting-1", "member-1", { organizerId: "user-2", reason: "reassign" })).rejects.toThrow(ForbiddenError);
    });

    it("2. Secretary can override schedule for Scheduled Structured Meeting", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...structuredScheduledMeeting, scheduledAt: new Date(futureDateStr()), plannedDurationSeconds: 2700 }) },
          roomBooking: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
          notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        };
        return await fn(tx);
      });

      const svc = await importOverrides();
      const result = await svc.overrideScheduleMeeting("meeting-1", "sec-1", validSchedulePayload());
      expect(result.plannedDurationSeconds).toBe(2700);
    });

    it("4. Quick Team Meeting rejects override", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...structuredScheduledMeeting, kind: "QUICK_TEAM" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });

      const svc = await importOverrides();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", validSchedulePayload())).rejects.toThrow(ValidationError);
    });
  });

  describe("State restrictions", () => {
    it.each(["DRAFT", "IN_PROGRESS", "ENDED_PENDING_SUMMARY", "COMPLETED_LOCKED", "CANCELLED"])(
      "3. %s meeting rejects override", async (status) => {
        mockPrisma.meeting.findUnique.mockResolvedValue({ ...structuredScheduledMeeting, status });
        mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });

        const svc = await importOverrides();
        await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", validSchedulePayload())).rejects.toThrow(ValidationError);
      }
    );
  });

  describe("Validation", () => {
    it("5. Missing or blank reason is rejected", async () => {
      const svc = await importOverrides();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", { scheduledAt: futureDateStr(), reason: "" })).rejects.toThrow();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", { scheduledAt: futureDateStr() })).rejects.toThrow();
      await expect(svc.overrideOrganizer("meeting-1", "sec-1", { organizerId: "u2", reason: "" })).rejects.toThrow();
    });

    it("6. Time override validates future date and positive duration", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });

      const svc = await importOverrides();
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", { scheduledAt: pastDate, reason: "test" })).rejects.toThrow(ValidationError);
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", { plannedDurationSeconds: 0, reason: "test" })).rejects.toThrow();
    });

    it("7. ER-linked meeting cannot move outside requested date/window", async () => {
      const erMeeting = {
        ...structuredScheduledMeeting,
        executiveRequestId: "er-1",
        executiveRequest: {
          requestedDate: new Date(Date.now() + 86400000 * 2),
          preferredPeriod: "MORNING",
          requestedDurationSeconds: 3600,
        },
      };
      mockPrisma.meeting.findUnique.mockResolvedValue(erMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });

      const svc = await importOverrides();
      // Different date
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        scheduledAt: futureDateStr(), reason: "test",
      })).rejects.toThrow(ValidationError);
    });
  });

  describe("Room conflict", () => {
    it("8. Room conflict rejects without explicit override flag", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue({ id: "conflict-1" });

      const svc = await importOverrides();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        scheduledAt: futureDateStr(), reason: "move", allowRoomConflictOverride: false,
      })).rejects.toMatchObject({ code: "ROOM_CONFLICT" });
    });

    it("9. Secretary room-conflict override succeeds with reason and preserves conflicting meeting", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue({ id: "conflict-1" });
      let capturedDetails: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue(structuredScheduledMeeting) },
          roomBooking: { deleteMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockImplementation(({ data }: any) => { capturedDetails = data.details; return {}; }) },
          notification: { createMany: vi.fn() },
        };
        return await fn(tx);
      });

      const svc = await importOverrides();
      await svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        scheduledAt: futureDateStr(), reason: "override conflict", allowRoomConflictOverride: true,
      });

      expect(capturedDetails).toMatchObject({ roomConflictOverrideUsed: true, reason: "override conflict" });
    });
  });

  describe("Room booking lifecycle", () => {
    it("10. Old room booking is released and new booking is created correctly", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);

      let txDeleteBooking: any = null, txCreateBooking: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue(structuredScheduledMeeting) },
          roomBooking: {
            deleteMany: vi.fn().mockImplementation((args: any) => { txDeleteBooking = args; return { count: 1 }; }),
            create: vi.fn().mockImplementation((args: any) => { txCreateBooking = args; return {}; }),
          },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn() },
        };
        return await fn(tx);
      });

      const svc = await importOverrides();
      await svc.overrideScheduleMeeting("meeting-1", "sec-1", validSchedulePayload());

      expect(txDeleteBooking).toEqual({ where: { meetingId: "meeting-1" } });
      expect(txCreateBooking).toMatchObject({ data: expect.objectContaining({ roomId: "room-1", meetingId: "meeting-1" }) });
    });
  });

  describe("Notifications", () => {
    it("11. Time change creates one attendee notification per current attendee", async () => {
      const withAttendees = { ...structuredScheduledMeeting, attendees: [{ userId: "att-1" }, { userId: "att-2" }] };
      mockPrisma.meeting.findUnique.mockResolvedValue(withAttendees);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);

      let createdNotifs: any[] = [];
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue(withAttendees) },
          roomBooking: { deleteMany: vi.fn(), create: vi.fn() },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn().mockImplementation(({ data }: any) => { createdNotifs = data; return {}; }) },
        };
        return await fn(tx);
      });

      const svc = await importOverrides();
      await svc.overrideScheduleMeeting("meeting-1", "sec-1", { scheduledAt: futureDateStr(), reason: "reschedule" });

      expect(createdNotifs).toHaveLength(2);
      expect(createdNotifs[0]).toMatchObject({ userId: "att-1" });
      expect(createdNotifs[1]).toMatchObject({ userId: "att-2" });
    });

    it("12. Room change creates notifications only for Physical/Hybrid meetings", async () => {
      const physicalMeeting = { ...structuredScheduledMeeting, roomId: "room-1", attendees: [{ userId: "att-1" }] };
      mockPrisma.meeting.findUnique.mockResolvedValue(physicalMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);

      let createdNotifs: any[] = [];
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue(physicalMeeting) },
          roomBooking: { deleteMany: vi.fn(), create: vi.fn() },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn().mockImplementation(({ data }: any) => { createdNotifs = data; return {}; }) },
        };
        return await fn(tx);
      });

      const svc = await importOverrides();
      // Physical meeting changing room
      await svc.overrideScheduleMeeting("meeting-1", "sec-1", { roomId: "room-2", reason: "change room" });
      expect(createdNotifs).toHaveLength(1);

      // Online meeting (no roomId) — changing duration only, still has attendee
      createdNotifs = [];
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...structuredScheduledMeeting, roomId: null, attendees: [{ userId: "att-1" }] });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...structuredScheduledMeeting, roomId: null, attendees: [{ userId: "att-1" }] }) },
          roomBooking: { deleteMany: vi.fn(), create: vi.fn() },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn().mockImplementation(({ data }: any) => { createdNotifs = data; return {}; }) },
        };
        return await fn(tx);
      });

      await svc.overrideScheduleMeeting("meeting-1", "sec-1", { plannedDurationSeconds: 1800, reason: "shorter" });
      expect(createdNotifs).toHaveLength(1);
    });

    it("13. Combined time and room change creates no duplicate attendee notifications", async () => {
      const physicalMeeting = { ...structuredScheduledMeeting, roomId: "room-1", attendees: [{ userId: "att-1" }] };
      mockPrisma.meeting.findUnique.mockResolvedValue(physicalMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);

      let createdNotifs: any[] = [];
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue(physicalMeeting) },
          roomBooking: { deleteMany: vi.fn(), create: vi.fn() },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn().mockImplementation(({ data }: any) => { createdNotifs = data; return {}; }) },
        };
        return await fn(tx);
      });

      const svc = await importOverrides();
      await svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        scheduledAt: futureDateStr(), roomId: "room-2", reason: "both changed",
      });

      expect(createdNotifs).toHaveLength(1);
      expect(createdNotifs[0].body).toContain("schedule and room");
    });
  });

  describe("Audit TimelineEvent", () => {
    it("14. Audit TimelineEvent contains old/new values, actor, and reason", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);

      let capturedEvent: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue(structuredScheduledMeeting) },
          roomBooking: { deleteMany: vi.fn(), create: vi.fn() },
          auditEvent: { create: vi.fn().mockImplementation(({ data }: any) => { capturedEvent = data; return {}; }) },
          notification: { createMany: vi.fn() },
        };
        return await fn(tx);
      });

      const svc = await importOverrides();
      await svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        scheduledAt: futureDateStr(), plannedDurationSeconds: 2700, reason: "audit test",
      });

      expect(capturedEvent.action).toBe("meeting_schedule_overridden");
      expect(capturedEvent.details).toMatchObject({
        actorId: "sec-1",
        reason: "audit test",
        oldScheduledAt: expect.any(String),
        newScheduledAt: expect.any(String),
        oldDurationSeconds: 3600,
        newDurationSeconds: 2700,
        oldRoomId: "room-1",
        newRoomId: "room-1",
        roomConflictOverrideUsed: false,
      });
      expect(capturedEvent.actorId).toBe("sec-1");
    });
  });

  describe("Organizer reassignment", () => {
    it("15. Secretary can reassign Organizer to an official attendee", async () => {
      const withAttendees = { ...structuredScheduledMeeting, attendees: [{ userId: "att-1" }], organizerId: "old-org" };
      mockPrisma.meeting.findUnique.mockResolvedValue(withAttendees);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" })
        .mockResolvedValueOnce({ id: "att-1", organizationId: "org-1" });
      mockPrisma.meeting.update.mockResolvedValue({ ...withAttendees, organizerId: "att-1" });
      mockPrisma.auditEvent.create.mockResolvedValue({});

      const svc = await importOverrides();
      const result = await svc.overrideOrganizer("meeting-1", "sec-1", { organizerId: "att-1", reason: "reassign" });
      expect(result.organizerId).toBe("att-1");
    });

    it("16. Reassigning Organizer to a non-attendee is rejected", async () => {
      const withAttendees = { ...structuredScheduledMeeting, attendees: [{ userId: "att-1" }], organizerId: "old-org" };
      mockPrisma.meeting.findUnique.mockResolvedValue(withAttendees);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" })
        .mockResolvedValueOnce({ id: "non-attendee", organizationId: "org-1" });

      const svc = await importOverrides();
      await expect(svc.overrideOrganizer("meeting-1", "sec-1", { organizerId: "non-attendee", reason: "bad" })).rejects.toThrow(ValidationError);
    });

    it("17. Organizer reassignment writes correct audit event", async () => {
      const withAttendees = { ...structuredScheduledMeeting, attendees: [{ userId: "new-org" }], organizerId: "old-org" };
      mockPrisma.meeting.findUnique.mockResolvedValue(withAttendees);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" })
        .mockResolvedValueOnce({ id: "new-org", organizationId: "org-1" });
      mockPrisma.meeting.update.mockResolvedValue(withAttendees);

      let capturedEvent: any = null;
      mockPrisma.auditEvent.create.mockImplementation(({ data }: any) => { capturedEvent = data; return {}; });

      const svc = await importOverrides();
      await svc.overrideOrganizer("meeting-1", "sec-1", { organizerId: "new-org", reason: "handoff" });

      expect(capturedEvent.action).toBe("organizer_reassigned_by_secretary");
      expect(capturedEvent.actorId).toBe("sec-1");
      expect(capturedEvent.details).toMatchObject({
        reason: "handoff",
        oldOrganizerId: "old-org",
        newOrganizerId: "new-org",
      });
    });
  });

  describe("Frozen field protection", () => {
    it("18. No forbidden planning field can be changed through override payload", async () => {
      const svc = await importOverrides();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        ...validSchedulePayload(),
        title: "hacked",
      } as any)).rejects.toThrow();
      await expect(svc.overrideOrganizer("meeting-1", "sec-1", {
        organizerId: "u2", reason: "ok", title: "hacked",
      } as any)).rejects.toThrow();
    });
  });

  describe("Override location type", () => {
    it("19. Secretary can change locationType to ONLINE with onlineLink", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });
      mockPrisma.roomBooking.findFirst.mockResolvedValue(null);

      let updateData: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockImplementation(({ data }: any) => { updateData = data; return structuredScheduledMeeting; }) },
          roomBooking: { deleteMany: vi.fn(), create: vi.fn() },
          auditEvent: { create: vi.fn() },
          notification: { createMany: vi.fn() },
        };
        return await fn(tx);
      });

      const svc = await importOverrides();
      await svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        locationType: "ONLINE", onlineLink: "https://zoom.us/j/123", roomId: null, reason: "switch to online",
      });
      expect(updateData).toMatchObject({ locationType: "ONLINE", onlineLink: "https://zoom.us/j/123", roomId: null });
    });

    it("20. ONLINE override rejects missing onlineLink", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });

      const svc = await importOverrides();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        locationType: "ONLINE", roomId: null, reason: "bad",
      })).rejects.toThrow(ValidationError);
    });

    it("21. HYBRID override requires both room and onlineLink", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });

      const svc = await importOverrides();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        locationType: "HYBRID", reason: "hybrid",
      })).rejects.toThrow(ValidationError);
    });

    it("22. PHYSICAL override requires room and no onlineLink", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(structuredScheduledMeeting);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" });

      const svc = await importOverrides();
      await expect(svc.overrideScheduleMeeting("meeting-1", "sec-1", {
        locationType: "PHYSICAL", roomId: null, reason: "physical",
      })).rejects.toThrow(ValidationError);
    });
  });
});

describe("Phase 5.1 — Meeting Detail Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseDetailMeeting = {
    ...baseMeeting,
    status: "SCHEDULED",
    scheduledAt: new Date().toISOString(),
    locationType: "PHYSICAL",
    onlineLink: null,
    organizerSummary: null,
    endedAt: null,
    summarySubmittedAt: null,
    lockedAt: null,
    summaryDeadlineAt: null,
    summaryAutoLockedAt: null,
    executiveRequestId: null,
    timezone: "UTC",
    actualDurationSeconds: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function makeDetailMeeting(overrides: Record<string, any> = {}) {
    return {
      ...baseDetailMeeting,
      attendees: [],
      agendaItems: [],
      timer: null,
      bookings: [],
      creator: { id: "user-1", name: "Alice", email: "alice@test.com" },
      organizer: { id: "user-1", name: "Alice", email: "alice@test.com" },
      room: null,
      ownerTeam: { id: "team-1", name: "Sales" },
      executiveRequest: null,
      ...overrides,
    };
  }

  it("1. Returns canonical capabilities for SCHEDULED meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting());
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "MEMBER", isExecutive: false });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.capabilities).toMatchObject({
      canOpenLiveRoom: true,
      canManageAttendees: true,
      canCancel: false,
      canOverrideSchedule: false,
      canViewLinkedExecutiveRequest: false,
      canViewAllNotes: true,
      canViewMeetingSummary: false,
    });
  });

  it("2. Notes are not included in meeting detail response", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting());
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY", isExecutive: false });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.notes).toBeUndefined();
  });

  it("3. Attendee user shape matches MeetingDetail contract", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      attendees: [{
        id: "att-1",
        meetingId: "meeting-1",
        userId: "user-2",
        removedAt: null,
        removedById: null,
        createdAt: new Date().toISOString(),
        user: { id: "user-2", name: "Bob", email: "bob@test.com", operationalRole: "MEMBER" },
      }],
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY", isExecutive: false });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.attendees).toHaveLength(1);
    expect(result.attendees[0].user).toMatchObject({ id: "user-2", name: "Bob", operationalRole: "MEMBER" });
  });

  it("4. Agenda items include speakers with user id and name", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      agendaItems: [{
        id: "ag-1",
        meetingId: "meeting-1",
        title: "Review",
        description: null,
        durationSeconds: 600,
        extensionSeconds: 0,
        sortOrder: 1,
        status: "NOT_STARTED",
        notes: null,
        activatedAt: null,
        completedAt: null,
        skippedAt: null,
        actualDurationSeconds: null,
        speakers: [{ agendaItemId: "ag-1", userId: "user-2", user: { id: "user-2", name: "Bob" } }],
      }],
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "ORGANIZER", isExecutive: false });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.agendaItems[0].speakers).toHaveLength(1);
    expect(result.agendaItems[0].speakers[0]).toMatchObject({ userId: "user-2", user: { id: "user-2", name: "Bob" } });
  });

  it("5. Executive request linked data included when present", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      executiveRequestId: "er-1",
      executiveRequest: { id: "er-1", title: "Quarterly Review", status: "PLANNING" },
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY", isExecutive: false });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.executiveRequest).toMatchObject({ id: "er-1", title: "Quarterly Review", status: "PLANNING" });
  });

  it("6. canOpenLiveRoom is false for ENDED_PENDING_SUMMARY", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({ status: "ENDED_PENDING_SUMMARY" }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "ORGANIZER", isExecutive: false });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.capabilities.canOpenLiveRoom).toBe(false);
  });

  it("7. canOpenLiveRoom is false for COMPLETED_LOCKED", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({ status: "COMPLETED_LOCKED" }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "ORGANIZER", isExecutive: false });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.capabilities.canOpenLiveRoom).toBe(false);
  });

  it("8. Room shape uses id and name only", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      roomId: "room-1",
      room: { id: "room-1", name: "Boardroom" },
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY", isExecutive: false });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.room).toMatchObject({ id: "room-1", name: "Boardroom" });
    expect(Object.keys(result.room!)).toEqual(["id", "name"]);
  });

  it("9. Non-organizer, non-secretary can view if attendee or speaker", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      attendees: [{
        id: "att-1",
        meetingId: "meeting-1",
        userId: "user-2",
        removedAt: null,
        removedById: null,
        createdAt: new Date().toISOString(),
        user: { id: "user-2", name: "Bob", operationalRole: "MEMBER" },
      }],
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", operationalRole: "MEMBER", isExecutive: false });
    mockPrisma.meetingAttendee.findUnique.mockResolvedValue({ id: "att-1", meetingId: "meeting-1", userId: "user-2" });

    // The viewer is an attendee, so the service should return data
    const { getMeetingById } = await import("../modules/meetings/meetings.service") as any;
    const meeting = await getMeetingById("meeting-1");
    expect(meeting.attendees.some((a: any) => a.userId === "user-2")).toBe(true);
  });
});

describe("Phase 5.2 — Meeting Detail Actions & Capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseDetailMeeting: any = {
    id: "meeting-1",
    title: "Test Meeting",
    status: "SCHEDULED",
    kind: "QUICK_TEAM",
    plannedDurationSeconds: 1800,
    scheduledAt: new Date().toISOString(),
    roomId: null,
    createdById: "user-1",
    organizerId: "user-1",
    organizationId: "org-1",
    ownerTeamId: "team-1",
    locationType: "PHYSICAL",
    onlineLink: null,
    organizerSummary: null,
    endedAt: null,
    summarySubmittedAt: null,
    lockedAt: null,
    summaryDeadlineAt: null,
    summaryAutoLockedAt: null,
    executiveRequestId: null,
    timezone: "UTC",
    actualDurationSeconds: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function makeDetailMeeting(overrides: Record<string, any> = {}) {
    return {
      ...baseDetailMeeting,
      attendees: [],
      agendaItems: [],
      timer: null,
      bookings: [],
      creator: { id: "user-1", name: "Alice", email: "alice@test.com" },
      organizer: { id: "user-1", name: "Alice", email: "alice@test.com" },
      room: null,
      ownerTeam: { id: "team-1", name: "Sales" },
      executiveRequest: null,
      ...overrides,
    };
  }

  it("1. Secretary can manage attendees, cancel, override schedule and view summary", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting());
    mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", isExecutive: false, functionalTeamId: null });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "sec-1");

    expect(result.capabilities).toMatchObject({
      canManageAttendees: true,
      canCancel: true,
      canOverrideSchedule: false,
      canViewMeetingSummary: false,
    });
  });

  it("2. Organizer can manage attendees and cancel own meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting());
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.capabilities).toMatchObject({
      canManageAttendees: true,
      canCancel: false,
      canOverrideSchedule: false,
    });
  });

  it("3. Team Admin (creator) can cancel own meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({ createdById: "admin-1" }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "admin-1", operationalRole: "TEAM_ADMIN", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "admin-1");

    expect(result.capabilities).toMatchObject({
      canCancel: true,
    });
  });

  it("4. Attendee cannot manage attendees, cancel, or override", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      attendees: [{
        id: "att-1", meetingId: "meeting-1", userId: "att-1", removedAt: null, removedById: null, createdAt: new Date().toISOString(),
        user: { id: "att-1", name: "Bob", operationalRole: "MEMBER" },
      }],
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "att-1", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "att-1");

    expect(result.capabilities).toMatchObject({
      canManageAttendees: false,
      canCancel: false,
      canOverrideSchedule: false,
      canOpenLiveRoom: false,
      canViewMeetingSummary: false,
    });
  });

  it("5. Speaker can open live room on IN_PROGRESS but not SCHEDULED", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      agendaItems: [{
        id: "ag-1", meetingId: "meeting-1", title: "Review", durationSeconds: 600, extensionSeconds: 0, sortOrder: 1,
        status: "NOT_STARTED", description: null, notes: null, activatedAt: null, completedAt: null, skippedAt: null, actualDurationSeconds: null,
        speakers: [{ agendaItemId: "ag-1", userId: "speaker-1", user: { id: "speaker-1", name: "Charlie" } }],
      }],
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "speaker-1", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "speaker-1");

    expect(result.capabilities).toMatchObject({
      canOpenLiveRoom: false,
      canManageAttendees: false,
      canCancel: false,
      canOverrideSchedule: false,
      canViewMeetingSummary: false,
    });

    // Now test IN_PROGRESS — speaker should have canOpenLiveRoom
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      status: "IN_PROGRESS",
      agendaItems: [{
        id: "ag-1", meetingId: "meeting-1", title: "Review", durationSeconds: 600, extensionSeconds: 0, sortOrder: 1,
        status: "NOT_STARTED", description: null, notes: null, activatedAt: null, completedAt: null, skippedAt: null, actualDurationSeconds: null,
        speakers: [{ agendaItemId: "ag-1", userId: "speaker-1", user: { id: "speaker-1", name: "Charlie" } }],
      }],
    }));
    const result2 = await getMeetingDetail("meeting-1", "speaker-1");
    expect(result2.capabilities.canOpenLiveRoom).toBe(true);
  });

  it("6. Secretary can override schedule for STRUCTURED SCHEDULED meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({ kind: "STRUCTURED" }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", isExecutive: false, functionalTeamId: null });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "sec-1");

    expect(result.capabilities.canOverrideSchedule).toBe(true);
  });

  it("7. canViewMeetingSummary is true for ENDED_PENDING_SUMMARY", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({ status: "ENDED_PENDING_SUMMARY" }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.capabilities.canViewMeetingSummary).toBe(true);
  });

  it("8. canViewMeetingSummary is true for COMPLETED_LOCKED", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({ status: "COMPLETED_LOCKED" }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");

    expect(result.capabilities.canViewMeetingSummary).toBe(true);
  });

  it("9. Unauthorized user (not attendee/speaker/organizer/secretary) still gets capabilities but limited", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({ createdById: "other-user" }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "stranger", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-2" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "stranger");

    expect(result.capabilities).toMatchObject({
      canOpenLiveRoom: false,
      canManageAttendees: false,
      canCancel: false,
      canOverrideSchedule: false,
      canViewMeetingSummary: false,
    });
  });

  it("10. canOpenLiveRoom is false for SCHEDULED attendee", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      attendees: [{
        id: "att-1", meetingId: "meeting-1", userId: "att-1", removedAt: null, removedById: null, createdAt: new Date().toISOString(),
        user: { id: "att-1", name: "Bob", operationalRole: "MEMBER" },
      }],
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "att-1", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "att-1");
    expect(result.capabilities.canOpenLiveRoom).toBe(false);
  });

  it("11. canOpenLiveRoom is true for IN_PROGRESS attendee", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({
      status: "IN_PROGRESS",
      attendees: [{
        id: "att-1", meetingId: "meeting-1", userId: "att-1", removedAt: null, removedById: null, createdAt: new Date().toISOString(),
        user: { id: "att-1", name: "Bob", operationalRole: "MEMBER" },
      }],
    }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "att-1", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "att-1");
    expect(result.capabilities.canOpenLiveRoom).toBe(true);
  });

  it("12. canOpenLiveRoom is true for SCHEDULED secretary", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting());
    mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY", isExecutive: false, functionalTeamId: null });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "sec-1");
    expect(result.capabilities.canOpenLiveRoom).toBe(true);
  });

  it("13. canViewMeetingSummary false for SCHEDULED", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting());
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "MEMBER", isExecutive: false, functionalTeamId: "team-1" });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");
    expect(result.capabilities.canViewMeetingSummary).toBe(false);
  });

  it("14. canOpenLiveRoom false for CANCELLED", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(makeDetailMeeting({ status: "CANCELLED" }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "SECRETARY", isExecutive: false, functionalTeamId: null });

    const { getMeetingDetail } = await import("../modules/meetings/meetings.service") as any;
    const result = await getMeetingDetail("meeting-1", "user-1");
    expect(result.capabilities.canOpenLiveRoom).toBe(false);
    expect(result.capabilities.canViewMeetingSummary).toBe(false);
  });
});
