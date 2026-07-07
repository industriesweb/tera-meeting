"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { selectExecutiveInbox, useRoleAwareExecutiveRequests } from "@/lib/api/queries/executive-requests";
import { useCurrentUser } from "@/lib/api/queries/auth";
import { ChevronRightIcon, PersonIcon, DateRangeIcon, ScheduleIcon, LinkIcon } from "@/components/icons";
import type { ExecutiveRequest } from "@/types/api";

const priorityStyles: Record<string, { bg: string; text: string; dot: string }> = {
  HIGH: { bg: "bg-error/10", text: "text-error", dot: "bg-error" },
  MEDIUM: { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary" },
  LOW: { bg: "bg-surface-container-high", text: "text-secondary/60", dot: "bg-secondary/40" },
};

const statusStyles: Record<string, { text: string; dot: string }> = {
  OPEN: { text: "Open", dot: "bg-tertiary" },
  PLANNING: { text: "Planning", dot: "bg-primary" },
  SCHEDULED: { text: "Scheduled", dot: "bg-primary" },
  COMPLETED: { text: "Completed", dot: "bg-primary" },
  CANCELLED: { text: "Cancelled", dot: "bg-secondary/50" },
};

function getUrgency(urgency: string | null): string {
  if (!urgency) return "LOW";
  const u = urgency.toUpperCase();
  if (u.includes("HIGH") || u.includes("CRITICAL") || u.includes("URGENT")) return "HIGH";
  if (u.includes("MEDIUM") || u.includes("NORMAL")) return "MEDIUM";
  return "LOW";
}

export default function ExecutiveRequestsPage() {
  const [filter, setFilter] = useState<string>("ALL");
  const { data: currentUser } = useCurrentUser();
  const inbox = selectExecutiveInbox(currentUser);
  const { data: requests, isLoading } = useRoleAwareExecutiveRequests(currentUser);

  const filtered = requests?.filter((r) => {
    if (filter === "ALL") return true;
    return r.status === filter;
  }) ?? [];

  return (
    <div className="min-h-screen bg-background p-8">
      <nav className="flex items-center gap-2 text-xs text-secondary font-body mb-6">
        <Link href="/dashboard" className="hover:text-primary transition-colors cursor-pointer">Dashboard</Link>
        <ChevronRightIcon className="h-4 w-4 text-secondary/40" />
        <span className="text-on-surface font-semibold">Executive Requests</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">Executive Requests</h1>
          <p className="text-sm text-secondary font-body mt-0.5">
            {isLoading ? "Loading..." : `${requests?.length ?? 0} ${inbox === "all" ? "organization" : inbox === "mine" ? "created" : "assigned"} requests`}
          </p>
        </div>
        {currentUser?.isExecutive && (
          <Link href="/executive-requests/new" className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">New Request</Link>
        )}
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {["ALL", "OPEN", "PLANNING", "SCHEDULED", "COMPLETED", "CANCELLED"].map((s) => {
          const count = s === "ALL" ? requests?.length : requests?.filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold font-body transition-all",
                filter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-container-high text-secondary/70 hover:bg-surface-container-highest"
              )}
            >
              {s === "ALL" ? "All" : statusStyles[s]?.text ?? s}
              {count !== undefined && ` (${count})`}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-secondary">Loading requests...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((req) => {
            const urgency = getUrgency(req.urgency);
            const pStyle = priorityStyles[urgency] ?? priorityStyles.LOW;
            const sStyle = statusStyles[req.status] ?? statusStyles.OPEN;
            return (
              <Link href={`/executive-requests/${req.id}`} key={req.id} className="block bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", pStyle.bg, pStyle.text)}>
                      {urgency}
                    </span>
                  </div>
                </div>

                <h3 className="font-headline text-sm font-bold text-on-surface mb-3 leading-snug">{req.title}</h3>

                <div className="space-y-1.5 mb-4">
                  {req.targets && req.targets.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-secondary">
                      <PersonIcon className="h-4 w-4 text-secondary" />
                      <span className="font-body">
                        {req.targets.map((t) => t.targetUser?.name ?? t.targetTeam?.name ?? "—").join(", ")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-secondary">
                    <DateRangeIcon className="h-4 w-4 text-secondary" />
                    <span className="font-body">{new Date(req.requestedDate).toLocaleDateString()}</span>
                  </div>
                  {req.requestedDurationSeconds && (
                    <div className="flex items-center gap-2 text-xs text-secondary">
                      <ScheduleIcon className="h-4 w-4 text-secondary" />
                      <span className="font-body">{Math.round(req.requestedDurationSeconds / 60)} min</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className={cn("w-2 h-2 rounded-full", sStyle.dot)} />
                  <span className="text-xs font-semibold text-on-surface font-body">{sStyle.text}</span>
                </div>

                {req.currentMeeting && (
                  <Link
                    href={`/meetings/${req.currentMeeting.id}`}
                    className="flex items-center gap-2 bg-primary/5 rounded-lg px-3 py-2 text-xs text-primary font-body mb-3 hover:bg-primary/10 transition-colors"
                  >
                    <LinkIcon className="h-4 w-4 text-primary" />
                    {req.currentMeeting.title}
                  </Link>
                )}
              </Link>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full p-12 text-center text-secondary">
              No executive requests found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
