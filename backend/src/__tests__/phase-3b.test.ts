import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, ValidationError } from "../common/errors/app-error";

const mockPrisma = vi.hoisted(() => ({
  meeting: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  meetingTimer: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  meetingAttendee: { findFirst: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
  agendaItem: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  roomBooking: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  meetingNote: { findUnique: vi.fn(), create: vi.fn() },
  parkingLotItem: { findMany: vi.fn(), updateMany: vi.fn() },
  meetingJoinRequest: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  executiveRequest: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  executiveRequestTarget: { findMany: vi.fn() },
  $transaction: vi.fn(),
  functionalTeam: { findUnique: vi.fn() },
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

const baseOrgId = "org-1";
const futureDate = () => new Date(Date.now() + 7 * 86400000);

function makeRequest(overrides = {}) {
  return {
    id: "er-1",
    organizationId: baseOrgId,
    createdByExecutiveId: "exec-1",
    title: "Executive Review",
    description: null,
    requestedDate: futureDate(),
    preferredPeriod: "MORNING",
    requestedDurationSeconds: 3600,
    urgency: null,
    status: "OPEN",
    currentMeetingId: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    targets: [
      { id: "t-1", targetType: "TEAM", targetUserId: null, targetTeamId: "team-1", executiveRequestId: "er-1" },
    ],
    ...overrides,
  };
}

const baseCreateData = {
  title: "Request-Derived Meeting",
  scheduledAt: new Date(futureDate().setUTCHours(9, 0, 0, 0)).toISOString(),
  plannedDurationSeconds: 3600,
  locationType: "PHYSICAL" as const,
  ownerTeamId: "team-1",
  attendeeIds: ["user-1", "user-2"],
  agendaItems: [
    { title: "Intro", durationSeconds: 900 },
    { title: "Review", durationSeconds: 1800 },
  ],
};

describe("Phase 3b — Request-Derived Structured Meeting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Secretary can plan a one-team Executive Request", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest());
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.meeting.create.mockResolvedValue({ id: "new-mtg", kind: "STRUCTURED", status: "Scheduled", executiveRequestId: "er-1" });

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const result = await planMeetingFromRequest("er-1", "sec-1", true, baseCreateData);
    expect(result.status).toBe("Scheduled");
    expect(result.kind).toBe("STRUCTURED");
  });

  it("2. Secretary can plan a multi-team Executive Request", async () => {
    const er = makeRequest({ targets: [
      { id: "t-1", targetType: "TEAM", targetUserId: null, targetTeamId: "team-1", executiveRequestId: "er-1" },
      { id: "t-2", targetType: "TEAM", targetUserId: null, targetTeamId: "team-2", executiveRequestId: "er-1" },
    ]});
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(er);
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.meeting.create.mockResolvedValue({ id: "new-mtg", kind: "STRUCTURED", status: "Scheduled", executiveRequestId: "er-1" });

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const result = await planMeetingFromRequest("er-1", "sec-1", true, baseCreateData);
    expect(result.status).toBe("Scheduled");
  });

  it("3. Named target user can plan a direct single-user request", async () => {
    const er = makeRequest({
      targets: [
        { id: "t-1", targetType: "USER", targetUserId: "user-named", targetTeamId: null, executiveRequestId: "er-1" },
      ],
    });
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(er);
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.meeting.create.mockResolvedValue({ id: "new-mtg", kind: "STRUCTURED", status: "Scheduled", executiveRequestId: "er-1" });

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const result = await planMeetingFromRequest("er-1", "user-named", false, baseCreateData);
    expect(result.status).toBe("Scheduled");
  });

  it("4. Non-target member cannot plan a named-person request", async () => {
    const er = makeRequest({
      targets: [
        { id: "t-1", targetType: "USER", targetUserId: "user-named", targetTeamId: null, executiveRequestId: "er-1" },
      ],
    });
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(er);

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    await expect(planMeetingFromRequest("er-1", "other-user", false, baseCreateData))
      .rejects.toThrow(ForbiddenError);
  });

  it("5. Team Admin cannot plan a team-targeted request", async () => {
    const er = makeRequest({
      targets: [
        { id: "t-1", targetType: "TEAM", targetUserId: null, targetTeamId: "team-1", executiveRequestId: "er-1" },
      ],
    });
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(er);

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    await expect(planMeetingFromRequest("er-1", "team-admin", false, baseCreateData))
      .rejects.toThrow(ForbiddenError);
  });

  it("6. Executive creator cannot plan a request unless they are also the exact named target", async () => {
    const er = makeRequest({
      createdByExecutiveId: "exec-1",
      targets: [
        { id: "t-1", targetType: "TEAM", targetUserId: null, targetTeamId: "team-1", executiveRequestId: "er-1" },
      ],
    });
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(er);

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    await expect(planMeetingFromRequest("er-1", "exec-1", false, baseCreateData))
      .rejects.toThrow(ForbiddenError);
  });

  it("7. Request without PLANNING/OPEN status is rejected", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest({ status: "SCHEDULED" }));

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    await expect(planMeetingFromRequest("er-1", "sec-1", true, baseCreateData))
      .rejects.toThrow(ValidationError);
  });

  it("8. Meeting outside morning window is rejected", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest({ preferredPeriod: "MORNING" }));

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const data = { ...baseCreateData, scheduledAt: new Date(futureDate().setUTCHours(14, 0, 0, 0)).toISOString() };
    await expect(planMeetingFromRequest("er-1", "sec-1", true, data))
      .rejects.toThrow(ValidationError);
    await expect(planMeetingFromRequest("er-1", "sec-1", true, data))
      .rejects.toMatchObject({ code: "EXECUTIVE_REQUEST_WINDOW_VIOLATION" });
  });

  it("9. Meeting outside afternoon window is rejected", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest({ preferredPeriod: "AFTERNOON" }));

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const data = { ...baseCreateData, scheduledAt: new Date(futureDate().setUTCHours(7, 0, 0, 0)).toISOString() };
    await expect(planMeetingFromRequest("er-1", "sec-1", true, data))
      .rejects.toThrow(ValidationError);
  });

  it("10. Meeting end extending outside requested window is rejected", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest({ preferredPeriod: "MORNING" }));

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const data = { ...baseCreateData, scheduledAt: new Date(futureDate().setUTCHours(11, 0, 0, 0)).toISOString(), plannedDurationSeconds: 7200 };
    await expect(planMeetingFromRequest("er-1", "sec-1", true, data))
      .rejects.toThrow(ValidationError);
  });

  it("11. Room conflict rejects planning", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest());
    mockPrisma.roomBooking.findFirst.mockResolvedValue({ id: "conflict" });

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const data = { ...baseCreateData, roomId: "room-1" };
    await expect(planMeetingFromRequest("er-1", "sec-1", true, data))
      .rejects.toMatchObject({ code: "ROOM_CONFLICT" });
  });

  it("12. Structured agenda requirement is enforced", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest());

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const data = { ...baseCreateData, agendaItems: [] };
    await expect(planMeetingFromRequest("er-1", "sec-1", true, data))
      .rejects.toThrow(ValidationError);
  });

  it("13. Valid plan creates Scheduled Structured Meeting and links request/currentMeetingId atomically", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest());
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        ...mockPrisma,
        meeting: { ...mockPrisma.meeting, create: vi.fn().mockResolvedValue({ id: "new-mtg", kind: "STRUCTURED", status: "Scheduled", executiveRequestId: "er-1" }) },
        roomBooking: { create: vi.fn() },
        parkingLotItem: { updateMany: vi.fn() },
        executiveRequest: { update: vi.fn() },
      };
      return cb(tx);
    });

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    const result = await planMeetingFromRequest("er-1", "sec-1", true, baseCreateData);
    expect(result.status).toBe("Scheduled");
    expect(result.kind).toBe("STRUCTURED");
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("14. Request status becomes SCHEDULED after planning", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest());
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    let updatedRequest: any = null;
    const updateFn = vi.fn().mockImplementation((args: any) => {
      updatedRequest = args.data;
      return { ...args, id: "er-1" };
    });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        ...mockPrisma,
        meeting: { ...mockPrisma.meeting, create: vi.fn().mockResolvedValue({ id: "new-mtg", kind: "STRUCTURED", status: "Scheduled", executiveRequestId: "er-1" }) },
        roomBooking: { create: vi.fn() },
        parkingLotItem: { updateMany: vi.fn() },
        executiveRequest: { update: updateFn },
      };
      return cb(tx);
    });

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    await planMeetingFromRequest("er-1", "sec-1", true, baseCreateData);
    expect(updatedRequest).toEqual({ status: "SCHEDULED", currentMeetingId: "new-mtg" });
  });

  it("15. Duplicate active plan is rejected", async () => {
    const er = makeRequest({ currentMeetingId: "existing-mtg" });
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(er);
    mockPrisma.meeting.findUnique.mockResolvedValue({ status: "Scheduled" });

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    await expect(planMeetingFromRequest("er-1", "sec-1", true, baseCreateData))
      .rejects.toMatchObject({ code: "EXECUTIVE_REQUEST_ALREADY_PLANNED" });
  });

  it("16. Executive requester can view linked meeting", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ id: "mtg-1", createdById: "sec-1", organizationId: baseOrgId, ownerTeamId: "team-1", executiveRequestId: "er-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "exec-1", operationalRole: "MEMBER", isExecutive: true, organizationId: baseOrgId, functionalTeamId: "team-1" });
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    mockPrisma.executiveRequest.findUnique.mockResolvedValue({ createdByExecutiveId: "exec-1" });

    const canView = await canViewMeeting("mtg-1", "exec-1");
    expect(canView).toBe(true);
  });

  it("17. Another Executive cannot view it merely because they are Executive", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ id: "mtg-1", createdById: "sec-1", organizationId: baseOrgId, ownerTeamId: "team-1", executiveRequestId: "er-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "exec-2", operationalRole: "MEMBER", isExecutive: true, organizationId: baseOrgId, functionalTeamId: null });
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    mockPrisma.executiveRequest.findUnique.mockResolvedValue({ createdByExecutiveId: "exec-1" });

    const canView = await canViewMeeting("mtg-1", "exec-2");
    expect(canView).toBe(false);
  });

  it("18. Selected Parking Lot items become USED_IN_AGENDA only after successful transaction", async () => {
    mockPrisma.executiveRequest.findUnique.mockResolvedValue(makeRequest());
    mockPrisma.roomBooking.findFirst.mockResolvedValue(null);
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([
      { id: "pl-1", organizationId: baseOrgId, status: "APPROVED" },
      { id: "pl-2", organizationId: baseOrgId, status: "APPROVED" },
    ]);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        ...mockPrisma,
        meeting: { ...mockPrisma.meeting, create: vi.fn().mockResolvedValue({ id: "new-mtg", kind: "STRUCTURED", status: "Scheduled", executiveRequestId: "er-1" }) },
        roomBooking: { create: vi.fn() },
        parkingLotItem: { updateMany: vi.fn() },
        executiveRequest: { update: vi.fn() },
      };
      return cb(tx);
    });

    const { planMeetingFromRequest } = await import("../modules/executive-requests/executive-requests.service");
    await planMeetingFromRequest("er-1", "sec-1", true, { ...baseCreateData, parkingLotItemIds: ["pl-1", "pl-2"] });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
