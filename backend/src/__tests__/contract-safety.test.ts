import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  createQuickMeetingSchema,
  createStructuredMeetingSchema,
  planExecutiveRequestMeetingSchema,
} from "../common/validators";
import { errorHandler } from "../common/middleware/error-handler";

const ids = {
  team: "10000000-0000-4000-8000-000000000001",
  user: "20000000-0000-4000-8000-000000000001",
  room: "30000000-0000-4000-8000-000000000001",
};

const mockPrisma = vi.hoisted(() => ({
  meeting: { create: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  functionalTeam: { findUnique: vi.fn() },
  room: { findUnique: vi.fn() },
  roomBooking: { deleteMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  parkingLotItem: { findMany: vi.fn(), updateMany: vi.fn() },
  executiveRequest: { findUnique: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));
vi.mock("../sockets/meeting.socket", () => ({ notifyMeetingUpdate: vi.fn() }));

const quick = {
  title: "Quick",
  ownerTeamId: ids.team,
  plannedDurationSeconds: 1800,
  locationType: "PHYSICAL" as const,
  roomId: ids.room,
  onlineLink: null,
  attendeeIds: [ids.user],
};

const structured = {
  ...quick,
  title: "Structured",
  agendaItems: [{
    title: "Agenda",
    durationSeconds: 600,
    speakerIds: [ids.user],
    notes: null,
    sortOrder: 0,
  }],
};

describe("Phase 1 strict creation schemas", () => {
  it.each(["kind", "agendaItems", "parkingLotItemIds"])("quick rejects %s", (field) => {
    expect(createQuickMeetingSchema.safeParse({ ...quick, [field]: field === "kind" ? "QUICK_TEAM" : [] }).success).toBe(false);
  });

  it("structured rejects kind and unknown fields", () => {
    expect(createStructuredMeetingSchema.safeParse({ ...structured, kind: "STRUCTURED" }).success).toBe(false);
    expect(createStructuredMeetingSchema.safeParse({ ...structured, mystery: true }).success).toBe(false);
  });

  it("quick and structured default attendeeIds while planning requires it", () => {
    const { attendeeIds: _q, ...quickWithout } = quick;
    const { attendeeIds: _s, ...structuredWithout } = structured;
    expect(createQuickMeetingSchema.parse(quickWithout).attendeeIds).toEqual([]);
    expect(createStructuredMeetingSchema.parse(structuredWithout).attendeeIds).toEqual([]);
    expect(planExecutiveRequestMeetingSchema.safeParse(structuredWithout).success).toBe(false);
  });

  it("rejects invalid UUIDs and team names with ownerTeamId field details", () => {
    for (const ownerTeamId of ["not-a-uuid", "Sales"]) {
      const result = createQuickMeetingSchema.safeParse({ ...quick, ownerTeamId });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(["ownerTeamId"]);
    }
  });

  it.each([
    ["PHYSICAL", ids.room, null, true],
    ["PHYSICAL", null, null, false],
    ["ONLINE", null, "https://meet.example.com/room", true],
    ["ONLINE", ids.room, "https://meet.example.com/room", false],
    ["HYBRID", ids.room, "https://meet.example.com/room", true],
    ["HYBRID", ids.room, null, false],
  ] as const)("applies %s location rules across all creation schemas", (locationType, roomId, onlineLink, valid) => {
    const q = { ...quick, locationType, roomId, onlineLink };
    const s = { ...structured, locationType, roomId, onlineLink };
    expect(createQuickMeetingSchema.safeParse(q).success).toBe(valid);
    expect(createStructuredMeetingSchema.safeParse(s).success).toBe(valid);
    expect(planExecutiveRequestMeetingSchema.safeParse({ ...s, scheduledAt: "2026-07-10T09:00:00.000Z" }).success).toBe(valid);
  });

  it("returns a typed 400 for missing request-plan attendees", () => {
    const { attendeeIds: _ignored, ...body } = structured;
    let thrown: ZodError | undefined;
    try { planExecutiveRequestMeetingSchema.parse(body); } catch (error) { thrown = error as ZodError; }
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    errorHandler(thrown!, {} as never, { status } as never, vi.fn());
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
        details: { fieldErrors: expect.objectContaining({ attendeeIds: expect.any(Array) }) },
      }),
    }));
  });
});

describe("Phase 1 persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
    mockPrisma.user.findUnique.mockResolvedValue({ id: ids.user, organizationId: "00000000-0000-4000-8000-000000000001", functionalTeamId: ids.team, operationalRole: "TEAM_ADMIN", isExecutive: false, isActive: true });
    mockPrisma.user.findMany.mockResolvedValue([{ id: ids.user, organizationId: "00000000-0000-4000-8000-000000000001", functionalTeamId: ids.team, isActive: true }]);
    mockPrisma.functionalTeam.findUnique.mockResolvedValue({ id: ids.team, organizationId: "00000000-0000-4000-8000-000000000001", isActive: true });
    mockPrisma.room.findUnique.mockResolvedValue({ id: ids.room, organizationId: "00000000-0000-4000-8000-000000000001", isActive: true });
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
  });

  it("persists and returns an onlineLink for a valid online meeting", async () => {
    const online = { ...quick, locationType: "ONLINE" as const, roomId: null, onlineLink: "https://meet.example.com/quick" };
    mockPrisma.meeting.create.mockImplementation(async ({ data }) => ({ id: "meeting-1", ...data }));
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    const result = await createQuickMeeting(ids.user, { ...online, organizationId: "00000000-0000-4000-8000-000000000001" });
    expect(mockPrisma.meeting.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ locationType: "ONLINE", onlineLink: online.onlineLink }),
    }));
    expect(result.onlineLink).toBe(online.onlineLink);
  });

  it("request-derived meeting persists locationType and onlineLink", async () => {
    const online = {
      ...structured,
      locationType: "ONLINE" as const,
      roomId: null,
      onlineLink: "https://meet.example.com/request",
      scheduledAt: "2026-07-10T09:00:00.000Z",
    };
    mockPrisma.executiveRequest.findUnique.mockResolvedValue({
      id: "request-1", organizationId: "00000000-0000-4000-8000-000000000001",
      createdByExecutiveId: ids.user, requestedDate: new Date("2026-07-10T00:00:00.000Z"),
      preferredPeriod: "MORNING", status: "OPEN", currentMeetingId: null, targets: [],
    });
    const tx = {
      meeting: { create: vi.fn(async ({ data }) => ({ id: "meeting-2", ...data })) },
      executiveRequest: { update: vi.fn() },
      parkingLotItem: { updateMany: vi.fn() },
      roomBooking: { create: vi.fn() },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const result = await planMeetingFromRequest("request-1", ids.user, true, online);
    expect(tx.meeting.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ locationType: "ONLINE", onlineLink: online.onlineLink }),
    }));
    expect(result.onlineLink).toBe(online.onlineLink);
  });
});
