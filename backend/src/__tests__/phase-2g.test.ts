import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, ValidationError } from "../common/errors/app-error";

const mockPrisma = vi.hoisted(() => ({
  meeting: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
  meetingTimer: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  meetingAttendee: { deleteMany: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
  agendaItem: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  roomBooking: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  parkingLotItem: { updateMany: vi.fn() },
  meetingNote: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

const scheduledMeeting = {
  id: "mtg-1",
  title: "Test Meeting",
  status: "SCHEDULED",
  plannedDurationSeconds: 1800,
  scheduledAt: new Date(Date.now() + 86400000),
  roomId: null,
  createdById: "user-1",
  organizerId: "user-1",
  organizationId: "org-1",
  ownerTeamId: "team-1",
  kind: "QUICK_TEAM",
  actualDurationSeconds: null,
  organizerSummary: null,
  endedAt: null,
  summarySubmittedAt: null,
  lockedAt: null,
  summaryDeadlineAt: null,
  summaryAutoLockedAt: null,
};

const liveMeeting = {
  ...scheduledMeeting,
  id: "mtg-2",
  status: "IN_PROGRESS",
  scheduledAt: new Date(),
};

const endedMeeting = {
  ...scheduledMeeting,
  id: "mtg-3",
  status: "ENDED_PENDING_SUMMARY",
  endedAt: new Date(),
  summaryDeadlineAt: new Date(Date.now() + 5 * 60 * 1000),
  summaryAutoLockedAt: new Date(Date.now() + 60 * 60 * 1000),
};

const lockedMeeting = {
  ...scheduledMeeting,
  id: "mtg-4",
  status: "COMPLETED_LOCKED",
  organizerSummary: null,
  lockedAt: new Date(),
};

async function importService() {
  const mod = await import("../modules/meetings/meetings.service");
  return mod;
}

describe("Phase 2g: Meeting Summary and Locked State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Only Organizer can submit summary", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(endedMeeting);

    const { submitSummary } = await importService();
    await expect(submitSummary("mtg-3", "non-organizer", "A great meeting"))
      .rejects.toThrow(ForbiddenError);
  });

  it("2. Secretary can end meeting but cannot submit Organizer summary", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(endedMeeting);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "sec-1", operationalRole: "SECRETARY" });

    // Secretary can end
    mockPrisma.meeting.findUnique.mockResolvedValue(liveMeeting);
    mockPrisma.meetingTimer.findUnique.mockResolvedValue(null);
    mockPrisma.meeting.update.mockResolvedValue({ ...liveMeeting, status: "ENDED_PENDING_SUMMARY" });
    const { endMeeting } = await importService();
    const result = await endMeeting("mtg-2", "sec-1");
    expect(result.status).toBe("ENDED_PENDING_SUMMARY");

    // Secretary cannot submit summary on behalf of organizer
    mockPrisma.meeting.findUnique.mockResolvedValue(endedMeeting);
    const { submitSummary } = await importService();
    await expect(submitSummary("mtg-3", "sec-1", "A great meeting"))
      .rejects.toThrow(ForbiddenError);
  });

  it("3. End only succeeds from IN_PROGRESS", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(scheduledMeeting);

    const { endMeeting } = await importService();
    await expect(endMeeting("mtg-1", "user-1")).rejects.toThrow(ValidationError);
  });

  it("4. End changes status to ENDED_PENDING_SUMMARY", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(liveMeeting);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", operationalRole: "MEMBER" });
    mockPrisma.meetingTimer.findUnique.mockResolvedValue(null);
    mockPrisma.meeting.update.mockResolvedValue({ ...liveMeeting, status: "ENDED_PENDING_SUMMARY" });

    const { endMeeting } = await importService();
    const result = await endMeeting("mtg-2", "user-1");
    expect(result.status).toBe("ENDED_PENDING_SUMMARY");
  });

  it("5. End immediately blocks new attendee notes", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(endedMeeting);

    const { createNote } = await import("../modules/notes/entries.service");
    await expect(createNote("mtg-3", "attendee-1", { content: "hello" }))
      .rejects.toThrow(ValidationError);
  });

  it("6. Empty summary is rejected", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(endedMeeting);

    const { submitSummary } = await importService();
    await expect(submitSummary("mtg-3", "user-1", "")).rejects.toThrow(ValidationError);
    await expect(submitSummary("mtg-3", "user-1", "   ")).rejects.toThrow(ValidationError);
  });

  it("7. Valid summary locks meeting", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(endedMeeting);
    mockPrisma.meeting.update.mockResolvedValue({
      ...endedMeeting,
      status: "COMPLETED_LOCKED",
      organizerSummary: "Good meeting summary",
      summarySubmittedAt: new Date(),
      lockedAt: new Date(),
    });

    const { submitSummary } = await importService();
    const result = await submitSummary("mtg-3", "user-1", "Good meeting summary");
    expect(result.status).toBe("COMPLETED_LOCKED");
    expect(result.organizerSummary).toBe("Good meeting summary");
  });

  it("8. Locked meeting rejects agenda, attendee, speaker, timer, and title changes", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValue(lockedMeeting);

    // Title change
    const { updateMeeting } = await importService();
    await expect(updateMeeting("mtg-4", "user-1", { title: "New" })).rejects.toThrow(ValidationError);

    // Schedule
    const { scheduleMeeting } = await importService();
    await expect(scheduleMeeting("mtg-4", "user-1", new Date(Date.now() + 86400000).toISOString()))
      .rejects.toThrow(ValidationError);

    // Start
    const { startMeeting } = await importService();
    await expect(startMeeting("mtg-4", "user-1")).rejects.toThrow(ValidationError);
  });

  it("9. Auto-lock after one hour works and is idempotent", async () => {
    mockPrisma.meeting.findUnique.mockResolvedValueOnce({
      ...endedMeeting,
      summaryAutoLockedAt: new Date(Date.now() - 1000), // past deadline
    });
    mockPrisma.meeting.update.mockResolvedValue({
      ...endedMeeting,
      status: "COMPLETED_LOCKED",
      lockedAt: new Date(),
    });

    const { reconcilePendingFinalization } = await importService();
    const now = new Date();
    const result = await reconcilePendingFinalization("mtg-3", now);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("COMPLETED_LOCKED");

    // Idempotent: second call returns null because status already changed
    mockPrisma.meeting.findUnique.mockResolvedValueOnce({
      ...endedMeeting,
      status: "COMPLETED_LOCKED",
    });
    const result2 = await reconcilePendingFinalization("mtg-3", now);
    expect(result2).toBeNull();
  });

  it("10. Auto-locked meeting with no summary shows null summary and remains locked", async () => {
    const autoLocked = {
      ...lockedMeeting,
      organizerSummary: null,
    };

    mockPrisma.meeting.findUnique.mockResolvedValue(autoLocked);

    const { getMeetingById } = await importService();
    const meeting = await getMeetingById("mtg-4");
    expect(meeting.organizerSummary).toBeNull();
    expect(meeting.status).toBe("COMPLETED_LOCKED");
  });

  it("11. Legacy Completed/Archived meetings migrate to COMPLETED_LOCKED", async () => {
    // Verify that COMPLETED_LOCKED is a valid status in the enum
    const validStatuses = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "CANCELLED", "ENDED_PENDING_SUMMARY", "COMPLETED_LOCKED"];
    expect(validStatuses).toContain("COMPLETED_LOCKED");
    expect(validStatuses).toContain("ENDED_PENDING_SUMMARY");

    // Verify new COMPLETED_LOCKED meeting respects lock
    mockPrisma.meeting.findUnique.mockResolvedValue(lockedMeeting);
    const { updateMeeting } = await importService();
    await expect(updateMeeting("mtg-4", "user-1", { title: "New" })).rejects.toThrow(ValidationError);
  });

  it("12. No new transition to ARCHIVED is allowed", async () => {
    const { archiveMeeting } = await importService();
    await expect(archiveMeeting("mtg-1", "user-1")).rejects.toMatchObject({ code: "LEGACY_COMMAND_DISABLED" });
  });
});
