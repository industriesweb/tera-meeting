import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, ValidationError } from "../common/errors/app-error";

const ids = {
  org: "00000000-0000-4000-8000-000000000001",
  otherOrg: "00000000-0000-4000-8000-000000000002",
  team: "10000000-0000-4000-8000-000000000001",
  otherTeam: "10000000-0000-4000-8000-000000000002",
  actor: "20000000-0000-4000-8000-000000000001",
  attendee: "20000000-0000-4000-8000-000000000002",
  otherUser: "20000000-0000-4000-8000-000000000003",
  room: "30000000-0000-4000-8000-000000000001",
  parking: "40000000-0000-4000-8000-000000000001",
};

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  functionalTeam: { findUnique: vi.fn() },
  room: { findUnique: vi.fn() },
  meeting: { create: vi.fn() },
  roomBooking: { findFirst: vi.fn(), create: vi.fn() },
  parkingLotItem: { findMany: vi.fn(), updateMany: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("../config/database", () => ({ prisma: db }));
vi.mock("../sockets/meeting.socket", () => ({ notifyMeetingUpdate: vi.fn() }));

const activeActor = {
  id: ids.actor, organizationId: ids.org, functionalTeamId: ids.team,
  operationalRole: "TEAM_ADMIN", isExecutive: false, isActive: true,
};
const team = { id: ids.team, organizationId: ids.org, isActive: true };
const room = { id: ids.room, organizationId: ids.org, isActive: true };
const sameTeamUser = { id: ids.attendee, organizationId: ids.org, functionalTeamId: ids.team, isActive: true };

const onlineData = {
  title: "Direct API attempt",
  ownerTeamId: ids.team,
  organizationId: ids.org,
  plannedDurationSeconds: 1800,
  locationType: "ONLINE" as const,
  roomId: null,
  onlineLink: "https://meet.example.com/direct",
  attendeeIds: [ids.attendee],
};

function configureValidDefaults() {
  db.$transaction.mockImplementation((callback) => callback(db));
  db.user.findUnique.mockResolvedValue(activeActor);
  db.user.findMany.mockResolvedValue([sameTeamUser]);
  db.functionalTeam.findUnique.mockResolvedValue(team);
  db.room.findUnique.mockResolvedValue(room);
  db.roomBooking.findFirst.mockResolvedValue(null);
  db.meeting.create.mockImplementation(async ({ data }) => ({ id: `meeting-${db.meeting.create.mock.calls.length}`, ...data }));
  db.parkingLotItem.findMany.mockResolvedValue([]);
  db.parkingLotItem.updateMany.mockResolvedValue({ count: 0 });
}

describe("Phase 2.1 backend creation enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureValidDefaults();
  });

  it.each([
    ["MEMBER", false],
    ["MEMBER", true],
  ])("rejects direct API bypass for %s (executive=%s)", async (operationalRole, isExecutive) => {
    db.user.findUnique.mockResolvedValue({ ...activeActor, operationalRole, isExecutive });
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createQuickMeeting(ids.actor, onlineData)).rejects.toThrow(ForbiddenError);
    expect(db.meeting.create).not.toHaveBeenCalled();
  });

  it("allows a Secretary to create for any active Team in their Organization", async () => {
    db.user.findUnique.mockResolvedValue({ ...activeActor, operationalRole: "SECRETARY", functionalTeamId: null });
    db.functionalTeam.findUnique.mockResolvedValue({ ...team, id: ids.otherTeam });
    db.user.findMany.mockResolvedValue([{ ...sameTeamUser, functionalTeamId: ids.otherTeam }]);
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createQuickMeeting(ids.actor, { ...onlineData, ownerTeamId: ids.otherTeam })).resolves.toBeTruthy();
  });

  it("rejects a Team Admin creating for another Team", async () => {
    db.functionalTeam.findUnique.mockResolvedValue({ ...team, id: ids.otherTeam });
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createQuickMeeting(ids.actor, { ...onlineData, ownerTeamId: ids.otherTeam })).rejects.toThrow(ForbiddenError);
  });

  it.each([
    ["inactive Team", () => db.functionalTeam.findUnique.mockResolvedValue({ ...team, isActive: false })],
    ["cross-organization Team", () => db.functionalTeam.findUnique.mockResolvedValue({ ...team, organizationId: ids.otherOrg })],
  ])("rejects %s", async (_label, arrange) => {
    arrange();
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createQuickMeeting(ids.actor, onlineData)).rejects.toThrow(ValidationError);
  });

  it.each([
    ["cross-Team attendee", { ...sameTeamUser, functionalTeamId: ids.otherTeam }],
    ["inactive attendee", { ...sameTeamUser, isActive: false }],
  ])("rejects %s", async (_label, invalidUser) => {
    db.user.findMany.mockResolvedValue([invalidUser]);
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createQuickMeeting(ids.actor, onlineData)).rejects.toThrow(/attendeeIds/);
  });

  it.each([
    ["cross-Team speaker", { ...sameTeamUser, functionalTeamId: ids.otherTeam }],
    ["inactive speaker", { ...sameTeamUser, isActive: false }],
  ])("rejects %s", async (_label, invalidUser) => {
    db.user.findMany
      .mockResolvedValueOnce([sameTeamUser])
      .mockResolvedValueOnce([invalidUser]);
    const { createStructuredMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createStructuredMeeting(ids.actor, {
      ...onlineData,
      agendaItems: [{ title: "Agenda", durationSeconds: 600, sortOrder: 0, speakerIds: [ids.attendee] }],
    })).rejects.toThrow(/speakerIds/);
  });

  it.each([
    ["inactive Room", { ...room, isActive: false }],
    ["cross-organization Room", { ...room, organizationId: ids.otherOrg }],
  ])("rejects %s", async (_label, invalidRoom) => {
    db.room.findUnique.mockResolvedValue(invalidRoom);
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createQuickMeeting(ids.actor, {
      ...onlineData, locationType: "PHYSICAL", onlineLink: null, roomId: ids.room,
    })).rejects.toThrow(/roomId/);
  });

  it("adds the organizer as an attendee exactly once", async () => {
    db.user.findMany.mockResolvedValue([
      { id: ids.actor, organizationId: ids.org, functionalTeamId: ids.team, isActive: true },
      sameTeamUser,
    ]);
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    await createQuickMeeting(ids.actor, { ...onlineData, attendeeIds: [ids.actor, ids.attendee, ids.actor] });
    const createData = db.meeting.create.mock.calls[0][0].data;
    expect(createData.attendees.create).toEqual([{ userId: ids.actor }, { userId: ids.attendee }]);
  });

  it("rejects an overlapping scheduled room before creating anything", async () => {
    db.roomBooking.findFirst.mockResolvedValue({ id: "existing-booking" });
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createQuickMeeting(ids.actor, {
      ...onlineData, scheduledAt: "2026-08-10T09:00:00.000Z",
      locationType: "PHYSICAL", onlineLink: null, roomId: ids.room,
    })).rejects.toMatchObject({ code: "ROOM_CONFLICT" });
    expect(db.$executeRaw).toHaveBeenCalledBefore(db.roomBooking.findFirst);
    expect(db.meeting.create).not.toHaveBeenCalled();
  });

  it("serializes concurrent overlap attempts so only one succeeds", async () => {
    const bookings: { startsAt: Date; endsAt: Date }[] = [];
    let gate = Promise.resolve();
    db.$transaction.mockImplementation(async (callback) => {
      let release!: () => void;
      const previous = gate;
      gate = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await callback(db); } finally { release(); }
    });
    db.roomBooking.findFirst.mockImplementation(async ({ where }) =>
      bookings.find((booking) => booking.startsAt < where.startsAt.lt && booking.endsAt > where.endsAt.gt) ?? null,
    );
    db.roomBooking.create.mockImplementation(async ({ data }) => { bookings.push(data); return data; });
    const { createQuickMeeting } = await import("../modules/meetings/meetings.service");
    const input = { ...onlineData, scheduledAt: "2026-08-10T09:00:00.000Z", locationType: "PHYSICAL" as const, onlineLink: null, roomId: ids.room };
    const results = await Promise.allSettled([createQuickMeeting(ids.actor, input), createQuickMeeting(ids.actor, input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(bookings).toHaveLength(1);
  });

  it("rolls back Meeting and related writes when Parking Lot claiming fails", async () => {
    const committed = { meetings: [] as unknown[], bookings: [] as unknown[] };
    db.parkingLotItem.findMany.mockResolvedValue([{ id: ids.parking, organizationId: ids.org, teamId: ids.team, status: "APPROVED", agendaMeetingId: null }]);
    db.parkingLotItem.updateMany.mockResolvedValue({ count: 0 });
    db.$transaction.mockImplementation(async (callback) => {
      const draft = { meetings: [...committed.meetings], bookings: [...committed.bookings] };
      const tx = {
        ...db,
        meeting: { create: vi.fn(async ({ data }) => { const meeting = { id: "rolled-back", ...data }; draft.meetings.push(meeting); return meeting; }) },
        roomBooking: { ...db.roomBooking, create: vi.fn(async ({ data }) => { draft.bookings.push(data); return data; }) },
      };
      try {
        const result = await callback(tx);
        committed.meetings = draft.meetings;
        committed.bookings = draft.bookings;
        return result;
      } catch (error) { throw error; }
    });
    const { createStructuredMeeting } = await import("../modules/meetings/meetings.service");
    await expect(createStructuredMeeting(ids.actor, {
      ...onlineData,
      parkingLotItemIds: [ids.parking],
      agendaItems: [{ title: "Agenda", durationSeconds: 600, sortOrder: 0, speakerIds: [ids.attendee] }],
    })).rejects.toThrow(/changed during meeting creation/);
    expect(committed.meetings).toHaveLength(0);
    expect(committed.bookings).toHaveLength(0);
  });
});
