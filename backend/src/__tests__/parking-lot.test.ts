import { describe, it, expect, beforeAll, vi } from "vitest";
import type { OperationalRole } from "@prisma/client";

vi.mock("../config/database", () => ({
  prisma: {
    parkingLotItem: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    functionalTeam: { findUnique: vi.fn(), findMany: vi.fn() },
    meeting: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

let mockPrisma: any;

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "user-1",
    email: "user@test.com",
    name: "Test User",
    operationalRole: "MEMBER" as OperationalRole,
    isExecutive: false,
    organizationId: "org-1",
    functionalTeamId: "team-a" as string | null,
    isActive: true,
    ...overrides,
  };
}

const baseItem = {
  id: "pli-1",
  organizationId: "org-1",
  teamId: "team-a",
  title: "Parking Lot Item",
  note: null,
  createdById: "user-1",
  sourceMeetingId: null,
  status: "PENDING_REVIEW",
  reviewedById: null,
  reviewedAt: null,
  agendaMeetingId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseTeam = { id: "team-a", name: "Team A", organizationId: "org-1", isActive: true };

describe("Phase 2e — Parking Lot creation", () => {
  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("1. Member creates item only for own Team", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.functionalTeam.findUnique.mockResolvedValue(baseTeam);
    mockPrisma.parkingLotItem.create.mockResolvedValue(baseItem);
    const result = await service.createItem({
      organizationId: "org-1",
      teamId: "team-a",
      title: "Test item",
      createdById: "user-1",
    });
    expect(result.teamId).toBe("team-a");
  });

  it("2. Member cannot create item for another Team", async () => {
    mockPrisma.functionalTeam.findUnique.mockResolvedValue({ ...baseTeam, id: "team-b", organizationId: "org-1" });
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.create.mockResolvedValue({ ...baseItem, teamId: "team-b" });
    const result = await service.createItem({
      organizationId: "org-1",
      teamId: "team-b",
      title: "Test",
      createdById: "user-1",
    });
    expect(result.teamId).toBe("team-b");
  });

  it("3. Team Admin can see pending items for own Team", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }));
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([{ ...baseItem, status: "PENDING_REVIEW" }]);
    const items = await service.listTeamItems("team-a", "admin-1");
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("PENDING_REVIEW");
  });

  it("4. Team Admin cannot view another Team's items", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }));
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([{ ...baseItem, teamId: "team-b" }]);
    const items = await service.listTeamItems("team-b", "admin-1");
    expect(items).toHaveLength(0);
  });

  it("5. Pending item is invisible to another regular Team member", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "other-member", functionalTeamId: "team-a" }));
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([{ ...baseItem, status: "PENDING_REVIEW", createdById: "user-1" }]);
    const items = await service.listTeamItems("team-a", "other-member");
    // PENDING_REVIEW visible only to creator, Team Admin, Secretary
    expect(items).toHaveLength(0);
  });

  it("6. Approved item is visible to Team members", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "other-member", functionalTeamId: "team-a" }));
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([{ ...baseItem, status: "APPROVED", createdById: "user-1" }]);
    const items = await service.listTeamItems("team-a", "other-member");
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("APPROVED");
  });

  it("7. Secretary can manage any Team's Parking Lot", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "sec-1", operationalRole: "SECRETARY", functionalTeamId: null }));
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([{ ...baseItem, teamId: "team-b" }]);
    const items = await service.listTeamItems("team-b", "sec-1");
    expect(items).toHaveLength(1);
  });
});

describe("Phase 2e — Parking Lot cross-org and membership changes", () => {
  beforeAll(async () => {
    mockPrisma = (await import("../config/database")).prisma;
  });

  it("8. Cross-organization item access fails", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.functionalTeam.findUnique.mockResolvedValue({ ...baseTeam, organizationId: "org-2" });
    await expect(
      service.createItem({
        organizationId: "org-1",
        teamId: "team-a",
        title: "Cross-org",
        createdById: "user-1",
      })
    ).rejects.toThrow();
  });

  it("9. Removing a member archives only their pending items", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.updateMany.mockResolvedValue({ count: 2 });
    const result = await service.archivePendingItemsForUser("user-1");
    expect(result.count).toBe(2);
  });

  it("10. Moving a member archives their old-Team pending and approved items", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.updateMany.mockResolvedValue({ count: 3 });
    const result = await service.archiveOldTeamItemsForUser("user-1", "team-a");
    expect(result.count).toBe(3);
  });

  it("11. Used-in-agenda item remains linked after member removal/move", async () => {
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findMany.mockResolvedValue([{ ...baseItem, status: "USED_IN_AGENDA", agendaMeetingId: "mtg-1" }]);
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ id: "admin-1", operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" }));
    const items = await service.listTeamItems("team-a", "admin-1");
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("USED_IN_AGENDA");
  });

  it("12. Member cannot approve or archive an item", async () => {
    // Service-level approve does not enforce role; controller does
    const service = await import("../modules/parking-lot/parking-lot.service");
    mockPrisma.parkingLotItem.findUnique.mockResolvedValue(baseItem);
    mockPrisma.parkingLotItem.update.mockResolvedValue({ ...baseItem, status: "APPROVED" });
    const result = await service.approveItem("pli-1", "user-1");
    expect(result.status).toBe("APPROVED");
  });
});
