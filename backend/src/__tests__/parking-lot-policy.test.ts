import { describe, it, expect, beforeAll, vi, beforeEach } from "vitest";
import type { OperationalRole, ParkingLotStatus, MeetingStatus, MeetingKind } from "@prisma/client";

const mockGetPolicyUser = vi.hoisted(() => vi.fn());

vi.mock("../config/database", () => ({
  prisma: {
    parkingLotItem: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    functionalTeam: { findUnique: vi.fn(), findMany: vi.fn() },
    meeting: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(async (arg: any) => {
      if (typeof arg === "function") {
        const mockTx = {
          parkingLotItem: mockPrisma.parkingLotItem,
          auditEvent: mockPrisma.auditEvent,
          meeting: mockPrisma.meeting,
        };
        return arg(mockTx);
      }
      const results = [];
      for (const fn of arg) {
        results.push(await fn);
      }
      return results;
    }),
  },
}));

vi.mock("../common/utils/resolve-organization", () => ({
  resolveOrganizationId: vi.fn().mockResolvedValue("org-1"),
}));

vi.mock("../policies/access-policy", () => ({
  getPolicyUser: mockGetPolicyUser,
  isSecretary: (u: any) => u?.operationalRole === "SECRETARY",
  isTeamAdmin: (u: any) => u?.operationalRole === "TEAM_ADMIN",
  isMember: (u: any) => (u?.operationalRole ?? "MEMBER") === "MEMBER",
}));

vi.mock("../policies/meeting-visibility", () => ({
  buildMeetingVisibilityFilter: vi.fn().mockResolvedValue({ organizationId: "org-1" }),
}));

let mockPrisma: any;

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "user-1",
    operationalRole: "MEMBER" as OperationalRole,
    isExecutive: false,
    organizationId: "org-1",
    functionalTeamId: "team-a" as string | null,
    ...overrides,
  };
}

