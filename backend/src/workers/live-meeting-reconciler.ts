import { prisma } from "../config/database";
import { reconcileLiveMeeting } from "../modules/meetings/meetings.service";

const INTERVAL_MS = parseInt(process.env.LIVE_RECONCILE_INTERVAL_MS ?? "1000", 10);

let intervalId: ReturnType<typeof setInterval> | null = null;

async function reconcileAllLiveMeetings() {
  try {
    const now = new Date();
    const meetings = await prisma.meeting.findMany({
      where: { status: "IN_PROGRESS" },
      select: { id: true },
    });

    for (const meeting of meetings) {
      try {
        await reconcileLiveMeeting(meeting.id, now);
      } catch {
        // Individual meeting failure should not crash the worker
      }
    }
  } catch {
    // Top-level failure should not crash the worker
  }
}

export function startLiveReconciler() {
  if (intervalId) return;
  console.log(`[live-reconciler] Worker started (interval: ${INTERVAL_MS}ms)`);
  reconcileAllLiveMeetings();
  intervalId = setInterval(reconcileAllLiveMeetings, INTERVAL_MS);
  intervalId.unref();
}

export function stopLiveReconciler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[live-reconciler] Worker stopped");
  }
}
