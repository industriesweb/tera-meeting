import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// ── Safety guards ──────────────────────────────────────────────────────────
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production") {
  console.error("ABORT: demo:seed refuses to run in production (NODE_ENV=production).");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl) {
  console.error("ABORT: DATABASE_URL is not set.");
  process.exit(1);
}

const forbiddenPatterns = ["prod", "production"];
const urlLower = dbUrl.toLowerCase();
for (const pattern of forbiddenPatterns) {
  if (urlLower.includes(pattern)) {
    console.error(`ABORT: DATABASE_URL appears to target a production database (matched "${pattern}").`);
    console.error("  demo:seed requires a dedicated demo/staging database URL.");
    process.exit(1);
  }
}

const force = process.argv.includes("--force");

const adapter = new PrismaNeon({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

// ── Deterministic IDs ──────────────────────────────────────────────────────
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
  speakerOnly: "20000000-0000-4000-8000-000000000007",
  boardroom: "30000000-0000-4000-8000-000000000001",
  huddleRoom: "30000000-0000-4000-8000-000000000002",
  quickMeeting: "40000000-0000-4000-8000-000000000001",
  structuredMeeting: "40000000-0000-4000-8000-000000000002",
  completedMeeting: "40000000-0000-4000-8000-000000000003",
  parkingPending: "50000000-0000-4000-8000-000000000001",
  parkingApproved: "50000000-0000-4000-8000-000000000002",
  executiveRequest: "60000000-0000-4000-8000-000000000001",
};

async function main() {
  console.log("[demo:seed] Starting demo data seed...");

  // ── Check existing data ──────────────────────────────────────────────
  const existingOrg = await prisma.organization.findUnique({ where: { id: ids.organization } });
  if (existingOrg && !force) {
    console.log("[demo:seed] Demo organization already exists. Use --force to overwrite.");
    console.log("[demo:seed] Skipping seed.");
    await prisma.$disconnect();
    return;
  }

  if (existingOrg && force) {
    console.log("[demo:seed] --force detected. Clearing existing demo data...");
    // Delete in reverse dependency order
    await prisma.auditEvent.deleteMany({ where: { organizationId: ids.organization } });
    await prisma.notification.deleteMany({ where: { user: { organizationId: ids.organization } } });
    await prisma.notificationPreference.deleteMany({ where: { user: { organizationId: ids.organization } } });
    await prisma.parkingLotItem.deleteMany({ where: { organizationId: ids.organization } });
    await prisma.crossTeamInvite.deleteMany({ where: { meeting: { organizationId: ids.organization } } });
    await prisma.meetingJoinRequest.deleteMany({ where: { meeting: { organizationId: ids.organization } } });
    await prisma.executiveRequestTarget.deleteMany({ where: { executiveRequest: { organizationId: ids.organization } } });
    await prisma.executiveRequest.deleteMany({ where: { organizationId: ids.organization } });
    await prisma.meetingNote.deleteMany({ where: { meeting: { organizationId: ids.organization } } });
    await prisma.agendaItemSpeaker.deleteMany({ where: { agendaItem: { meeting: { organizationId: ids.organization } } } });
    await prisma.agendaItem.deleteMany({ where: { meeting: { organizationId: ids.organization } } });
    await prisma.meetingTimer.deleteMany({ where: { meeting: { organizationId: ids.organization } } });
    await prisma.roomBooking.deleteMany({ where: { room: { organizationId: ids.organization } } });
    await prisma.meetingAttendee.deleteMany({ where: { meeting: { organizationId: ids.organization } } });
    await prisma.meeting.deleteMany({ where: { organizationId: ids.organization } });
    await prisma.templateAgendaItem.deleteMany({ where: { template: { organizationId: ids.organization } } });
    await prisma.template.deleteMany({ where: { organizationId: ids.organization } });
    await prisma.room.deleteMany({ where: { organizationId: ids.organization } });
    await prisma.user.deleteMany({ where: { organizationId: ids.organization } });
    await prisma.functionalTeam.deleteMany({ where: { organizationId: ids.organization } });
    await prisma.organization.deleteMany({ where: { id: ids.organization } });
    console.log("[demo:seed] Existing demo data cleared.");
  }

  // ── Create demo data ─────────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    // Organization
    const org = await tx.organization.create({
      data: { id: ids.organization, name: "Terra Demo Co.", timezone: "Europe/London" },
    });

    // Teams
    await tx.functionalTeam.createMany({
      data: [
        { id: ids.sales, organizationId: org.id, name: "Sales" },
        { id: ids.operations, organizationId: org.id, name: "Operations" },
      ],
    });

    // Users
    await tx.user.createMany({
      data: [
        { id: ids.secretary, organizationId: org.id, functionalTeamId: ids.operations, name: "Nizar", email: "nizarrtg@gmail.com", operationalRole: "SECRETARY" },
        { id: ids.salesAdmin, organizationId: org.id, functionalTeamId: ids.sales, name: "Sam Sales Admin", email: "sales.admin@example.com", operationalRole: "TEAM_ADMIN" },
        { id: ids.operationsAdmin, organizationId: org.id, functionalTeamId: ids.operations, name: "Olivia Operations Admin", email: "operations.admin@example.com", operationalRole: "TEAM_ADMIN" },
        { id: ids.salesMember, organizationId: org.id, functionalTeamId: ids.sales, name: "Maya Sales Member", email: "sales.member@example.com", operationalRole: "MEMBER" },
        { id: ids.operationsMember, organizationId: org.id, functionalTeamId: ids.operations, name: "Oscar Operations Member", email: "operations.member@example.com", operationalRole: "MEMBER" },
        { id: ids.executive, organizationId: org.id, functionalTeamId: ids.sales, name: "Evelyn Executive", email: "executive@example.com", operationalRole: "MEMBER", isExecutive: true },
        { id: ids.speakerOnly, organizationId: org.id, functionalTeamId: ids.operations, name: "Speaker Only", email: "speaker@example.com", operationalRole: "MEMBER" },
      ],
    });

    // Rooms
    await tx.room.createMany({
      data: [
        { id: ids.boardroom, organizationId: org.id, name: "Boardroom" },
        { id: ids.huddleRoom, organizationId: org.id, name: "Huddle Room" },
      ],
    });

    // Parking Lot items
    await tx.parkingLotItem.createMany({
      data: [
        { id: ids.parkingPending, organizationId: org.id, teamId: ids.sales, title: "Review Q3 pipeline forecast", note: "Bring updated CRM data", createdById: ids.salesMember, status: "PENDING_REVIEW" },
        { id: ids.parkingApproved, organizationId: org.id, teamId: ids.operations, title: "Improve handover checklist", note: "Standardize cross-shift handover", createdById: ids.operationsMember, status: "APPROVED", reviewedById: ids.operationsAdmin, reviewedAt: new Date() },
      ],
    });

    // Quick Team Meeting (upcoming)
    const quick = await tx.meeting.create({
      data: {
        id: ids.quickMeeting,
        organizationId: org.id,
        ownerTeamId: ids.sales,
        title: "Sales Quick Sync",
        kind: "QUICK_TEAM",
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        plannedDurationSeconds: 900,
        locationType: "ONLINE",
        onlineLink: "https://meet.example.com/sales-sync",
        organizerId: ids.salesAdmin,
        createdById: ids.salesAdmin,
        attendees: { create: [{ userId: ids.salesMember }, { userId: ids.executive }] },
      },
    });

    // Structured Meeting (upcoming)
    const scheduledAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const structured = await tx.meeting.create({
      data: {
        id: ids.structuredMeeting,
        organizationId: org.id,
        ownerTeamId: ids.operations,
        title: "Operations Weekly Review",
        kind: "STRUCTURED",
        status: "SCHEDULED",
        scheduledAt,
        plannedDurationSeconds: 3600,
        locationType: "HYBRID",
        roomId: ids.boardroom,
        onlineLink: "https://meet.example.com/operations-review",
        organizerId: ids.operationsAdmin,
        createdById: ids.operationsAdmin,
        attendees: { create: [{ userId: ids.secretary }, { userId: ids.operationsMember }] },
        agendaItems: {
          create: [
            { title: "Metrics review", durationSeconds: 1200, sortOrder: 0, speakers: { create: [{ userId: ids.operationsMember }] } },
            { title: "Operational blockers", durationSeconds: 1800, sortOrder: 1, speakers: { create: [{ userId: ids.operationsAdmin }] } },
          ],
        },
        bookings: { create: { roomId: ids.boardroom, startsAt: scheduledAt, endsAt: new Date(scheduledAt.getTime() + 3600_000) } },
      },
    });

    // Completed Meeting (with organizer summary)
    const completedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await tx.meeting.create({
      data: {
        id: ids.completedMeeting,
        organizationId: org.id,
        ownerTeamId: ids.sales,
        title: "Sales Strategy Review",
        kind: "STRUCTURED",
        status: "COMPLETED_LOCKED",
        scheduledAt: completedAt,
        plannedDurationSeconds: 2700,
        actualDurationSeconds: 2580,
        locationType: "PHYSICAL",
        roomId: ids.huddleRoom,
        organizerId: ids.salesAdmin,
        createdById: ids.salesAdmin,
        organizerSummary: "Reviewed Q3 targets, aligned on cross-team leads strategy.",
        summarySubmittedAt: new Date(completedAt.getTime() + 3600_000),
        lockedAt: new Date(completedAt.getTime() + 7200_000),
        endedAt: completedAt,
        attendees: { create: [{ userId: ids.salesMember }, { userId: ids.operationsMember }] },
        agendaItems: {
          create: [
            { title: "Q3 target review", durationSeconds: 1200, sortOrder: 0, status: "COMPLETED", actualDurationSeconds: 1140, speakers: { create: [{ userId: ids.salesAdmin }] } },
            { title: "Cross-team strategy", durationSeconds: 900, sortOrder: 1, status: "COMPLETED", actualDurationSeconds: 900, speakers: { create: [{ userId: ids.salesMember }] } },
          ],
        },
      },
    });

    // Executive Request
    await tx.executiveRequest.create({
      data: {
        id: ids.executiveRequest,
        organizationId: org.id,
        createdByExecutiveId: ids.executive,
        title: "Board Preparation Meeting",
        description: "Need a meeting to prepare for upcoming board presentation",
        requestedDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        preferredPeriod: "MORNING",
        requestedDurationSeconds: 3600,
        urgency: "HIGH",
        status: "OPEN",
        targets: {
          create: [
            { targetType: "TEAM", targetTeamId: ids.sales },
          ],
        },
      },
    });

    // Notifications
    await tx.notification.createMany({
      data: [
        { userId: ids.salesMember, type: "MEETING_INVITATION", title: "Meeting Invitation", body: "You've been invited to Sales Quick Sync" },
        { userId: ids.operationsMember, type: "MEETING_INVITATION", title: "Meeting Invitation", body: "You've been invited to Operations Weekly Review" },
        { userId: ids.salesAdmin, type: "MEETING_REMINDER", title: "Meeting Reminder", body: "Sales Quick Sync starts in 2 days" },
      ],
    });

    console.log(JSON.stringify({
      organization: org.id,
      meetings: { quick: quick.id, structured: structured.id },
      users: { secretary: ids.secretary, salesAdmin: ids.salesAdmin },
    }));
  });

  console.log("[demo:seed] Demo data seeded successfully.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[demo:seed] Fatal error:", err);
  process.exit(1);
});
