import { describe, it, expect, vi, beforeEach } from "vitest";

const meetingId = "meeting-1";
const orgId = "org-1";
const organizerId = "org-user";
const secretaryId = "sec-user";
const attendeeA = "attendee-a";
const attendeeB = "attendee-b";
const speakerOnly = "speaker-only";

const mockPrisma = vi.hoisted(() => ({
  meeting: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  meetingNote: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  meetingAttendee: { findUnique: vi.fn() },
  agendaItem: { findFirst: vi.fn() },
  auditEvent: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

const noteA = { id: "note-a", meetingId, authorId: attendeeA, content: "Note from A", author: { id: attendeeA, name: "Alice" } };
const noteB = { id: "note-b", meetingId, authorId: attendeeB, content: "Note from B", author: { id: attendeeB, name: "Bob" } };
const allNotes = [noteA, noteB];

describe("Phase 4.1 — Notes privacy (server-side)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockMeeting(overrides: Record<string, any> = {}) {
    mockPrisma.meeting.findUnique.mockResolvedValue({
      id: meetingId,
      organizationId: orgId,
      organizerId,
      status: "IN_PROGRESS",
      ...overrides,
    });
  }

  function mockUser(overrides: Record<string, any> = {}) {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "any",
      operationalRole: "MEMBER",
      ...overrides,
    });
  }

  // ── Organizer sees all notes ──

  it("1. Organizer sees all notes", async () => {
    mockMeeting();
    mockUser({ operationalRole: "MEMBER" });
    mockPrisma.meetingNote.findMany.mockResolvedValue(allNotes);

    const { listNotes } = await import("../modules/notes/entries.service");
    const result = await listNotes(meetingId, organizerId);

    expect(result).toHaveLength(2);
    expect(mockPrisma.meetingNote.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.objectContaining({ authorId: expect.any(String) }) })
    );
  });

  // ── Secretary sees all notes ──

  it("2. Secretary sees all notes", async () => {
    mockMeeting();
    mockUser({ id: secretaryId, operationalRole: "SECRETARY" });
    mockPrisma.meetingNote.findMany.mockResolvedValue(allNotes);

    const { listNotes } = await import("../modules/notes/entries.service");
    const result = await listNotes(meetingId, secretaryId);

    expect(result).toHaveLength(2);
    expect(mockPrisma.meetingNote.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.objectContaining({ authorId: expect.any(String) }) })
    );
  });

  // ── Active attendee sees only own note ──

  it("3. Active attendee sees only own note — cannot retrieve other user's note", async () => {
    mockMeeting();
    mockUser({ id: attendeeA, operationalRole: "MEMBER" });
    mockPrisma.meetingAttendee.findUnique.mockResolvedValue({ id: "att-1", meetingId, userId: attendeeA });
    // Simulate the service's own filtering: the where clause includes authorId
    mockPrisma.meetingNote.findMany.mockImplementation(async ({ where }: any) => {
      return allNotes.filter((n) => n.authorId === where.authorId);
    });

    const { listNotes } = await import("../modules/notes/entries.service");
    const result = await listNotes(meetingId, attendeeA);

    expect(result).toHaveLength(1);
    expect(result[0].authorId).toBe(attendeeA);
    expect(result[0].content).toBe("Note from A");
    // Attempt to retrieve B's note as A should not be possible
    const resultAsB = await listNotes(meetingId, attendeeB);
    expect(resultAsB).toHaveLength(1);
    expect(resultAsB[0].authorId).toBe(attendeeB);
  });

  // ── Agenda speaker who is not an attendee sees only own note ──

  it("4. Agenda speaker who is not an attendee sees only own note", async () => {
    mockMeeting();
    mockUser({ id: speakerOnly, operationalRole: "MEMBER" });
    mockPrisma.agendaItem.findFirst.mockResolvedValue({ id: "ag-1", meetingId, speakerId: speakerOnly });
    mockPrisma.meetingNote.findMany.mockImplementation(async ({ where }: any) => {
      return allNotes.filter((n) => n.authorId === where.authorId);
    });

    const { listNotes } = await import("../modules/notes/entries.service");
    const result = await listNotes(meetingId, speakerOnly);

    expect(result).toHaveLength(0);
  });

  // ── User with no access gets 403 ──

  it("5. User with no attendee/speaker/organizer/secretary access gets 403", async () => {
    mockMeeting();
    mockUser({ id: "stranger", operationalRole: "MEMBER" });
    // No attendee record and no speaker assignments
    mockPrisma.meetingAttendee.findUnique.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);

    const { listNotes } = await import("../modules/notes/entries.service");
    await expect(listNotes(meetingId, "stranger")).rejects.toThrow("You do not have access to notes for this meeting");
  });

  // ── Explicit two-note cross-user privacy test ──

  it("6. Normal attendee cannot retrieve another attendee's note through the API", async () => {
    mockMeeting();
    mockUser({ id: attendeeA, operationalRole: "MEMBER" });
    mockPrisma.meetingAttendee.findUnique.mockResolvedValue({ id: "att-1", meetingId, userId: attendeeA });
    // Simulate: service fetches only notes where authorId matches the caller
    mockPrisma.meetingNote.findMany.mockImplementation(async ({ where }: any) => {
      return allNotes.filter((n) => n.authorId === where.authorId);
    });

    const { listNotes } = await import("../modules/notes/entries.service");

    // Attendee A requests notes — gets only note A
    const aNotes = await listNotes(meetingId, attendeeA);
    const aIds = aNotes.map((n: any) => n.authorId);
    expect(aIds).not.toContain(attendeeB);
    expect(aIds).toContain(attendeeA);

    // Attendee B requests notes — gets only note B
    const bNotes = await listNotes(meetingId, attendeeB);
    const bIds = bNotes.map((n: any) => n.authorId);
    expect(bIds).not.toContain(attendeeA);
    expect(bIds).toContain(attendeeB);
  });
});
