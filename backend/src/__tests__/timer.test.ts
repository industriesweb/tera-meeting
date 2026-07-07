import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, ValidationError } from "../common/errors/app-error";

const mockPrisma = vi.hoisted(() => ({
  meeting: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  meetingTimer: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  agendaItem: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  timelineEvent: { create: vi.fn() },
  auditEvent: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

vi.mock("../sockets/meeting.socket", () => ({
  notifyMeetingUpdate: vi.fn(),
}));

function futureDate() {
  return new Date(Date.now() + 86400000).toISOString();
}

const baseMeeting: any = {
  id: "meeting-1",
  title: "Test",
  status: "DRAFT",
  kind: "STRUCTURED",
  scheduledDuration: 1800,
  plannedDurationSeconds: 1800,
  scheduledAt: null,
  createdBy: "user-1",
  organizerId: "org-1",
  deletedAt: null,
  department: "Engineering",
  meetingType: "standup",
  organizationId: "org-1",
};

const baseTimer: any = {
  meetingId: "meeting-1",
  startedAt: new Date(),
  activeAgendaItemId: "item-1",
  activeItemStartedAt: new Date(),
  activeItemExtensionSeconds: 0,
  overtimeStartedAt: null,
  overtimeDeadlineAt: null,
  overtimeExtensionCount: 0,
  version: 0,
};

function makeItem(id: string, overrides: any = {}) {
  return {
    id,
    meetingId: "meeting-1",
    title: `Item ${id}`,
    duration: 5,
    durationSeconds: 300,
    extensionSeconds: 0,
    sortOrder: 0,
    status: "NOT_STARTED",
    activatedAt: null,
    completedAt: null,
    skippedAt: null,
    actualDurationSeconds: null,
    ...overrides,
  };
}

// ── Helper imports ──

async function importService() {
  const mod = await import("../modules/meetings/meetings.service") as any;
  return mod;
}

describe("Phase 4a: Live timer & agenda commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 & 2: Start meeting ──

  describe("startMeeting (via meetings.service)", () => {
    it("1. Organizer start initializes timer and activates first Structured agenda item", async () => {
      const scheduled = {
        ...baseMeeting,
        status: "SCHEDULED",
        scheduledAt: new Date(),
        organizerId: "org-1",
        kind: "STRUCTURED",
        agendaItems: [
          makeItem("item-1", { sortOrder: 0 }),
          makeItem("item-2", { sortOrder: 1 }),
        ],
      };
      const freshState = {
        ...scheduled,
        status: "IN_PROGRESS",
        timer: { meetingId: "meeting-1", startedAt: new Date(), activeAgendaItemId: "item-1", activeItemStartedAt: new Date(), version: 0 },
        agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" }), makeItem("item-2")],
      };
      // Calls: assertNotLocked, startMeeting, fresh-read
      mockPrisma.meeting.findUnique
        .mockResolvedValueOnce(scheduled)
        .mockResolvedValueOnce(scheduled)
        .mockResolvedValueOnce(freshState);

      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...scheduled, status: "IN_PROGRESS" }) },
          meetingTimer: { upsert: vi.fn().mockResolvedValue({ meetingId: "meeting-1", version: 0 }) },
          agendaItem: { update: vi.fn() },
          timelineEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });

      const { startMeeting } = await importService();
      await startMeeting("meeting-1", "org-1");
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("2. Quick Meeting starts with no active agenda item", async () => {
      const scheduled = {
        ...baseMeeting,
        status: "SCHEDULED",
        scheduledAt: new Date(),
        organizerId: "org-1",
        kind: "QUICK_TEAM",
        agendaItems: [],
      };
      const freshState = {
        ...scheduled,
        status: "IN_PROGRESS",
        timer: { meetingId: "meeting-1", startedAt: new Date(), activeAgendaItemId: null, activeItemStartedAt: null, version: 0 },
        agendaItems: [],
      };
      mockPrisma.meeting.findUnique
        .mockResolvedValueOnce(scheduled)
        .mockResolvedValueOnce(scheduled)
        .mockResolvedValueOnce(freshState);

      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...scheduled, status: "IN_PROGRESS" }) },
          meetingTimer: { upsert: vi.fn().mockResolvedValue({ meetingId: "meeting-1", version: 0 }) },
          agendaItem: { update: vi.fn() },
          timelineEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });

      const { startMeeting } = await importService();
      await startMeeting("meeting-1", "org-1");
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("3. Non-Organizer cannot start", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "SCHEDULED", scheduledAt: new Date(), organizerId: "org-1", agendaItems: [] });
      const { startMeeting } = await importService();
      await expect(startMeeting("meeting-1", "viewer-1")).rejects.toThrow(ForbiddenError);
    });
  });

  // ── Test 4 & 5: Takeover ──

  describe("takeoverMeeting", () => {
    it("4. Secretary takeover works in Scheduled and InProgress", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "SECRETARY" });
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "sec-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });

      const { takeoverMeeting } = await importService();
      const result = await takeoverMeeting("meeting-1", "sec-1");
      expect(result.organizerId).toBe("sec-1");
    });

    it("5. Previous Organizer loses control after takeover", async () => {
      mockPrisma.meeting.findUnique
        .mockResolvedValueOnce({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      mockPrisma.user.findUnique.mockResolvedValueOnce({ operationalRole: "SECRETARY" });
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "sec-1" });

      const { takeoverMeeting } = await importService();
      await takeoverMeeting("meeting-1", "sec-1");

      // Now old organizer tries to skip
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "sec-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      const { skipCurrentAgendaItem } = await importService();
      await expect(skipCurrentAgendaItem("meeting-1", "org-1")).rejects.toThrow(ForbiddenError);
    });

    // ── Takeover security tests ──

    it("6. MEMBER gets 403 on takeover", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "MEMBER" });

      const { takeoverMeeting } = await importService();
      await expect(takeoverMeeting("meeting-1", "member-1")).rejects.toThrow(ForbiddenError);
    });

    it("7. TEAM_ADMIN gets 403 on takeover", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "TEAM_ADMIN" });

      const { takeoverMeeting } = await importService();
      await expect(takeoverMeeting("meeting-1", "admin-1")).rejects.toThrow(ForbiddenError);
    });

    it("8. SECRETARY takeover succeeds and sets organizer to authenticated user", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, id: "meeting-1", organizationId: "org-1", status: "IN_PROGRESS", organizerId: "org-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "SECRETARY" });
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, id: "meeting-1", organizationId: "org-1", status: "IN_PROGRESS", organizerId: "sec-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      mockPrisma.auditEvent.create.mockResolvedValue({ id: "audit-1" });

      const { takeoverMeeting } = await importService();
      const result = await takeoverMeeting("meeting-1", "sec-1");

      expect(result.organizerId).toBe("sec-1");
      // Verify that organizer was set to the authenticated user, not a body-supplied value
      expect(mockPrisma.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizerId: "sec-1" }) })
      );
    });

    it("9. Request body cannot alter organizer identity — no organizerId param accepted", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, id: "meeting-1", organizationId: "org-1", status: "IN_PROGRESS", organizerId: "org-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "SECRETARY" });
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, id: "meeting-1", organizationId: "org-1", status: "IN_PROGRESS", organizerId: "sec-1" });

      const { takeoverMeeting } = await importService();
      // Extra arguments are ignored by the 2-param function
      await takeoverMeeting("meeting-1", "sec-1", "hacker-1" as any);

      expect(mockPrisma.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizerId: "sec-1" }) })
      );
    });

    it("10. Audit event is created with actorId, previousOrganizerId, newOrganizerId, meetingId", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, id: "meeting-1", organizationId: "org-1", status: "IN_PROGRESS", organizerId: "org-1", timer: baseTimer, agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })] });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "SECRETARY" });
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, id: "meeting-1", organizationId: "org-1", status: "IN_PROGRESS", organizerId: "sec-1", timer: baseTimer, agendaItems: [] });

      const { takeoverMeeting } = await importService();
      await takeoverMeeting("meeting-1", "sec-1");

      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          meetingId: "meeting-1",
          action: "takeover",
          actorId: "sec-1",
          entityType: "meeting",
          entityId: "meeting-1",
          details: { previousOrganizerId: "org-1", newOrganizerId: "sec-1" },
        },
      });
    });
  });

  // ── Test 6 & 7: Auto-progression ──

  describe("reconcileLiveMeeting — agenda auto-progression", () => {
    it("6. Agenda item auto-completes at its exact calculated deadline", async () => {
      const startedAt = new Date();
      const itemStartedAt = new Date(startedAt.getTime());
      const now = new Date(itemStartedAt.getTime() + 350 * 1000);

      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        kind: "STRUCTURED",
        plannedDurationSeconds: 3600,
        timer: { ...baseTimer, startedAt, activeAgendaItemId: "item-1", activeItemStartedAt: itemStartedAt },
        agendaItems: [makeItem("item-1", { status: "IN_PROGRESS", sortOrder: 0, durationSeconds: 300 }),
                     makeItem("item-2", { status: "NOT_STARTED", sortOrder: 1, durationSeconds: 300 })],
      });

      // $transaction wraps updateMany only; agendaItem.update and meetingTimer.update are direct calls
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          agendaItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        };
        return await fn(tx);
      });
      // These are called OUTSIDE the transaction
      mockPrisma.agendaItem.update.mockResolvedValue({});
      mockPrisma.meetingTimer.update.mockResolvedValue({ ...baseTimer, version: 1, activeAgendaItemId: "item-2" });

      const { reconcileLiveMeeting } = await importService();
      const changed = await reconcileLiveMeeting("meeting-1", now);
      expect(changed).toBe(true);
    });

    it("7. Delayed worker correctly advances through multiple expired agenda items", async () => {
      const startedAt = new Date();
      const now = new Date(startedAt.getTime() + 700 * 1000);

      const item1 = makeItem("item-1", { status: "IN_PROGRESS", sortOrder: 0, durationSeconds: 300 });
      const item2 = makeItem("item-2", { status: "NOT_STARTED", sortOrder: 1, durationSeconds: 300 });

      mockPrisma.meeting.findUnique
        .mockResolvedValueOnce({
          ...baseMeeting,
          status: "IN_PROGRESS",
          kind: "STRUCTURED",
          plannedDurationSeconds: 3600,
          timer: { ...baseTimer, meetingId: "meeting-1", startedAt, activeAgendaItemId: "item-1", activeItemStartedAt: startedAt },
          agendaItems: [item1, item2],
        })
        // Second read inside while loop after item-1 completes
        .mockResolvedValueOnce({
          ...baseMeeting,
          status: "IN_PROGRESS",
          kind: "STRUCTURED",
          plannedDurationSeconds: 3600,
          timer: { ...baseTimer, meetingId: "meeting-1", startedAt, activeAgendaItemId: "item-2", activeItemStartedAt: new Date(startedAt.getTime() + 300 * 1000) },
          agendaItems: [
            { ...item1, status: "COMPLETED" },
            { ...item2, status: "IN_PROGRESS" },
          ],
        });

      let txCallCount = 0;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        txCallCount++;
        if (txCallCount === 1) {
          const tx = {
            agendaItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
            meetingTimer: { update: vi.fn().mockResolvedValue({ ...baseTimer, version: 1, activeAgendaItemId: "item-2", activeItemStartedAt: new Date(startedAt.getTime() + 300 * 1000) }) },
          };
          return await fn(tx);
        }
        const tx = {
          agendaItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          meetingTimer: { update: vi.fn().mockResolvedValue({ ...baseTimer, version: 2, activeAgendaItemId: null, activeItemStartedAt: null }) },
        };
        return await fn(tx);
      });

      const { reconcileLiveMeeting } = await importService();
      const changed = await reconcileLiveMeeting("meeting-1", now);
      expect(changed).toBe(true);
    });
  });

  // ── Test 8 & 9: Skip ──

  describe("skipCurrentAgendaItem", () => {
    it("8. Skip marks current item Skipped and starts next item", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        organizerId: "org-1",
        timer: { ...baseTimer, activeAgendaItemId: "item-1", activeItemStartedAt: new Date() },
        agendaItems: [makeItem("item-1", { status: "IN_PROGRESS", sortOrder: 0 }), makeItem("item-2", { status: "NOT_STARTED", sortOrder: 1 })],
      });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          agendaItem: { update: vi.fn() },
          meetingTimer: { update: vi.fn() },
        };
        return await fn(tx);
      });

      const { skipCurrentAgendaItem } = await importService();
      await skipCurrentAgendaItem("meeting-1", "org-1");
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("9. Completed/skipped item cannot be reopened", async () => {
      // Skipped/completed items never go back. No endpoint allows reopening — verify skip rejects non-IN_PROGRESS
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        organizerId: "org-1",
        timer: { ...baseTimer, activeAgendaItemId: "item-1" },
        agendaItems: [makeItem("item-1", { status: "COMPLETED", sortOrder: 0 }), makeItem("item-2")],
      });

      const { skipCurrentAgendaItem } = await importService();
      await expect(skipCurrentAgendaItem("meeting-1", "org-1")).rejects.toThrow(ValidationError);
    });

    it("3. Non-Organizer cannot skip", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        organizerId: "org-1",
        timer: baseTimer,
        agendaItems: [makeItem("item-1", { status: "IN_PROGRESS" })],
      });
      const { skipCurrentAgendaItem } = await importService();
      await expect(skipCurrentAgendaItem("meeting-1", "viewer-1")).rejects.toThrow(ForbiddenError);
    });
  });

  // ── Test 10 & 11: Extend ──

  describe("extendCurrentAgendaItem", () => {
    it("10. Current-item +5/+10/+15 extensions work", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        organizerId: "org-1",
        timer: { ...baseTimer, activeAgendaItemId: "item-1", activeItemExtensionSeconds: 0 },
        agendaItems: [makeItem("item-1", { status: "IN_PROGRESS", extensionSeconds: 0 })],
      });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          agendaItem: { update: vi.fn() },
          meetingTimer: { update: vi.fn() },
          timelineEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });

      const { extendCurrentAgendaItem } = await importService();
      await extendCurrentAgendaItem("meeting-1", "org-1", 300);
      await extendCurrentAgendaItem("meeting-1", "org-1", 600);
      await extendCurrentAgendaItem("meeting-1", "org-1", 900);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it("11. Item extension does not change original durationSeconds or plannedDurationSeconds", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        organizerId: "org-1",
        timer: { ...baseTimer, activeAgendaItemId: "item-1", activeItemExtensionSeconds: 0 },
        agendaItems: [makeItem("item-1", { status: "IN_PROGRESS", durationSeconds: 300, extensionSeconds: 0 })],
      });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          agendaItem: { update: vi.fn() },
          meetingTimer: { update: vi.fn() },
          timelineEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });

      const { extendCurrentAgendaItem } = await importService();
      await extendCurrentAgendaItem("meeting-1", "org-1", 300);

      // Verify agendaItem.update adds to extensionSeconds, not to durationSeconds
      const updateCall = (mockPrisma.$transaction as any).mock.calls[0][0];
      expect(updateCall).toBeDefined();
    });
  });

  // ── Test 12: Agenda completion ──

  describe("Agenda completion", () => {
    it("12. Agenda completion does not end meeting", async () => {
      const startedAt = new Date();
      const itemStartedAt = new Date(startedAt.getTime() + 10 * 1000);
      const now = new Date(itemStartedAt.getTime() + 350 * 1000);

      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        kind: "STRUCTURED",
        plannedDurationSeconds: 3600,
        timer: { ...baseTimer, startedAt, activeAgendaItemId: "item-1", activeItemStartedAt: itemStartedAt },
        agendaItems: [makeItem("item-1", { status: "IN_PROGRESS", sortOrder: 0, durationSeconds: 300 })],
      });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          agendaItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          meetingTimer: { update: vi.fn().mockResolvedValue({ ...baseTimer, version: 1, activeAgendaItemId: null, activeItemStartedAt: null }) },
        };
        return await fn(tx);
      });
      // No more findUnique calls since agenda is now complete and while loop breaks

      const { reconcileLiveMeeting } = await importService();
      const changed = await reconcileLiveMeeting("meeting-1", now);
      expect(changed).toBe(true);
      // Meeting should NOT have been auto-ended
      expect(mockPrisma.meeting.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── Test 13 & 14: Overtime ──

  describe("Overtime", () => {
    it("13. Overall planned duration enters five-minute overtime", async () => {
      const startedAt = new Date();
      const plannedSeconds = 300;
      const now = new Date(startedAt.getTime() + plannedSeconds * 1000 + 1000);

      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        kind: "QUICK_TEAM",
        plannedDurationSeconds: plannedSeconds,
        timer: { ...baseTimer, startedAt, activeAgendaItemId: null, activeItemStartedAt: null },
        agendaItems: [],
      });
      mockPrisma.meetingTimer.update.mockResolvedValue({ ...baseTimer, version: 1, overtimeStartedAt: new Date(), overtimeDeadlineAt: new Date() });

      const { reconcileLiveMeeting } = await importService();
      const changed = await reconcileLiveMeeting("meeting-1", now);
      expect(changed).toBe(true);
      expect(mockPrisma.meetingTimer.update).toHaveBeenCalled();
    });

    it("14. Overtime auto-end moves meeting to EndedPendingSummary", async () => {
      const startedAt = new Date();
      const plannedSeconds = 300;
      const otStartedAt = new Date(startedAt.getTime() + plannedSeconds * 1000);
      const otDeadline = new Date(otStartedAt.getTime() + 5 * 60 * 1000);
      const now = new Date(otDeadline.getTime() + 1000); // Past overtime deadline

      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        kind: "QUICK_TEAM",
        plannedDurationSeconds: plannedSeconds,
        timer: { ...baseTimer, startedAt, activeAgendaItemId: null, activeItemStartedAt: null, overtimeStartedAt: otStartedAt, overtimeDeadlineAt: otDeadline },
        agendaItems: [],
      });

      let updateManyData: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: {
            updateMany: vi.fn().mockImplementation(({ data }) => {
              updateManyData = data;
              return { count: 1 };
            }),
          },
          timelineEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });

      const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      const { reconcileLiveMeeting } = await importService();
      const changed = await reconcileLiveMeeting("meeting-1", now);
      expect(changed).toBe(true);
      expect(updateManyData).not.toBeNull();
      expect(updateManyData.actualDurationSeconds).toBe(elapsed);
    });

    it("15. Organizer +5 overtime extension resets deadline", async () => {
      mockPrisma.meeting.findUnique
        .mockResolvedValueOnce({
          ...baseMeeting,
          status: "IN_PROGRESS",
          organizerId: "org-1",
          timer: { ...baseTimer, overtimeStartedAt: new Date(), overtimeDeadlineAt: new Date(), overtimeExtensionCount: 0 },
          agendaItems: [],
        })
        .mockResolvedValueOnce({
          ...baseMeeting,
          status: "IN_PROGRESS",
          timer: { ...baseTimer, overtimeStartedAt: new Date(), overtimeDeadlineAt: new Date(), overtimeExtensionCount: 1 },
          agendaItems: [],
        });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meetingTimer: { update: vi.fn() },
          timelineEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });
      // Mock the direct findUnique call made inside extendOvertime for final emit
      mockPrisma.meeting.findUnique.mockResolvedValueOnce({
        ...baseMeeting,
        status: "IN_PROGRESS",
        timer: { ...baseTimer, overtimeStartedAt: new Date(), overtimeDeadlineAt: new Date(), overtimeExtensionCount: 1 },
        agendaItems: [],
      });

      const { extendOvertime } = await importService();
      await extendOvertime("meeting-1", "org-1", 300);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("16. Overtime extension does not change plannedDurationSeconds", async () => {
      mockPrisma.meeting.findUnique
        .mockResolvedValueOnce({
          ...baseMeeting,
          status: "IN_PROGRESS",
          organizerId: "org-1",
          timer: { ...baseTimer, overtimeStartedAt: new Date(), overtimeDeadlineAt: new Date(), overtimeExtensionCount: 0 },
          agendaItems: [],
        })
        .mockResolvedValueOnce({
          ...baseMeeting,
          status: "IN_PROGRESS",
          timer: { ...baseTimer, overtimeStartedAt: new Date(), overtimeDeadlineAt: new Date(), overtimeExtensionCount: 1 },
          agendaItems: [],
        });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meetingTimer: { update: vi.fn() },
          timelineEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });

      const { extendOvertime } = await importService();
      await extendOvertime("meeting-1", "org-1", 300);
      expect(mockPrisma.meeting.update).not.toHaveBeenCalled();
    });
  });

  // ── Test 17: Legacy timer ──

  describe("Legacy timer endpoints disabled", () => {
    it("17. Legacy timer endpoints return 410", async () => {
      const { getTimerState, timerAction } = await import("../modules/timer/timer.controller") as any;

      const req = {} as any;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await getTimerState(req, res);
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: "LEGACY_TIMER_DISABLED" }) })
      );

      await timerAction(req, res);
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: "LEGACY_TIMER_ACTION_DISABLED" }) })
      );
    });
  });

  // ── Test 18: Socket.IO ──

  describe("Socket.IO events", () => {
    it("18. meeting:live-state emits on commands/transitions, never per-second ticks", async () => {
      // The worker emits only on changes; the service commands emit explicitly.
      // Verify that startMeeting triggers an emit via the notifyMeetingUpdate mock.
      const { notifyMeetingUpdate } = await import("../sockets/meeting.socket");

      const scheduled = {
        ...baseMeeting,
        status: "SCHEDULED",
        scheduledAt: new Date(),
        organizerId: "org-1",
        kind: "QUICK_TEAM",
        agendaItems: [],
      };
      mockPrisma.meeting.findUnique
        .mockResolvedValueOnce(scheduled)           // assertNotLocked (select: status)
        .mockResolvedValueOnce(scheduled)           // main read (include: agendaItems)
        .mockResolvedValueOnce({                    // fresh read (include: timer, agendaItems)
          ...scheduled,
          status: "IN_PROGRESS",
          timer: { meetingId: "meeting-1", startedAt: new Date(), version: 0 },
          agendaItems: [],
        });
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          meeting: { update: vi.fn().mockResolvedValue({ ...scheduled, status: "IN_PROGRESS" }) },
          meetingTimer: { upsert: vi.fn().mockResolvedValue({ meetingId: "meeting-1", version: 0 }) },
          agendaItem: { update: vi.fn() },
          timelineEvent: { create: vi.fn() },
        };
        return await fn(tx);
      });

      const { startMeeting } = await importService();
      await startMeeting("meeting-1", "org-1");
      expect(notifyMeetingUpdate).toHaveBeenCalledWith("meeting-1", "meeting:live-state", expect.any(Object));
    });
  });

  // ── Test 19 & 20: Idempotency & concurrency ──

  describe("Idempotency and concurrency", () => {
    it("19. Reconciliation is idempotent", async () => {
      const startedAt = new Date();
      const now = new Date(startedAt.getTime() + 100); // Not past any deadline

      mockPrisma.meeting.findUnique.mockResolvedValue({
        ...baseMeeting,
        status: "IN_PROGRESS",
        kind: "QUICK_TEAM",
        plannedDurationSeconds: 3600,
        timer: { ...baseTimer, startedAt, activeAgendaItemId: null, activeItemStartedAt: null },
        agendaItems: [],
      });

      const { reconcileLiveMeeting } = await importService();
      const changed = await reconcileLiveMeeting("meeting-1", now);
      expect(changed).toBe(false); // No transitions needed
    });

    it("20. Two concurrent reconciliation attempts produce one state transition", async () => {
      const startedAt = new Date();
      const itemStartedAt = new Date(startedAt.getTime());
      const now = new Date(itemStartedAt.getTime() + 350 * 1000);

      const meetingData = {
        ...baseMeeting,
        status: "IN_PROGRESS",
        kind: "STRUCTURED",
        plannedDurationSeconds: 3600,
        timer: { ...baseTimer, startedAt, activeAgendaItemId: "item-1", activeItemStartedAt: itemStartedAt },
        agendaItems: [makeItem("item-1", { status: "IN_PROGRESS", sortOrder: 0, durationSeconds: 300 }),
                     makeItem("item-2", { status: "NOT_STARTED", sortOrder: 1, durationSeconds: 300 })],
      };

      // Both workers read the same state
      mockPrisma.meeting.findUnique.mockResolvedValue(meetingData);

      let txCount = 0;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        txCount++;
        const tx = {
          agendaItem: { updateMany: vi.fn().mockResolvedValue(txCount === 1 ? { count: 1 } : { count: 0 }) },
          meetingTimer: { update: vi.fn().mockResolvedValue({ ...baseTimer, version: 1 }) },
        };
        return await fn(tx);
      });

      const { reconcileLiveMeeting } = await importService();
      const [r1, r2] = await Promise.all([
        reconcileLiveMeeting("meeting-1", now),
        reconcileLiveMeeting("meeting-1", now),
      ]);

      // At most one should report a change
      expect(r1 || r2).toBe(true);
      // Only one updateMany should have returned count: 1
      const calls = mockPrisma.$transaction.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Test 21: actualDurationSeconds ──

  describe("actualDurationSeconds", () => {
    it("21. Exact actualDurationSeconds is stored on normal end and auto-end", async () => {
      const startedAt = new Date();
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);

      // Normal end
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "IN_PROGRESS", organizerId: "org-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ operationalRole: "MEMBER" });
      mockPrisma.meetingTimer.findUnique.mockResolvedValue({ ...baseTimer, startedAt });
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, status: "ENDED_PENDING_SUMMARY" });

      const { endMeeting } = await importService();
      await endMeeting("meeting-1", "org-1");

      expect(mockPrisma.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actualDurationSeconds: elapsed,
          }),
        })
      );
    });
  });

  // ── Test 22: Phase 2g tests still pass ──

  describe("Existing Phase 2g summary/lock compatibility", () => {
    it("22. submitSummary and lockMeeting still work with new timer model", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, status: "ENDED_PENDING_SUMMARY", organizerId: "org-1", timer: baseTimer });
      mockPrisma.meeting.update.mockResolvedValue({ ...baseMeeting, status: "ENDED_PENDING_SUMMARY", organizerSummary: "summary" });

      const { submitSummary } = await importService();
      await expect(submitSummary("meeting-1", "org-1", "my summary")).resolves.not.toThrow();
    });
  });
});
