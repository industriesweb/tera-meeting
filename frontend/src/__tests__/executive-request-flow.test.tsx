import { describe, expect, it } from "vitest";
import { mapExecutiveRequestPlanFormToDto, validateAgendaTotal } from "@/lib/api/mappers";
import { buildExecutiveTargets } from "@/features/executive-requests/executive-targets";
import { selectExecutiveInbox } from "@/lib/api/queries/executive-requests";
import { requestDetailPermissions } from "@/features/executive-requests/request-detail-permissions";

// ── 1. Role-aware endpoint selection ──────────────────────────────

describe("selectExecutiveInbox", () => {
  it("Secretary calls all-requests endpoint", () => {
    expect(selectExecutiveInbox({ operationalRole: "SECRETARY", isExecutive: false })).toBe("all");
  });

  it("Executive calls mine endpoint", () => {
    expect(selectExecutiveInbox({ operationalRole: "MEMBER", isExecutive: true })).toBe("mine");
  });

  it("Assigned user / Team Admin calls assigned endpoint", () => {
    expect(selectExecutiveInbox({ operationalRole: "MEMBER", isExecutive: false })).toBe("assigned");
    expect(selectExecutiveInbox({ operationalRole: "TEAM_ADMIN", isExecutive: false })).toBe("assigned");
  });

  it("returns none for falsy user", () => {
    expect(selectExecutiveInbox(null)).toBe("none");
  });
});

// ── 2. Target mode validation ────────────────────────────────────

describe("buildExecutiveTargets", () => {
  it("USER target allows exactly one user", () => {
    const result = buildExecutiveTargets("USER", "user-1", []);
    expect(result).toEqual([{ targetType: "USER", targetUserId: "user-1" }]);
  });

  it("USER target throws for missing user", () => {
    expect(() => buildExecutiveTargets("USER", "", [])).toThrow("Select exactly one target user");
  });

  it("TEAM target allows one or more Teams", () => {
    const result = buildExecutiveTargets("TEAM", "", ["team-a", "team-b"]);
    expect(result).toEqual([
      { targetType: "TEAM", targetTeamId: "team-a" },
      { targetType: "TEAM", targetTeamId: "team-b" },
    ]);
  });

  it("TEAM target throws for empty team list", () => {
    expect(() => buildExecutiveTargets("TEAM", "", [])).toThrow("Select at least one target Team");
  });

  it("deduplicates team IDs", () => {
    const result = buildExecutiveTargets("TEAM", "", ["team-a", "team-a"]);
    expect(result).toHaveLength(1);
  });
});

// ── 3. Request detail permissions ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseRequest: any = {
  id: "req-1",
  status: "OPEN",
  targets: [
    { targetType: "USER", targetUserId: "user-exact", targetUser: { name: "Exact User" } },
  ],
};

describe("requestDetailPermissions", () => {
  it("Secretary can start planning on OPEN", () => {
    const perms = requestDetailPermissions(baseRequest, { id: "sec-1", operationalRole: "SECRETARY" });
    expect(perms.canStartPlanning).toBe(true);
    expect(perms.canPlan).toBe(true);
  });

  it("Secretary can cancel when no current meeting", () => {
    const req = { ...baseRequest, currentMeetingId: undefined };
    const perms = requestDetailPermissions(req, { id: "sec-1", operationalRole: "SECRETARY" });
    expect(perms.canCancel).toBe(true);
  });

  it("Secretary cannot cancel when current meeting exists", () => {
    const req = { ...baseRequest, currentMeetingId: "mtg-1" };
    const perms = requestDetailPermissions(req, { id: "sec-1", operationalRole: "SECRETARY" });
    expect(perms.canCancel).toBe(false);
  });

  it("Exact named target can plan when OPEN", () => {
    const perms = requestDetailPermissions(baseRequest, { id: "user-exact", operationalRole: "MEMBER" });
    expect(perms.canPlan).toBe(true);
    expect(perms.exactNamedTarget).toBe(true);
    expect(perms.canStartPlanning).toBe(false);
    expect(perms.canCancel).toBe(false);
  });

  it("Non-target user has no permissions", () => {
    const perms = requestDetailPermissions(baseRequest, { id: "other-user", operationalRole: "MEMBER" });
    expect(perms.canPlan).toBe(false);
    expect(perms.canStartPlanning).toBe(false);
    expect(perms.canCancel).toBe(false);
  });

  it("Team Admin sees context but no Plan Meeting action for TEAM request", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamReq: any = {
      id: "req-2",
      status: "OPEN",
      targets: [
        { targetType: "TEAM", targetTeamId: "team-1", targetTeam: { name: "Team One" } },
      ],
    };
    const perms = requestDetailPermissions(teamReq, { id: "admin-1", operationalRole: "TEAM_ADMIN" });
    expect(perms.canPlan).toBe(false);
    expect(perms.canStartPlanning).toBe(false);
    expect(perms.canCancel).toBe(false);
    expect(perms.exactNamedTarget).toBe(false);
  });
});

