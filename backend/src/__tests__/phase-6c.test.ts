import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "../common/errors/app-error";

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  meeting: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  functionalTeam: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
}));

vi.mock("../config/database", () => ({ prisma: mockPrisma }));

function makeScheduledMeeting(overrides: Record<string, any> = {}) {
  return {
    id: "m-1", title: "Test", status: "SCHEDULED", kind: "QUICK_TEAM",
    scheduledAt: new Date("2026-07-07T10:00:00Z"), plannedDurationSeconds: 1800,
    actualDurationSeconds: null, locationType: "PHYSICAL",
    room: { id: "r-1", name: "Room A" }, roomId: "r-1",
    ownerTeamId: "team-a", ownerTeam: { id: "team-a", name: "Team A" },
    organizerId: "org-1", organizer: { id: "org-1", name: "Organizer" },
    createdById: "user-1", attendees: [{ userId: "user-1" }],
    onlineLink: null, endedAt: null, lockedAt: null,
    ...overrides,
  };
}

describe("Phase 6.2 — Browse and Calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Browse response uses shared visibility policy", async () => {
    const browseCallUser = { organizationId: "org-1", operationalRole: "SECRETARY" };
    const policyCallUser = {
      id: "user-1", organizationId: "org-1", functionalTeamId: null,
      operationalRole: "SECRETARY", isExecutive: false,
    };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(browseCallUser)
      .mockResolvedValueOnce(policyCallUser);

    mockPrisma.meeting.findMany.mockResolvedValue([]);
    mockPrisma.meeting.count.mockResolvedValue(0);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    await browseMeetings("user-1", { limit: 20 });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
    const findManyCalls = mockPrisma.meeting.findMany.mock.calls;
    expect(findManyCalls.length).toBeGreaterThan(0);
    const whereArg = findManyCalls[0][0].where;
    expect(whereArg).toHaveProperty("organizationId", "org-1");
  });

  it("2. Removed attendee cannot see a meeting through browse", async () => {
    const browseCallUser = { organizationId: "org-1", operationalRole: "MEMBER" };
    const policyCallUser = {
      id: "member-1", organizationId: "org-1", functionalTeamId: "team-a",
      operationalRole: "MEMBER", isExecutive: false,
    };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(browseCallUser)
      .mockResolvedValueOnce(policyCallUser);

    mockPrisma.meeting.findMany.mockResolvedValue([]);
    mockPrisma.meeting.count.mockResolvedValue(0);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    const result = await browseMeetings("member-1", { limit: 20 });

    expect(result.items).toHaveLength(0);

    const findManyCalls = mockPrisma.meeting.findMany.mock.calls;
    const whereArg = findManyCalls[0][0].where;
    const orClauses = whereArg.OR as any[];
    expect(orClauses).toBeDefined();
    expect(orClauses).toContainEqual(
      { attendees: { some: { userId: "member-1", removedAt: null } } },
    );
  });

  it("3. Team Admin cross-team attendance remains visible", async () => {
    const browseCallUser = { organizationId: "org-1", operationalRole: "TEAM_ADMIN" };
    const policyCallUser = {
      id: "admin-1", organizationId: "org-1", functionalTeamId: "team-a",
      operationalRole: "TEAM_ADMIN", isExecutive: false,
    };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(browseCallUser)
      .mockResolvedValueOnce(policyCallUser);

    const meetingInTeamB = {
      id: "m-1", title: "Cross-team meeting", status: "SCHEDULED", kind: "QUICK_TEAM",
      scheduledAt: new Date("2026-07-07T10:00:00Z"), plannedDurationSeconds: 1800,
      actualDurationSeconds: null, locationType: "PHYSICAL",
      room: { id: "r-1", name: "Room A" }, roomId: "r-1", ownerTeamId: "team-b", organizerId: "other",
      createdById: "other",
      ownerTeam: { id: "team-b", name: "Team B" },
      organizer: { id: "other", name: "Other" },
      attendees: [{ userId: "admin-1" }],
    };
    mockPrisma.meeting.findMany.mockResolvedValue([meetingInTeamB]);
    mockPrisma.meeting.count.mockResolvedValue(1);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    const result = await browseMeetings("admin-1", { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("m-1");
    expect(result.totalVisible).toBe(1);

    const findManyCalls = mockPrisma.meeting.findMany.mock.calls;
    const whereArg = findManyCalls[0][0].where;
    const orClauses = whereArg.OR as any[];
    expect(orClauses).toContainEqual({ ownerTeamId: "team-a" });
  });

  it("4. Executive direct attendance remains visible even without request linkage", async () => {
    const browseCallUser = { organizationId: "org-1", operationalRole: "MEMBER" };
    const policyCallUser = {
      id: "exec-1", organizationId: "org-1", functionalTeamId: null,
      operationalRole: "MEMBER", isExecutive: true,
    };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(browseCallUser)
      .mockResolvedValueOnce(policyCallUser);

    const execAttendeeMeeting = {
      id: "m-2", title: "Exec attended", status: "SCHEDULED", kind: "STRUCTURED",
      scheduledAt: new Date("2026-07-08T14:00:00Z"), plannedDurationSeconds: 3600,
      actualDurationSeconds: null, locationType: "ONLINE",
      room: null, roomId: null, ownerTeamId: "team-a", organizerId: "other",
      createdById: "other",
      ownerTeam: { id: "team-a", name: "Team A" },
      organizer: { id: "other", name: "Other" },
      attendees: [{ userId: "exec-1" }],
    };
    mockPrisma.meeting.findMany.mockResolvedValue([execAttendeeMeeting]);
    mockPrisma.meeting.count.mockResolvedValue(1);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    const result = await browseMeetings("exec-1", { limit: 20 });

    expect(result.items).toHaveLength(1);

    const findManyCalls = mockPrisma.meeting.findMany.mock.calls;
    const whereArg = findManyCalls[0][0].where;
    const orClauses = whereArg.OR as any[];
    expect(orClauses).toContainEqual(
      { attendees: { some: { userId: "exec-1", removedAt: null } } },
    );
  });

  it("5. Search filters title only", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    const matchingMeeting = {
      id: "m-search-1", title: "Sprint Review", status: "SCHEDULED", kind: "QUICK_TEAM",
      scheduledAt: new Date(), plannedDurationSeconds: 1800, actualDurationSeconds: null,
      locationType: "ONLINE", room: null, roomId: null,
      ownerTeamId: "team-a", organizerId: "org-1", createdById: "user-1",
      ownerTeam: { id: "team-a", name: "Team A" },
      organizer: { id: "org-1", name: "Organizer" },
      attendees: [],
    };
    mockPrisma.meeting.findMany.mockImplementation((args: any) => {
      if (args.where?.title?.contains === "Sprint") return [matchingMeeting];
      return [];
    });
    mockPrisma.meeting.count.mockImplementation((args: any) => {
      if (args.where?.title?.contains === "Sprint") return 1;
      return 0;
    });
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    const result = await browseMeetings("user-1", { search: "Sprint", limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Sprint Review");
    expect(mockPrisma.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          title: { contains: "Sprint", mode: "insensitive" },
        }),
      }),
    );
  });

  it("6. Status filter validates and works", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    const scheduledMeetings = [
      {
        id: "m-s1", title: "Standup", status: "SCHEDULED", kind: "QUICK_TEAM",
        scheduledAt: new Date(), plannedDurationSeconds: 900, actualDurationSeconds: null,
        locationType: "ONLINE", room: null, roomId: null,
        ownerTeamId: "team-a", organizerId: "org-1", createdById: "user-1",
        ownerTeam: { id: "team-a", name: "Team A" },
        organizer: { id: "org-1", name: "Organizer" },
        attendees: [],
      },
      {
        id: "m-s2", title: "Workshop", status: "SCHEDULED", kind: "STRUCTURED",
        scheduledAt: new Date(), plannedDurationSeconds: 3600, actualDurationSeconds: null,
        locationType: "ONLINE", room: null, roomId: null,
        ownerTeamId: "team-a", organizerId: "org-1", createdById: "user-1",
        ownerTeam: { id: "team-a", name: "Team A" },
        organizer: { id: "org-1", name: "Organizer" },
        attendees: [],
      },
    ];
    mockPrisma.meeting.findMany.mockResolvedValue(scheduledMeetings);
    mockPrisma.meeting.count.mockResolvedValue(2);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    const result = await browseMeetings("user-1", { statuses: "SCHEDULED", limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(mockPrisma.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["SCHEDULED"] },
        }),
      }),
    );
  });

  it("7. Kind filter validates and works", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    const quickTeamMeeting = {
      id: "m-k1", title: "Quick Sync", status: "SCHEDULED", kind: "QUICK_TEAM",
      scheduledAt: new Date(), plannedDurationSeconds: 600, actualDurationSeconds: null,
      locationType: "ONLINE", room: null, roomId: null,
      ownerTeamId: "team-a", organizerId: "org-1", createdById: "user-1",
      ownerTeam: { id: "team-a", name: "Team A" },
      organizer: { id: "org-1", name: "Organizer" },
      attendees: [],
    };
    mockPrisma.meeting.findMany.mockResolvedValue([quickTeamMeeting]);
    mockPrisma.meeting.count.mockResolvedValue(1);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    const result = await browseMeetings("user-1", { kinds: "QUICK_TEAM", limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("QUICK_TEAM");
    expect(mockPrisma.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: { in: ["QUICK_TEAM"] },
        }),
      }),
    );
  });

  it("8. Cursor pagination has no duplicate records", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    const makeMeeting = (id: string, scheduledAt: Date) => ({
      id, title: `Meeting ${id}`, status: "SCHEDULED", kind: "QUICK_TEAM",
      scheduledAt, plannedDurationSeconds: 1800, actualDurationSeconds: null,
      locationType: "ONLINE", room: null, roomId: null,
      ownerTeamId: "team-a", organizerId: "org-1", createdById: "user-1",
      ownerTeam: { id: "team-a", name: "Team A" },
      organizer: { id: "org-1", name: "Organizer" },
      attendees: [],
    });

    const t1 = new Date("2026-07-07T09:00:00Z");
    const t2 = new Date("2026-07-07T10:00:00Z");
    const t3 = new Date("2026-07-07T11:00:00Z");

    async function runPage1() {
      mockPrisma.meeting.findUnique.mockReset();
      mockPrisma.user.findUnique
        .mockResolvedValue({ organizationId: "org-1", operationalRole: "SECRETARY" });
      mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

      mockPrisma.meeting.findMany.mockResolvedValue([
        makeMeeting("m-page1-a", t1),
        makeMeeting("m-page1-b", t2),
        makeMeeting("m-page1-c", t3),
      ]);
      mockPrisma.meeting.count.mockResolvedValue(3);

      const { browseMeetings } = await import("../modules/meetings/meetings.service");
      return browseMeetings("user-1", { limit: 2 });
    }

    const page1 = await runPage1();
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page1Ids = new Set(page1.items.map((i) => i.id));

    async function runPage2(cursor: string) {
      mockPrisma.user.findUnique.mockReset();
      mockPrisma.meeting.findUnique.mockReset();
      mockPrisma.meeting.findMany.mockReset();
      mockPrisma.meeting.count.mockReset();

      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
        .mockResolvedValueOnce({
          id: "user-1", organizationId: "org-1", functionalTeamId: null,
          operationalRole: "SECRETARY", isExecutive: false,
        });
      mockPrisma.meeting.findMany.mockResolvedValue([
        makeMeeting("m-page2-c", t3),
      ]);
      mockPrisma.meeting.count.mockResolvedValue(3);
      mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

      const { browseMeetings } = await import("../modules/meetings/meetings.service");
      return browseMeetings("user-1", { limit: 2, cursor });
    }

    const page2 = await runPage2(page1.nextCursor!);
    expect(page2.items).toHaveLength(1);

    const page2Ids = new Set(page2.items.map((i) => i.id));
    for (const id of page1Ids) {
      expect(page2Ids.has(id)).toBe(false);
    }
  });

  it("9. Browse response never includes notes, onlineLink, or raw internal relations", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    const fullMeeting = {
      id: "m-full-1", title: "Full Meeting", status: "SCHEDULED", kind: "QUICK_TEAM",
      scheduledAt: new Date(), plannedDurationSeconds: 1800, actualDurationSeconds: null,
      locationType: "PHYSICAL", onlineLink: "https://zoom.us/j/123",
      room: { id: "r-1", name: "Room A" }, roomId: "r-1",
      ownerTeamId: "team-a", ownerTeam: { id: "team-a", name: "Team A" },
      organizerId: "org-1", organizer: { id: "org-1", name: "Organizer" },
      createdById: "user-1", attendees: [{ userId: "user-1" }],
    };
    mockPrisma.meeting.findMany.mockResolvedValue([fullMeeting]);
    mockPrisma.meeting.count.mockResolvedValue(1);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    const result = await browseMeetings("user-1", { limit: 20 });

    expect(result.items).toHaveLength(1);
    const item = result.items[0] as any;
    expect(item.onlineLink).toBeUndefined();
    expect(item.notes).toBeUndefined();
    expect(item.createdById).toBeUndefined();
    expect(item.organizerId).toBeUndefined();
    expect(item.ownerTeamId).toBeUndefined();
    expect(item.attendees).toBeUndefined();
  });

  it("10. Calendar date uses Organization timezone", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.organization.findUnique.mockResolvedValue({
      id: "org-1", timezone: "America/New_York",
    });

    mockPrisma.meeting.findMany.mockResolvedValue([]);

    const { getDayCalendar } = await import("../modules/calendar/calendar.service");
    await getDayCalendar("user-1", "2026-07-07");

    const findManyCalls = mockPrisma.meeting.findMany.mock.calls;
    expect(findManyCalls.length).toBeGreaterThan(0);
    const whereArg = findManyCalls[0][0].where;

    expect(whereArg.scheduledAt.gte).toBeInstanceOf(Date);
    expect(whereArg.scheduledAt.lt).toBeInstanceOf(Date);

    const gte = whereArg.scheduledAt.gte as Date;
    const lt = whereArg.scheduledAt.lt as Date;
    const diffHours = (lt.getTime() - gte.getTime()) / 3600000;
    expect(diffHours).toBeGreaterThan(96);
    expect(diffHours).toBeLessThan(145);
  });

  it("11. Calendar includes a meeting that overlaps midnight correctly", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.organization.findUnique.mockResolvedValue({
      id: "org-1", timezone: "UTC",
    });

    const meetingLate = {
      id: "m-late", title: "Late Meeting", status: "SCHEDULED", kind: "QUICK_TEAM",
      scheduledAt: new Date("2026-07-06T23:00:00Z"),
      plannedDurationSeconds: 7200, actualDurationSeconds: null,
      locationType: "ONLINE", room: null, roomId: null,
      ownerTeamId: "team-a", ownerTeam: { id: "team-a", name: "Team A" },
      organizerId: "org-1", organizer: { id: "org-1", name: "Organizer" },
      createdById: "user-1", attendees: [],
    };

    mockPrisma.meeting.findMany.mockResolvedValue([meetingLate]);

    const { getDayCalendar } = await import("../modules/calendar/calendar.service");
    const result = await getDayCalendar("user-1", "2026-07-06");

    expect(result.meetings).toHaveLength(1);
    expect(result.meetings[0].id).toBe("m-late");
    const endsAt = new Date(result.meetings[0].endsAt);
    const startsAt = new Date(result.meetings[0].startsAt);
    expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime());
    expect(endsAt.toISOString().startsWith("2026-07-07")).toBe(true);
  });

  it("12. Calendar excludes DRAFT and CANCELLED by default", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.organization.findUnique.mockResolvedValue({
      id: "org-1", timezone: "UTC",
    });

    mockPrisma.meeting.findMany.mockResolvedValue([]);

    const { getDayCalendar } = await import("../modules/calendar/calendar.service");
    const result = await getDayCalendar("user-1", "2026-07-07");

    const findManyCalls = mockPrisma.meeting.findMany.mock.calls;
    const whereArg = findManyCalls[0][0].where;
    expect(whereArg.status).toEqual({
      in: ["SCHEDULED", "IN_PROGRESS", "ENDED_PENDING_SUMMARY", "COMPLETED_LOCKED"],
    });
    expect(result.meetings).toHaveLength(0);
  });

  it("13. Calendar response returns server-computed endsAt", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.organization.findUnique.mockResolvedValue({
      id: "org-1", timezone: "UTC",
    });

    const activeMeeting = {
      id: "m-active", title: "Active", status: "IN_PROGRESS", kind: "QUICK_TEAM",
      scheduledAt: new Date("2026-07-07T10:00:00Z"),
      plannedDurationSeconds: 3600, actualDurationSeconds: null,
      locationType: "ONLINE", room: null, roomId: null,
      ownerTeamId: "team-a", ownerTeam: { id: "team-a", name: "Team A" },
      organizerId: "org-1", organizer: { id: "org-1", name: "Organizer" },
      createdById: "user-1", attendees: [],
      endedAt: null, lockedAt: null,
    };

    mockPrisma.meeting.findMany.mockResolvedValue([activeMeeting]);

    const { getDayCalendar } = await import("../modules/calendar/calendar.service");
    const result = await getDayCalendar("user-1", "2026-07-07");

    expect(result.meetings).toHaveLength(1);
    const card = result.meetings[0];
    expect(card.startsAt).toBe("2026-07-07T10:00:00.000Z");
    expect(card.endsAt).toBe("2026-07-07T11:00:00.000Z");
    expect(new Date(card.endsAt).getTime()).toBeGreaterThan(new Date(card.startsAt).getTime());
  });
});

