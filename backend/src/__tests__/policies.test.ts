import { describe, it, expect, beforeAll, vi } from "vitest";
import type { OperationalRole } from "@prisma/client";

vi.mock("../config/database", () => ({
  prisma: {
    meeting: { findUnique: vi.fn() },
    meetingAttendee: { findFirst: vi.fn() },
    agendaItem: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    functionalTeam: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    room: { findFirst: vi.fn(), create: vi.fn() },
    roomBooking: { findFirst: vi.fn() },
    executiveRequest: { findUnique: vi.fn() },
    auditEvent: { create: vi.fn(), findMany: vi.fn() },
    notification: { createMany: vi.fn() },
  },
}));

let mockPrisma: any;

const baseMeeting = {
  id: "meeting-1",
  title: "Test Meeting",
  status: "Draft" as const,
  plannedDurationSeconds: 3600,
  organizationId: "org-1",
  ownerTeamId: "team-a",
  createdById: "creator-1",
  kind: "STRUCTURED",
};

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "user-1",
    email: "user@test.com",
    name: "Test User",
    operationalRole: "MEMBER" as OperationalRole,
    isExecutive: false,
    organizationId: "org-1",
    functionalTeamId: null as string | null,
    isActive: true,
    ...overrides,
  };
}

describe("Phase 2c — canViewMeeting policy", () => {
  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("Executive cannot view an unrelated meeting", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue(baseMeeting);
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "exec-1", isExecutive: true }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    expect(await canViewMeeting("meeting-1", "exec-1")).toBe(false);
  });

  it("Executive cannot view a meeting they personally created (before ER linkage)", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, createdById: "exec-1" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "exec-1", isExecutive: true }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    expect(await canViewMeeting("meeting-1", "exec-1")).toBe(false);
  });

  it("Executive can view meeting where they are the request creator", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, createdById: "other", executiveRequestId: "er-1" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "exec-1", isExecutive: true }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    mockPrisma.executiveRequest.findUnique.mockResolvedValue({ createdByExecutiveId: "exec-1" });
    expect(await canViewMeeting("meeting-1", "exec-1")).toBe(true);
  });

  it("Executive can view meeting where they are an attendee", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, createdById: "other" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "exec-1", isExecutive: true }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue({ meetingId: "meeting-1", userId: "exec-1" });
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    expect(await canViewMeeting("meeting-1", "exec-1")).toBe(true);
  });

  it("Secretary can view every meeting in their organization", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, createdById: "other-user" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "sec-1", operationalRole: "SECRETARY", organizationId: "org-1" }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    expect(await canViewMeeting("meeting-1", "sec-1")).toBe(true);
  });

  it("Team Admin cannot view a meeting owned by another team", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, ownerTeamId: "team-b", createdById: "other" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    expect(await canViewMeeting("meeting-1", "admin-1")).toBe(false);
  });

  it("Team Admin can view a meeting owned by their own team", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, ownerTeamId: "team-a", createdById: "other" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue(null);
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    expect(await canViewMeeting("meeting-1", "admin-1")).toBe(true);
  });

  it("Member can view meeting where they are an attendee", async () => {
    const { canViewMeeting } = await import("../policies/meeting-policy");
    mockPrisma.meeting.findUnique.mockResolvedValue({ ...baseMeeting, createdById: "other" });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "member-1" }));
    mockPrisma.meetingAttendee.findFirst.mockResolvedValue({ meetingId: "meeting-1", userId: "member-1" });
    mockPrisma.agendaItem.findFirst.mockResolvedValue(null);
    expect(await canViewMeeting("meeting-1", "member-1")).toBe(true);
  });
});