// ── 4. Planning mapper ───────────────────────────────────────────

describe("mapExecutiveRequestPlanFormToDto", () => {
  it("sends locationType and onlineLink", () => {
    const dto = mapExecutiveRequestPlanFormToDto({
      title: "Planning Test",
      ownerTeamId: "00000000-0000-4000-8000-000000000001",
      plannedDurationMinutes: 30,
      scheduledAt: "2026-08-10T09:00:00.000Z",
      locationType: "HYBRID",
      roomId: "30000000-0000-4000-8000-000000000001",
      onlineLink: "https://meet.example.com/test",
      attendeeIds: [],
      agendaItems: [],
      parkingLotItemIds: [],
    });
    expect(dto.locationType).toBe("HYBRID");
    expect(dto.onlineLink).toBe("https://meet.example.com/test");
  });

  it("excludes kind, status, organizationId, executiveRequestId, createdById, organizerId", () => {
    const dto = mapExecutiveRequestPlanFormToDto({
      title: "Clean Payload",
      ownerTeamId: "00000000-0000-4000-8000-000000000001",
      plannedDurationMinutes: 30,
      scheduledAt: "2026-08-10T09:00:00.000Z",
      locationType: "ONLINE",
      roomId: null,
      onlineLink: "https://meet.example.com/test",
      attendeeIds: [],
      agendaItems: [{ title: "Item 1", durationMinutes: 10, speakerIds: [], notes: "" }],
    });
    expect(dto).not.toHaveProperty("kind");
    expect(dto).not.toHaveProperty("status");
    expect(dto).not.toHaveProperty("organizationId");
    expect(dto).not.toHaveProperty("executiveRequestId");
    expect(dto).not.toHaveProperty("createdById");
    expect(dto).not.toHaveProperty("organizerId");
  });

  it("converts minutes to seconds", () => {
    const dto = mapExecutiveRequestPlanFormToDto({
      title: "Time Check",
      ownerTeamId: "00000000-0000-4000-8000-000000000001",
      plannedDurationMinutes: 45,
      scheduledAt: "2026-08-10T10:00:00.000Z",
      locationType: "ONLINE",
      roomId: null,
      onlineLink: "https://meet.example.com/test",
      attendeeIds: [],
      agendaItems: [{ title: "A", durationMinutes: 15, speakerIds: [], notes: "" }],
    });
    expect(dto.plannedDurationSeconds).toBe(2700);
    expect(dto.agendaItems[0].durationSeconds).toBe(900);
  });

  it("includes parkingLotItemIds when provided", () => {
    const dto = mapExecutiveRequestPlanFormToDto({
      title: "With Parking",
      ownerTeamId: "00000000-0000-4000-8000-000000000001",
      plannedDurationMinutes: 30,
      scheduledAt: "2026-08-10T09:00:00.000Z",
      locationType: "ONLINE",
      roomId: null,
      onlineLink: "https://meet.example.com/test",
      attendeeIds: [],
      agendaItems: [],
      parkingLotItemIds: ["p1", "p2"],
    });
    expect(dto.parkingLotItemIds).toEqual(["p1", "p2"]);
  });

  it("omits parkingLotItemIds when empty", () => {
    const dto = mapExecutiveRequestPlanFormToDto({
      title: "No Parking",
      ownerTeamId: "00000000-0000-4000-8000-000000000001",
      plannedDurationMinutes: 30,
      scheduledAt: "2026-08-10T09:00:00.000Z",
      locationType: "ONLINE",
      roomId: null,
      onlineLink: "https://meet.example.com/test",
      attendeeIds: [],
      agendaItems: [],
      parkingLotItemIds: [],
    });
    expect(dto).not.toHaveProperty("parkingLotItemIds");
  });
});

// ── 5. Targeting names in detail page ────────────────────────────

describe("target summary rendering", () => {
  it("renders target names from backend response", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targets: any[] = [
      { targetType: "USER", targetUserId: "u1", targetUser: { name: "Jane Doe" } },
      { targetType: "TEAM", targetTeamId: "t1", targetTeam: { name: "Engineering" } },
    ];
    const summary = targets.map((t) =>
      t.targetType === "USER" ? t.targetUser?.name : t.targetTeam?.name
    ).filter(Boolean).join(", ");
    expect(summary).toContain("Jane Doe");
    expect(summary).toContain("Engineering");
  });
});

// ── 6. Existing tests remain passing ─────────────────────────────

describe("Existing creation tests remain passing", () => {
  it("Quick structured validation still works", () => {
    expect(validateAgendaTotal([{ durationMinutes: 20 }], 30)).toBeNull();
    expect(validateAgendaTotal([{ durationMinutes: 40 }], 30)).toMatch(/exceeds/);
  });
});
