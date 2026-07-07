import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// ── Safety guards ──────────────────────────────────────────────────────────
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production") {
  console.error("ABORT: qa:reset refuses to run in production (NODE_ENV=production).");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl) {
  console.error("ABORT: DATABASE_URL is not set.");
  process.exit(1);
}

const forbiddenPatterns = ["prod", "production", "main", "primary"];
const urlLower = dbUrl.toLowerCase();
for (const pattern of forbiddenPatterns) {
  if (urlLower.includes(pattern)) {
    console.error(`ABORT: DATABASE_URL appears to target a production database (matched "${pattern}").`);
    console.error("  QA reset requires a dedicated QA database URL.");
    process.exit(1);
  }
}

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
};

// ── QA user credentials ────────────────────────────────────────────────────
// These are dev-only passwords. Never commit production credentials.
const qaUsers = [
  { id: ids.secretary, name: " Secretary", email: "qa-secretary@example.com", password: "QA-Secretary-2024!", role: "SECRETARY", team: "Operations", isExecutive: false },
  { id: ids.salesAdmin, name: "Sales Team Admin", email: "qa-sales-admin@example.com", password: "QA-SalesAdmin-2024!", role: "TEAM_ADMIN", team: "Sales", isExecutive: false },
  { id: ids.operationsAdmin, name: "Operations Team Admin", email: "qa-ops-admin@example.com", password: "QA-OpsAdmin-2024!", role: "TEAM_ADMIN", team: "Operations", isExecutive: false },
  { id: ids.salesMember, name: "Sales Member", email: "qa-sales-member@example.com", password: "QA-SalesMember-2024!", role: "MEMBER", team: "Sales", isExecutive: false },
  { id: ids.operationsMember, name: "Operations Member", email: "qa-ops-member@example.com", password: "QA-OpsMember-2024!", role: "MEMBER", team: "Operations", isExecutive: false },
  { id: ids.executive, name: "Executive User", email: "qa-executive@example.com", password: "QA-Executive-2024!", role: "MEMBER", team: "Sales", isExecutive: true },
  { id: ids.speakerOnly, name: "Speaker Only", email: "qa-speaker@example.com", password: "QA-Speaker-2024!", role: "MEMBER", team: "Operations", isExecutive: false },
];

// ── Schema tables (order matters for foreign keys) ─────────────────────────
const tableNames = [
  "notification_preferences",
  "notifications",
  "audit_events",
  "parking_lot_items",
  "executive_request_targets",
  "executive_requests",
  "meeting_join_requests",
  "cross_team_invites",
  "meeting_notes",
  "meeting_timers",
  "agenda_item_speakers",
  "agenda_items",
  "meeting_attendees",
  "room_bookings",
  "meetings",
  "template_agenda_items",
  "templates",
  "rooms",
  "users",
  "functional_teams",
  "organizations",
];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  console.log("QA Reset — dropping all tables...");
  for (const table of tableNames) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  console.log("  All tables truncated.\n");

  console.log("Seeding QA data...");

  await prisma.$transaction(async (tx) => {
    // Organization
    await tx.organization.create({
      data: { id: ids.organization, name: "QA Terra Meetings", timezone: "Europe/London" },
    });

    // Teams
    await tx.functionalTeam.createMany({
      data: [
        { id: ids.sales, organizationId: ids.organization, name: "Sales" },
        { id: ids.operations, organizationId: ids.organization, name: "Operations" },
      ],
    });

    // Users
    await tx.user.createMany({
      data: qaUsers.map((u) => ({
        id: u.id,
        organizationId: ids.organization,
        functionalTeamId: u.team === "Sales" ? ids.sales : ids.operations,
        name: u.name,
        email: u.email,
        operationalRole: u.role as any,
        isExecutive: u.isExecutive,
      })),
    });

    // Rooms
    await tx.room.createMany({
      data: [
        { id: ids.boardroom, organizationId: ids.organization, name: "Boardroom" },
        { id: ids.huddleRoom, organizationId: ids.organization, name: "Huddle Room" },
      ],
    });

    // Parking Lot items (for Journey C)
    await tx.parkingLotItem.createMany({
      data: [
        {
          organizationId: ids.organization,
          teamId: ids.sales,
          title: "Review enterprise pricing",
          note: "Bring pipeline data",
          createdById: ids.salesMember,
          status: "PENDING_REVIEW",
        },
        {
          organizationId: ids.organization,
          teamId: ids.operations,
          title: "Improve handover checklist",
          createdById: ids.operationsMember,
          status: "APPROVED",
          reviewedById: ids.operationsAdmin,
          reviewedAt: new Date(),
        },
      ],
    });

    // Structured meeting (for Journey A / C / G)
    const structuredTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tx.meeting.create({
      data: {
        organizationId: ids.organization,
        ownerTeamId: ids.operations,
        title: "Operations Weekly Review",
        kind: "STRUCTURED",
        status: "SCHEDULED",
        scheduledAt: structuredTime,
        plannedDurationSeconds: 3600,
        locationType: "HYBRID",
        roomId: ids.boardroom,
        onlineLink: "https://meet.example.com/ops-review",
        organizerId: ids.operationsAdmin,
        createdById: ids.operationsAdmin,
        attendees: {
          create: [
            { userId: ids.operationsAdmin },
            { userId: ids.operationsMember },
            { userId: ids.secretary },
          ],
        },
        agendaItems: {
          create: [
            {
              title: "Metrics review",
              durationSeconds: 1200,
              sortOrder: 0,
              speakers: { create: [{ userId: ids.operationsMember }] },
            },
            {
              title: "Operational blockers",
              durationSeconds: 1800,
              sortOrder: 1,
              speakers: { create: [{ userId: ids.operationsAdmin }] },
            },
          ],
        },
        bookings: {
          create: {
            roomId: ids.boardroom,
            startsAt: structuredTime,
            endsAt: new Date(structuredTime.getTime() + 3600_000),
          },
        },
      },
    });

    // Quick meeting (for Journey B)
    await tx.meeting.create({
      data: {
        organizationId: ids.organization,
        ownerTeamId: ids.sales,
        title: "Sales Quick Sync",
        kind: "QUICK_TEAM",
        status: "DRAFT",
        plannedDurationSeconds: 900,
        locationType: "ONLINE",
        onlineLink: "https://meet.example.com/sales-sync",
        organizerId: ids.salesAdmin,
        createdById: ids.salesAdmin,
        attendees: {
          create: [{ userId: ids.salesAdmin }, { userId: ids.salesMember }],
        },
      },
    });
  });

  await prisma.$disconnect();

  // Print QA identities
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  QA Reset Complete — Seeded Identities");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("  NOTE: Users must also exist in Supabase Auth with the same");
  console.log("  email addresses to log in via the frontend.\n");
  console.log("  Role             Email                          Team");
  console.log("  ──────────────── ────────────────────────────── ────────────");
  for (const u of qaUsers) {
    const role = u.isExecutive ? "EXECUTIVE" : u.role;
    const email = u.email.padEnd(28);
    console.log(`  ${role.padEnd(16)} ${email} ${u.team}`);
  }
  console.log("\n  Rooms: Boardroom, Huddle Room");
  console.log("  Parking Lot: 1 PENDING_REVIEW (Sales), 1 APPROVED (Operations)");
  console.log("  Meetings: 1 STRUCTURED SCHEDULED (Ops), 1 QUICK_TEAM DRAFT (Sales)");
  console.log("");
}

main().catch((e) => {
  console.error("QA Reset failed:", e);
  process.exit(1);
});
