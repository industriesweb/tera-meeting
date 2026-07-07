"use client";

import { useEffect, useState } from "react";
import type { MeetingLiveState } from "@/types/api";

export interface CountdownValues {
  meetingElapsedSeconds: number;
  meetingRemainingSeconds: number;
  meetingProgress: number;
  activeItemSeconds: number | null;
  overtimeSeconds: number | null;
}

export function useLiveCountdown(liveState: MeetingLiveState | undefined): CountdownValues | null {
  const [values, setValues] = useState<CountdownValues | null>(null);

  useEffect(() => {
    if (!liveState?.serverNow) return;
    const ls: MeetingLiveState = liveState;

    const serverNowMs = Date.parse(ls.serverNow);
    if (isNaN(serverNowMs)) return;

    const capturedAt = Date.now();

    function tick() {
      const nowMs = serverNowMs + (Date.now() - capturedAt);
      const nowSec = Math.floor(nowMs / 1000);

      const meetingStartedMs = ls.meetingStartedAt ? Date.parse(ls.meetingStartedAt) : null;
      const meetingElapsedSeconds = meetingStartedMs != null
        ? Math.max(0, nowSec - Math.floor(meetingStartedMs / 1000))
        : 0;
      const meetingRemainingSeconds = Math.max(0, ls.plannedDurationSeconds - meetingElapsedSeconds);
      const meetingProgress = ls.plannedDurationSeconds > 0
        ? Math.min(100, (meetingElapsedSeconds / ls.plannedDurationSeconds) * 100)
        : 0;

      let activeItemSeconds: number | null = null;
      if (ls.activeItemStartedAt && ls.activeItemBudgetSeconds != null) {
        const itemStartedMs = Date.parse(ls.activeItemStartedAt);
        if (!isNaN(itemStartedMs)) {
          activeItemSeconds = Math.max(0, ls.activeItemBudgetSeconds - (nowSec - Math.floor(itemStartedMs / 1000)));
        }
      }

      let overtimeSeconds: number | null = null;
      if (ls.overtimeDeadlineAt) {
        const otDeadlineMs = Date.parse(ls.overtimeDeadlineAt);
        if (!isNaN(otDeadlineMs)) {
          overtimeSeconds = Math.max(0, Math.floor(otDeadlineMs / 1000) - nowSec);
        }
      }

      setValues({
        meetingElapsedSeconds,
        meetingRemainingSeconds,
        meetingProgress,
        activeItemSeconds,
        overtimeSeconds,
      });
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [liveState]);

  return values;
}
