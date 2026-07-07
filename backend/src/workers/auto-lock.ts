import { prisma } from "../config/database";

const INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

async function autoLockExpiredMeetings() {
  const now = new Date();
  const result = await prisma.meeting.updateMany({
    where: {
      status: "ENDED_PENDING_SUMMARY",
      summaryAutoLockedAt: { lte: now },
    },
    data: {
      status: "COMPLETED_LOCKED",
      lockedAt: now,
    },
  });
  if (result.count > 0) {
    console.log(`[auto-lock] Locked ${result.count} meeting(s) at ${now.toISOString()}`);
  }
}

export function startAutoLockWorker() {
  if (intervalId) return intervalId;
  console.log(`[auto-lock] Worker started (interval: ${INTERVAL_MS}ms)`);
  autoLockExpiredMeetings();
  intervalId = setInterval(autoLockExpiredMeetings, INTERVAL_MS);
  intervalId.unref();
  return intervalId;
}

export function stopAutoLockWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[auto-lock] Worker stopped");
  }
}