describe("Phase 2c — canCreateMeeting policy", () => {
  it("Member cannot create a meeting", async () => {
    const policy = await import("../policies/access-policy");
    const user = makeUser({ id: "member-1" });
    expect(policy.canCreateMeeting(user, { ownerTeamId: "team-a" })).toBe(false);
  });

  it("Teamless Member cannot create a meeting", async () => {
    const policy = await import("../policies/access-policy");
    const user = makeUser({ id: "member-1", functionalTeamId: null });
    expect(policy.canCreateMeeting(user, { ownerTeamId: "team-a" })).toBe(false);
  });

  it("Secretary can create a meeting for any team in their organization", async () => {
    const policy = await import("../policies/access-policy");
    const secUser = makeUser({ id: "sec-1", operationalRole: "SECRETARY", functionalTeamId: null });
    expect(policy.canCreateMeeting(secUser, { ownerTeamId: "team-a" })).toBe(true);
    expect(policy.canCreateMeeting(secUser, { ownerTeamId: "team-b" })).toBe(true);
    expect(policy.canCreateMeeting(secUser, { ownerTeamId: null })).toBe(true);
    expect(policy.canCreateMeeting(secUser)).toBe(true);
  });

  it("Team Admin can create a meeting for their own team", async () => {
    const policy = await import("../policies/access-policy");
    const admin = makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" });
    expect(policy.canCreateMeeting(admin, { ownerTeamId: "team-a" })).toBe(true);
  });

  it("Team Admin cannot create a meeting for another team", async () => {
    const policy = await import("../policies/access-policy");
    const admin = makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" });
    expect(policy.canCreateMeeting(admin, { ownerTeamId: "team-b" })).toBe(false);
  });

  it("Team Admin without functionalTeamId cannot create meetings", async () => {
    const policy = await import("../policies/access-policy");
    const admin = makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: null });
    expect(policy.canCreateMeeting(admin, { ownerTeamId: "team-a" })).toBe(false);
  });

  it("Executive cannot create a generic meeting", async () => {
    const policy = await import("../policies/access-policy");
    const execUser = makeUser({ id: "exec-1", isExecutive: true, operationalRole: "MEMBER" });
    expect(policy.canCreateMeeting(execUser, { ownerTeamId: "team-a" })).toBe(false);
  });
});

describe("Phase 2c — teams service", () => {
  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("Team Admin cannot add a user already assigned to another team", async () => {
    const service = await import("../modules/teams/teams.service");
    mockPrisma.functionalTeam.findUnique.mockResolvedValue({ id: "team-a", name: "Team A", organizationId: "org-1", deletedAt: null });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-2", functionalTeamId: "team-b" }));
    await expect(service.addTeamMember("team-a", "user-2", "actor-1")).rejects.toThrow();
  });

  it("Team Admin can add a currently teamless user to their own team", async () => {
    const service = await import("../modules/teams/teams.service");
    mockPrisma.functionalTeam.findUnique.mockResolvedValue({ id: "team-a", name: "Team A", organizationId: "org-1", isActive: true });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-3", functionalTeamId: null }));
    mockPrisma.user.update.mockResolvedValue(makeUser({ id: "user-3", functionalTeamId: "team-a" }));
    const result = await service.addTeamMember("team-a", "user-3", "actor-1");
    expect(result.functionalTeamId).toBe("team-a");
  });

  it("Cross-organization team assignment fails", async () => {
    const service = await import("../modules/teams/teams.service");
    mockPrisma.functionalTeam.findUnique.mockResolvedValue({ id: "team-a", name: "Team A", organizationId: "org-1", isActive: true });
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-4", organizationId: "org-2" }));
    await expect(service.addTeamMember("team-a", "user-4", "actor-1")).rejects.toThrow();
  });

  it("Teamless Secretary can still manage the organization", async () => {
    const policy = await import("../policies/access-policy");
    const secUser = makeUser({ id: "sec-1", operationalRole: "SECRETARY", functionalTeamId: null });
    expect(policy.canManageOrganization(secUser)).toBe(true);
    expect(policy.isSecretary(secUser)).toBe(true);
  });
});

