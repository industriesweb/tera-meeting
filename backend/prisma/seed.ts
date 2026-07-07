import { prisma } from "../src/config/database";

const ids = {
  organization: "00000000-0000-4000-8000-000000000001",
  sales: "10000000-0000-4000-8000-000000000001",
  operations: "10000000-0000-4000-8000-000000000002",
  secretary: "20000000-0000-4000-8000-000000000001",
  salesAdmin: "20000000-0000-4000-8000-000000000002",
  operationsAdmin: "20000000-0000-4000-8000-000000000003",
  salesMember: "20000000-0000-4000-8000-000000000004",
  operationsMember: "20000000-0000-4000-8000-000000000005",
  executive: "20000000-0000-4000-8000-000000000006",
  boardroom: "30000000-0000-4000-8000-000000000001",
  huddleRoom: "30000000-0000-4000-8000-000000000002",
};

async function main() {
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { id: ids.organization, name: "Terra Meetings", timezone: "Europe/London" },
    });
    await tx.functionalTeam.createMany({ data: [
      { id: ids.sales, organizationId: organization.id, name: "Sales" },
      { id: ids.operations, organizationId: organization.id, name: "Operations" },
    ] });
    await tx.user.createMany({ data: [
      { id: ids.secretary, organizationId: organization.id, functionalTeamId: ids.operations, name: "Nizar", email: "nizarrtg@gmail.com", operationalRole: "SECRETARY" },
      { id: ids.salesAdmin, organizationId: organization.id, functionalTeamId: ids.sales, name: "Sam Sales Admin", email: "sales.admin@example.com", operationalRole: "TEAM_ADMIN" },
      { id: ids.operationsAdmin, organizationId: organization.id, functionalTeamId: ids.operations, name: "Olivia Operations Admin", email: "operations.admin@example.com", operationalRole: "TEAM_ADMIN" },
      { id: ids.salesMember, organizationId: organization.id, functionalTeamId: ids.sales, name: "Maya Sales Member", email: "sales.member@example.com", operationalRole: "MEMBER" },
      { id: ids.operationsMember, organizationId: organization.id, functionalTeamId: ids.operations, name: "Oscar Operations Member", email: "operations.member@example.com", operationalRole: "MEMBER" },
      { id: ids.executive, organizationId: organization.id, functionalTeamId: ids.sales, name: "Evelyn Executive", email: "executive@example.com", operationalRole: "MEMBER", isExecutive: true },
    ] });
    await tx.room.createMany({ data: [
      { id: ids.boardroom, organizationId: organization.id, name: "Boardroom" },
      { id: ids.huddleRoom, organizationId: organization.id, name: "Huddle Room" },
    ] });
    await tx.parkingLotItem.createMany({ data: [
      { organizationId: organization.id, teamId: ids.sales, title: "Review enterprise pricing", note: "Bring pipeline data", createdById: ids.salesMember, status: "APPROVED", reviewedById: ids.salesAdmin, reviewedAt: new Date() },
      { organizationId: organization.id, teamId: ids.operations, title: "Improve handover checklist", createdById: ids.operationsMember },
    ] });
    const quick = await tx.meeting.create({ data: {
      organizationId: organization.id, ownerTeamId: ids.sales, title: "Sales Quick Sync", kind: "QUICK_TEAM", status: "DRAFT", plannedDurationSeconds: 900, locationType: "ONLINE", onlineLink: "https://meet.example.com/sales-sync", organizerId: ids.salesAdmin, createdById: ids.salesAdmin,
      attendees: { create: [{ userId: ids.salesMember }, { userId: ids.executive }] },
    } });
    const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const structured = await tx.meeting.create({ data: {
      organizationId: organization.id, ownerTeamId: ids.operations, title: "Operations Weekly Review", kind: "STRUCTURED", status: "SCHEDULED", scheduledAt, plannedDurationSeconds: 3600, locationType: "HYBRID", roomId: ids.boardroom, onlineLink: "https://meet.example.com/operations-review", organizerId: ids.operationsAdmin, createdById: ids.operationsAdmin,
      attendees: { create: [{ userId: ids.secretary }, { userId: ids.operationsMember }] },
      agendaItems: { create: [
        { title: "Metrics review", durationSeconds: 1200, sortOrder: 0, speakers: { create: [{ userId: ids.operationsMember }] } },
        { title: "Operational blockers", durationSeconds: 1800, sortOrder: 1, speakers: { create: [{ userId: ids.operationsAdmin }] } },
      ] },
      bookings: { create: { roomId: ids.boardroom, startsAt: scheduledAt, endsAt: new Date(scheduledAt.getTime() + 3600_000) } },
    } });
    console.log(JSON.stringify({ organization: organization.id, meetings: [quick.id, structured.id] }));
  });
}

main().finally(() => prisma.$disconnect());
