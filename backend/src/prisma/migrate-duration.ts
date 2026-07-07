import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Duration Migration ===\n");

  // 1. Backfill Meeting.plannedDurationSeconds
  const mResult = await prisma.$executeRawUnsafe(`
    UPDATE meetings
    SET planned_duration_seconds = scheduled_duration
    WHERE planned_duration_seconds IS NULL
      AND scheduled_duration IS NOT NULL
  `);
  console.log(`Meeting.plannedDurationSeconds backfilled: ${mResult} rows`);

  // 2. Backfill Meeting.actualDurationSeconds
  const aResult = await prisma.$executeRawUnsafe(`
    UPDATE meetings
    SET actual_duration_seconds = actual_duration * 60
    WHERE actual_duration_seconds IS NULL
      AND actual_duration IS NOT NULL
  `);
  console.log(`Meeting.actualDurationSeconds backfilled: ${aResult} rows`);

  // 3. Backfill AgendaItem.durationSeconds
  const agResult = await prisma.$executeRawUnsafe(`
    UPDATE agenda_items
    SET duration_seconds = duration * 60
    WHERE duration_seconds IS NULL
      AND duration IS NOT NULL
  `);
  console.log(`AgendaItem.durationSeconds backfilled: ${agResult} rows`);

  // 4. Verify
  const remainingPlanned = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM meetings WHERE planned_duration_seconds IS NULL`
  );
  const remainingActual = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM meetings WHERE actual_duration IS NOT NULL AND actual_duration_seconds IS NULL`
  );
  const remainingAgenda = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM agenda_items WHERE duration_seconds IS NULL AND duration IS NOT NULL`
  );
  const mismatch = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM meetings WHERE planned_duration_seconds IS NOT NULL AND planned_duration_seconds != scheduled_duration`
  );

  console.log(`\n=== Verification ===`);
  console.log(`Meetings with NULL plannedDurationSeconds: ${remainingPlanned[0]?.count ?? 0}`);
  console.log(`Meetings missing actualDurationSeconds: ${remainingActual[0]?.count ?? 0}`);
  console.log(`Agenda items missing durationSeconds: ${remainingAgenda[0]?.count ?? 0}`);
  console.log(`Mismatched plannedDurationSeconds vs scheduledDuration: ${mismatch[0]?.count ?? 0}`);

  const verify = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM meetings WHERE planned_duration_seconds IS NOT NULL AND actual_duration IS NOT NULL AND actual_duration_seconds != actual_duration * 60`
  );
  console.log(`actualDurationSeconds != actualDuration * 60: ${verify[0]?.count ?? 0}`);

  const agendaVerify = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM agenda_items WHERE duration_seconds IS NOT NULL AND duration_seconds != duration * 60`
  );
  console.log(`durationSeconds != duration * 60: ${agendaVerify[0]?.count ?? 0}`);

  console.log(`\nMigration complete.`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