describe("Phase 6.2.1 — Contract Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1a. PHYSICAL/HYBRID without room throws ValidationError in browse", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.meeting.findMany.mockResolvedValue([
      makeScheduledMeeting({ locationType: "PHYSICAL", room: null }),
    ]);
    mockPrisma.meeting.count.mockResolvedValue(1);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    await expect(browseMeetings("user-1", { limit: 20 })).rejects.toThrow(ValidationError);
  });

  it("1b. ONLINE with room throws ValidationError in browse", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.meeting.findMany.mockResolvedValue([
      makeScheduledMeeting({ locationType: "ONLINE", room: { id: "r-1", name: "Room A" } }),
    ]);
    mockPrisma.meeting.count.mockResolvedValue(1);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    await expect(browseMeetings("user-1", { limit: 20 })).rejects.toThrow(ValidationError);
  });

  it("1c. HYBRID without room throws ValidationError in browse", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.meeting.findMany.mockResolvedValue([
      makeScheduledMeeting({ locationType: "HYBRID", room: null }),
    ]);
    mockPrisma.meeting.count.mockResolvedValue(1);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    await expect(browseMeetings("user-1", { limit: 20 })).rejects.toThrow(ValidationError);
  });

  it("2a. PHYSICAL without room throws ValidationError in calendar", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", timezone: "UTC" });
    mockPrisma.meeting.findMany.mockResolvedValue([
      makeScheduledMeeting({ locationType: "PHYSICAL", room: null }),
    ]);

    const { getDayCalendar } = await import("../modules/calendar/calendar.service");
    await expect(getDayCalendar("user-1", "2026-07-07")).rejects.toThrow(ValidationError);
  });

  it("2b. ONLINE with room throws ValidationError in calendar", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", timezone: "UTC" });
    mockPrisma.meeting.findMany.mockResolvedValue([
      makeScheduledMeeting({ locationType: "ONLINE", room: { id: "r-1", name: "Room A" } }),
    ]);

    const { getDayCalendar } = await import("../modules/calendar/calendar.service");
    await expect(getDayCalendar("user-1", "2026-07-07")).rejects.toThrow(ValidationError);
  });

  it("3. Opaque cursor encodes and decodes correctly", async () => {
    const { encodeCursor, decodeCursor } = await import("../modules/meetings/meetings.service");
    const payload = {
      version: 1 as const,
      sort: "UPCOMING" as const,
      id: "m-123",
      scheduledAt: "2026-07-07T10:00:00.000Z",
      lockedAt: null as string | null,
      title: "Test Meeting",
    };
    const encoded = encodeCursor(payload);
    expect(encoded).toBeTruthy();
    expect(typeof encoded).toBe("string");

    const decoded = decodeCursor(encoded, "UPCOMING");
    expect(decoded.version).toBe(1);
    expect(decoded.sort).toBe("UPCOMING");
    expect(decoded.id).toBe("m-123");
    expect(decoded.scheduledAt).toBe("2026-07-07T10:00:00.000Z");
    expect(decoded.title).toBe("Test Meeting");
  });

  it("4. Invalid cursor returns 400", async () => {
    const { decodeCursor } = await import("../modules/meetings/meetings.service");
    expect(() => decodeCursor("not-base64!!!", "UPCOMING")).toThrow(ValidationError);
    expect(() => decodeCursor("", "UPCOMING")).toThrow(ValidationError);
    const badVersion = Buffer.from(JSON.stringify({ version: 999, sort: "UPCOMING", id: "m-1" })).toString("base64url");
    expect(() => decodeCursor(badVersion, "UPCOMING")).toThrow(ValidationError);
  });

  it("5. Cursor sort mismatch returns 400", async () => {
    const { encodeCursor, decodeCursor } = await import("../modules/meetings/meetings.service");
    const payload = {
      version: 1 as const,
      sort: "UPCOMING" as const,
      id: "m-1",
      scheduledAt: "2026-07-07T10:00:00.000Z",
      lockedAt: null as string | null,
      title: "Test",
    };
    const encoded = encodeCursor(payload);
    expect(() => decodeCursor(encoded, "RECENT")).toThrow(ValidationError);
    expect(() => decodeCursor(encoded, "TITLE")).toThrow(ValidationError);
  });

  it("6. RECENT pagination has no duplicate or missing records", async () => {
    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    const makeMeeting = (id: string, lockedAt: Date | null) => ({
      id, title: `M${id}`, status: "COMPLETED_LOCKED", kind: "QUICK_TEAM",
      scheduledAt: new Date("2026-07-01T10:00:00Z"), plannedDurationSeconds: 1800,
      actualDurationSeconds: null, locationType: "PHYSICAL",
      room: { id: "r-1", name: "Room A" }, roomId: "r-1",
      ownerTeamId: "team-a", ownerTeam: { id: "team-a", name: "Team A" },
      organizerId: "org-1", organizer: { id: "org-1", name: "Organizer" },
      createdById: "user-1", attendees: [{ userId: "user-1" }],
      lockedAt, endedAt: lockedAt, onlineLink: null,
    });

    const t3 = new Date("2026-07-06T10:00:00Z");

    mockPrisma.meeting.findMany.mockResolvedValueOnce([
      makeMeeting("a", new Date("2026-07-05T10:00:00Z")),
      makeMeeting("b", new Date("2026-07-04T10:00:00Z")),
      makeMeeting("c", new Date("2026-07-04T09:00:00Z")),
    ]);
    mockPrisma.meeting.count.mockResolvedValue(3);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const page1 = await browseMeetings("user-1", { limit: 2, sort: "RECENT" });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    vi.clearAllMocks();
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });
    mockPrisma.meeting.findMany.mockResolvedValueOnce([
      makeMeeting("c", t3),
    ]);
    mockPrisma.meeting.count.mockResolvedValue(3);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const page2 = await browseMeetings("user-1", { limit: 2, sort: "RECENT", cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(1);

    const allIds = new Set([...page1.items.map((i) => i.id), ...page2.items.map((i) => i.id)]);
    expect(allIds.size).toBe(3);
  });

  it("7. TITLE pagination has no duplicate or missing records", async () => {
    const { browseMeetings } = await import("../modules/meetings/meetings.service");
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });

    const makeMeeting = (id: string, title: string) => ({
      id, title, status: "SCHEDULED", kind: "QUICK_TEAM",
      scheduledAt: new Date("2026-07-01T10:00:00Z"), plannedDurationSeconds: 1800,
      actualDurationSeconds: null, locationType: "PHYSICAL",
      room: { id: "r-1", name: "Room A" }, roomId: "r-1",
      ownerTeamId: "team-a", ownerTeam: { id: "team-a", name: "Team A" },
      organizerId: "org-1", organizer: { id: "org-1", name: "Organizer" },
      createdById: "user-1", attendees: [{ userId: "user-1" }],
      onlineLink: null, endedAt: null, lockedAt: null,
    });

    mockPrisma.meeting.findMany.mockResolvedValueOnce([
      makeMeeting("a", "Alpha"),
      makeMeeting("b", "Beta"),
      makeMeeting("c", "Gamma"),
    ]);
    mockPrisma.meeting.count.mockResolvedValue(3);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const page1 = await browseMeetings("user-1", { limit: 2, sort: "TITLE" });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    vi.clearAllMocks();
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", operationalRole: "SECRETARY" })
      .mockResolvedValueOnce({
        id: "user-1", organizationId: "org-1", functionalTeamId: null,
        operationalRole: "SECRETARY", isExecutive: false,
      });
    mockPrisma.meeting.findMany.mockResolvedValueOnce([
      makeMeeting("d", "Delta"),
    ]);
    mockPrisma.meeting.count.mockResolvedValue(3);
    mockPrisma.functionalTeam.findMany.mockResolvedValue([]);

    const page2 = await browseMeetings("user-1", { limit: 2, sort: "TITLE", cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(1);

    const allIds = new Set([...page1.items.map((i) => i.id), ...page2.items.map((i) => i.id)]);
    expect(allIds.size).toBe(3);
  });
});