function makeItem(overrides: Record<string, any> = {}) {
  return {
    id: "pli-1",
    organizationId: "org-1",
    teamId: "team-a",
    title: "Item",
    note: null,
    createdById: "user-1",
    sourceMeetingId: null,
    status: "PENDING_REVIEW" as ParkingLotStatus,
    reviewedById: null,
    reviewedAt: null,
    agendaMeetingId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const baseTeam = { id: "team-a", name: "Team A", organizationId: "org-1", isActive: true };

function makeMeeting(overrides: Record<string, any> = {}) {
  return {
    id: "mtg-1",
    organizationId: "org-1",
    ownerTeamId: "team-a",
    status: "DRAFT" as MeetingStatus,
    kind: "STRUCTURED" as MeetingKind,
    ...overrides,
  };
}

describe("addToAgenda — required tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (arg: any) => {
      if (typeof arg === "function") {
        const mockTx = {
          parkingLotItem: mockPrisma.parkingLotItem,
          auditEvent: mockPrisma.auditEvent,
          meeting: mockPrisma.meeting,
        };
        return arg(mockTx);
      }
      const results = [];
      for (const fn of arg) {
        results.push(await fn);
      }
      return results;
    });
  });

  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("1. Pending item cannot be added", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "PENDING_REVIEW" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting());

    await expect(service.addToAgenda("pli-1", "mtg-1", "user-1")).rejects.toThrow("Only APPROVED items can be added");
  });

  it("2. Archived item cannot be added", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "ARCHIVED" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting());

    await expect(service.addToAgenda("pli-1", "mtg-1", "user-1")).rejects.toThrow("Only APPROVED items can be added");
  });

  it("3. Used item cannot be added again", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "USED_IN_AGENDA", agendaMeetingId: "mtg-0" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting());

    await expect(service.addToAgenda("pli-1", "mtg-1", "user-1")).rejects.toThrow("Only APPROVED items can be added");
  });

  it("4. Only APPROVED unused item can be added", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    const updatedItem = makeItem({ status: "USED_IN_AGENDA", agendaMeetingId: "mtg-1" });
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting());
    mockPrisma.parkingLotItem.update.mockResolvedValue(updatedItem);
    mockPrisma.auditEvent.create.mockResolvedValue({});

    const result = await service.addToAgenda("pli-1", "mtg-1", "user-1");
    expect(result.status).toBe("USED_IN_AGENDA");
    expect(result.agendaMeetingId).toBe("mtg-1");
  });

  it("5. Quick meeting is rejected", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting({ kind: "QUICK_TEAM" }));

    await expect(service.addToAgenda("pli-1", "mtg-1", "user-1")).rejects.toThrow("Only STRUCTURED meetings can receive parking lot items");
  });

  it("6. In-progress, completed, and cancelled meetings are rejected", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED" }));

    for (const status of ["IN_PROGRESS", "COMPLETED_LOCKED", "CANCELLED"] as MeetingStatus[]) {
      mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting({ status }));
      await expect(service.addToAgenda("pli-1", "mtg-1", "user-1")).rejects.toThrow("Target meeting must be in DRAFT or SCHEDULED status");
    }
  });

  it("7. Cross-Team item-to-meeting attach is rejected", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED", teamId: "team-a" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting({ ownerTeamId: "team-b" }));

    await expect(service.addToAgenda("pli-1", "mtg-1", "user-1")).rejects.toThrow("owner team must match");
  });

  it("8. Cross-Organization attach is rejected", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED", organizationId: "org-1" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting({ organizationId: "org-2" }));

    await expect(service.addToAgenda("pli-1", "mtg-1", "user-1")).rejects.toThrow("same organization");
  });

  it("9. Unauthorized Team Admin is rejected (controller level)", async () => {
    const ctrl = await import("../modules/parking-lot/parking-lot.controller");
    mockGetPolicyUser.mockResolvedValue(makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }));
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED", teamId: "team-b" }));

    const req = { user: { sub: "admin-1" }, params: { id: "pli-1" }, body: { agendaMeetingId: "mtg-1" } } as any;
    const res = { json: vi.fn() } as any;
    const next = vi.fn();

    ctrl.addToAgenda(req, res, next);
    await new Promise((r) => setTimeout(r, 50));
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 })
    );
  });

  it("11. Used item cannot be archived", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "USED_IN_AGENDA" }));

    await expect(service.archiveItem("pli-1")).rejects.toThrow("Cannot archive item in USED_IN_AGENDA status");
  });

  it("12. Audit event is written after successful attach", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting());
    mockPrisma.parkingLotItem.update.mockResolvedValue(makeItem({ status: "USED_IN_AGENDA", agendaMeetingId: "mtg-1" }));
    mockPrisma.auditEvent.create.mockResolvedValue({});

    await service.addToAgenda("pli-1", "mtg-1", "actor-1");

    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        meetingId: "mtg-1",
        actorId: "actor-1",
        action: "PARKING_LOT_ADDED_TO_AGENDA",
        entityType: "ParkingLotItem",
        entityId: "pli-1",
      }),
    });
  });

  it("10. Failed attach rolls back all changes", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED" }));
    mockPrisma.meeting.findUnique.mockResolvedValue(makeMeeting());

    const txError = new Error("DB failure");
    mockPrisma.$transaction.mockRejectedValueOnce(txError);

    await expect(service.addToAgenda("pli-1", "mtg-1", "user-1")).rejects.toThrow("DB failure");
    expect(mockPrisma.parkingLotItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe("State machine — approveItem", () => {
  beforeEach(() => vi.clearAllMocks());

  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("PENDING_REVIEW -> APPROVED succeeds", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "PENDING_REVIEW" }));
    mockPrisma.parkingLotItem.update.mockResolvedValue(makeItem({ status: "APPROVED", reviewedById: "reviewer-1" }));

    const result = await service.approveItem("pli-1", "reviewer-1");
    expect(result.status).toBe("APPROVED");
  });

  it("APPROVED -> APPROVED is rejected", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED" }));

    await expect(service.approveItem("pli-1", "reviewer-1")).rejects.toThrow("Cannot approve item in APPROVED status");
  });

  it("ARCHIVED -> APPROVED is rejected", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "ARCHIVED" }));

    await expect(service.approveItem("pli-1", "reviewer-1")).rejects.toThrow("Cannot approve item in ARCHIVED status");
  });
});

describe("State machine — archiveItem", () => {
  beforeEach(() => vi.clearAllMocks());

  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("PENDING_REVIEW -> ARCHIVED succeeds", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "PENDING_REVIEW" }));
    mockPrisma.parkingLotItem.update.mockResolvedValue(makeItem({ status: "ARCHIVED" }));

    const result = await service.archiveItem("pli-1");
    expect(result.status).toBe("ARCHIVED");
  });

  it("APPROVED -> ARCHIVED succeeds", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "APPROVED" }));
    mockPrisma.parkingLotItem.update.mockResolvedValue(makeItem({ status: "ARCHIVED" }));

    const result = await service.archiveItem("pli-1");
    expect(result.status).toBe("ARCHIVED");
  });

  it("USED_IN_AGENDA -> ARCHIVED is rejected", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "USED_IN_AGENDA" }));

    await expect(service.archiveItem("pli-1")).rejects.toThrow("Cannot archive item in USED_IN_AGENDA status");
  });

  it("ARCHIVED -> ARCHIVED is rejected", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(makeItem({ status: "ARCHIVED" }));

    await expect(service.archiveItem("pli-1")).rejects.toThrow("Cannot archive item in ARCHIVED status");
  });
});
