import type { MeetingStatus } from "@/types/api";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "Live",
  ENDED_PENDING_SUMMARY: "Summary Pending",
  COMPLETED_LOCKED: "Completed",
  CANCELLED: "Cancelled",
};

export const STATUS_CLASSES: Record<MeetingStatus, string> = {
  DRAFT: "bg-surface-container-high text-secondary/60",
  SCHEDULED: "bg-secondary/40 text-secondary",
  IN_PROGRESS: "bg-primary/10 text-primary",
  ENDED_PENDING_SUMMARY: "bg-surface-variant text-on-surface-variant",
  COMPLETED_LOCKED: "bg-secondary-container/60 text-secondary",
  CANCELLED: "bg-error/10 text-error",
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_CLASSES[status])}>
      {status === "IN_PROGRESS" && <span className="h-1.5 w-1.5 rounded-full bg-error animate-pulse" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m} min`;
}

export function formatTime(isoString: string | null, timezone: string): string {
  if (!isoString) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit", minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(isoString));
  } catch {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

export function formatDate(isoString: string | null, timezone: string): string {
  if (!isoString) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short", month: "short", day: "numeric",
      timeZone: timezone,
    }).format(new Date(isoString));
  } catch {
    return new Date(isoString).toLocaleDateString();
  }
}

export function formatDateTime(isoString: string | null, timezone: string): string {
  if (!isoString) return "";
  return `${formatDate(isoString, timezone)} ${formatTime(isoString, timezone)}`;
}

const KIND_LABEL: Record<string, string> = {
  QUICK_TEAM: "Quick",
  STRUCTURED: "Structured",
};

export function KindBadge({ kind }: { kind: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
      kind === "STRUCTURED" ? "bg-primary/10 text-primary" : "bg-tertiary/10 text-tertiary"
    )}>
      {KIND_LABEL[kind] || kind}
    </span>
  );
}

export function locationSummary(meeting: { locationType: string; room: { name: string } | null }): string {
  if (meeting.locationType === "ONLINE") return "Online";
  if (meeting.room) return meeting.room.name;
  return meeting.locationType;
}