describe("Phase 6b — Secretary demotion guard", () => {
  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("1. Last secretary in org cannot be demoted", async () => {
    const service = await import("../modules/users/users.service");
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "sec-1", operationalRole: "SECRETARY", isActive: true }));
    mockPrisma.user.count.mockResolvedValue(0); // no other secretaries
    await expect(service.updateUser("sec-1", { operationalRole: "MEMBER" }, "actor-1")).rejects.toThrow(
      "Cannot demote the last secretary",
    );
  });

  it("2. Secretary can be demoted when another secretary exists", async () => {
    const service = await import("../modules/users/users.service");
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "sec-1", operationalRole: "SECRETARY", isActive: true }));
    mockPrisma.user.count.mockResolvedValue(1); // one other secretary exists
    mockPrisma.user.update.mockResolvedValue(makeUser({ id: "sec-1", operationalRole: "MEMBER" }));
    const result = await service.updateUser("sec-1", { operationalRole: "MEMBER" }, "actor-1");
    expect(result.operationalRole).toBe("MEMBER");
  });
});

describe("Phase 6.1 — buildMeetingVisibilityFilter OR-branch correctness", () => {
  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("1. Team Admin sees a meeting they attend in another Team", async () => {
    const { buildMeetingVisibilityFilter } = await import("../policies/meeting-visibility");
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }),
    );
    const filter = await buildMeetingVisibilityFilter("admin-1");
    const orClauses = (filter as any).OR;
    // Baseline attendee branch covers cross-team attendance
    expect(orClauses).toContainEqual({ attendees: { some: { userId: "admin-1", removedAt: null } } });
    // ownerTeam is an additional OR branch, not an AND restriction
    expect(orClauses).toContainEqual({ ownerTeamId: "team-a" });
    expect(filter).not.toHaveProperty("AND");
  });

  it("2. Team Admin sees an owner-Team meeting even when not attendee", async () => {
    const { buildMeetingVisibilityFilter } = await import("../policies/meeting-visibility");
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }),
    );
    const filter = await buildMeetingVisibilityFilter("admin-1");
    const orClauses = (filter as any).OR;
    // ownerTeam is a standalone OR branch
    expect(orClauses).toContainEqual({ ownerTeamId: "team-a" });
    // Baseline branches are still present
    expect(orClauses).toContainEqual({ organizerId: "admin-1" });
    expect(orClauses).toContainEqual({ attendees: { some: { userId: "admin-1", removedAt: null } } });
    expect(filter).not.toHaveProperty("AND");
  });

  it("3. Executive sees a meeting they attend that is not linked to their request", async () => {
    const { buildMeetingVisibilityFilter } = await import("../policies/meeting-visibility");
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({ id: "exec-1", operationalRole: "MEMBER", isExecutive: true }),
    );
    const filter = await buildMeetingVisibilityFilter("exec-1");
    const orClauses = (filter as any).OR;
    // Baseline attendee branch covers attendance regardless of ER linkage
    expect(orClauses).toContainEqual({ attendees: { some: { userId: "exec-1", removedAt: null } } });
    // executiveRequest is an additional OR branch
    expect(orClauses).toContainEqual({ executiveRequest: { createdByExecutiveId: "exec-1" } });
    expect(filter).not.toHaveProperty("AND");
  });

  it("4. Executive sees their own Executive Request-linked meeting even if not attendee", async () => {
    const { buildMeetingVisibilityFilter } = await import("../policies/meeting-visibility");
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({ id: "exec-1", operationalRole: "MEMBER", isExecutive: true }),
    );
    const filter = await buildMeetingVisibilityFilter("exec-1");
    const orClauses = (filter as any).OR;
    // executiveRequest is a standalone OR branch independent of attendance
    expect(orClauses).toContainEqual({ executiveRequest: { createdByExecutiveId: "exec-1" } });
    expect(filter).not.toHaveProperty("AND");
  });
});

describe("Phase 6b — Room duplicate name check", () => {
  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("3. Room created successfully with unique name", async () => {
    const service = await import("../modules/rooms/rooms.service");
    mockPrisma.room.findFirst.mockResolvedValue(null);
    mockPrisma.room.create.mockResolvedValue({ id: "r-new", name: "New Room", organizationId: "org-1", isActive: true });
    mockPrisma.auditEvent.create.mockResolvedValue({});
    const result = await service.createRoom("org-1", "New Room", "actor-1");
    expect(result.name).toBe("New Room");
  });
});
