"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useMeeting, useLiveState } from "@/lib/api/queries/meetings";
import {
  useStartMeeting,
  useEndMeeting,
  useSkipCurrentAgenda,
  useExtendCurrentAgenda,
  useExtendOvertime,
  useTakeoverMeeting,
  useSubmitSummary,
} from "@/lib/api/queries/meetings";
import { useNotes, useCreateNote } from "@/lib/api/queries/notes";
import { useCurrentUser } from "@/lib/api/queries/auth";
import { CheckCircleOutlineIcon, RemoveCircleIcon, PlayCircleIcon, CircleIcon } from "@/components/icons";
import { useLiveCountdown } from "./use-live-countdown";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const avatarColors = ["bg-primary", "bg-tertiary", "bg-secondary"];

export default function LiveMeetingPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: meeting, isLoading } = useMeeting(id);
  const { data: liveState } = useLiveState(id);
  const { data: notes } = useNotes(id);
  const { data: currentUser } = useCurrentUser();

  const startMeeting = useStartMeeting();
  const endMeeting = useEndMeeting();
  const skipCurrent = useSkipCurrentAgenda();
  const extendAgenda = useExtendCurrentAgenda();
  const extendOvertime = useExtendOvertime();
  const takeover = useTakeoverMeeting();
  const submitSummary = useSubmitSummary();

  const [summaryText, setSummaryText] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const createNote = useCreateNote();

  const cd = useLiveCountdown(liveState);

  if (isLoading) {
    return <div className="p-12 text-center text-secondary">Loading...</div>;
  }

  if (!meeting) {
    return <div className="p-12 text-center text-secondary">Meeting not found</div>;
  }

  const agendaItems = (meeting.agendaItems ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  const completed = agendaItems.filter((i) => i.status === "COMPLETED" || i.status === "SKIPPED").length;
  const total = agendaItems.length;

  const isOrganizer = meeting.organizerId === currentUser?.id;
  const isSecretary = currentUser?.operationalRole === "SECRETARY";

  const isAttendee = meeting.attendees?.some((a) => a.userId === currentUser?.id && !a.removedAt);
  const isSpeaker = meeting.agendaItems?.some((item) => item.speakers?.some((s) => s.userId === currentUser?.id));
  const isEligibleForNote = !!(isAttendee || isSpeaker);
  const myNote = notes?.find((n) => n.authorId === currentUser?.id);

  const isOvertime = !!(liveState?.overtimeDeadlineAt);

  const meetingRemaining = cd?.meetingRemainingSeconds ?? 0;
  const meetingProgress = cd?.meetingProgress ?? 0;
  const activeItemSecs = cd?.activeItemSeconds ?? 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-outline-variant/20 bg-surface-container-lowest">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-error animate-pulse" />
          <span className="font-headline text-base font-semibold text-on-surface">{meeting.title}</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {meeting.status === "IN_PROGRESS" ? "Live" : meeting.status === "ENDED_PENDING_SUMMARY" ? "Ended" : meeting.status}
          </span>
          {meeting.status === "IN_PROGRESS" && isOvertime && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              Overtime
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary">{meeting.attendees?.length ?? 0} participants</span>
          </div>
          {meeting.status === "SCHEDULED" && isOrganizer && (
            <button
              onClick={() => startMeeting.mutate(id)}
              disabled={startMeeting.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 disabled:opacity-50 disabled:pointer-events-none transition-all"
            >
              {startMeeting.isPending ? "Starting..." : "Start Meeting"}
            </button>
          )}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left */}
        <div className="flex-[1.8] p-6 space-y-6 overflow-y-auto">
          {/* Timer cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container-low rounded-xl p-5 space-y-3">
              <p className="text-xs text-secondary uppercase tracking-wider font-semibold">
                {meeting.status === "IN_PROGRESS" ? "Time Remaining" : "Duration"}
              </p>
              <p className="font-headline text-3xl font-semibold text-on-surface">
                {meeting.status === "IN_PROGRESS"
                  ? formatDuration(meetingRemaining)
                  : formatDuration(meeting.plannedDurationSeconds)}
              </p>
              <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${meetingProgress}%` }}
                />
              </div>
            </div>
            <div className="bg-primary/5 rounded-xl p-5 space-y-3">
              <p className="text-xs text-primary/70 uppercase tracking-wider font-semibold">Active Agenda Item</p>
              <p className="font-headline text-3xl font-semibold text-primary">
                {liveState?.activeAgendaItemId && cd
                  ? formatDuration(activeItemSecs)
                  : "—"}
              </p>
              <p className="text-xs text-primary/70">
                {agendaItems.find((a) => a.id === liveState?.activeAgendaItemId)?.title ?? "No active item"}
              </p>
            </div>
          </div>

          {/* Meeting Organizer + Notes */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface-container-low rounded-xl p-5 space-y-3">
              <p className="text-xs text-secondary uppercase tracking-wider font-semibold">Organizer</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {meeting.organizer ? getInitials(meeting.organizer.name) : "?"}
                </div>
                <div>
                  <p className="text-sm font-medium text-on-surface">{meeting.organizer?.name ?? "—"}</p>
                </div>
              </div>
            </div>
            <div className="col-span-2 bg-surface-container-low rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-secondary uppercase tracking-wider font-semibold">
                  Notes ({notes?.length ?? 0})
                </p>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {notes && notes.length > 0 ? (
                  notes.map((note) => (
                    <p key={note.id} className="text-xs text-on-surface">
                      <span className="font-semibold">{note.author?.name}:</span> {note.content}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-secondary/60">No notes yet</p>
                )}
              </div>

              {/* One-note composer */}
              {meeting.status === "IN_PROGRESS" && isEligibleForNote && !myNote && (
                <div className="mt-2 space-y-2 border-t border-outline-variant/10 pt-3">
                  <p className="text-xs text-secondary uppercase tracking-wider font-semibold">Your note</p>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Write your note..."
                    rows={2}
                    className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-high p-2 text-xs text-on-surface placeholder:text-secondary/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {createNote.error && (
                    <p className="text-xs text-destructive">{createNote.error.message}</p>
                  )}
                  <button
                    onClick={() => {
                      if (noteContent.trim()) {
                        createNote.mutate({ meetingId: id, content: noteContent.trim() }, {
                          onSuccess: () => setNoteContent(""),
                        });
                      }
                    }}
                    disabled={createNote.isPending || !noteContent.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    {createNote.isPending ? "Submitting..." : "Submit Note"}
                  </button>
                </div>
              )}
              {meeting.status === "IN_PROGRESS" && isEligibleForNote && myNote && (
                <p className="mt-2 text-xs text-secondary/60">Your note was submitted</p>
              )}
            </div>
          </div>

          {/* Summary section for ENDED_PENDING_SUMMARY */}
          {meeting.status === "ENDED_PENDING_SUMMARY" && (
            <div className="bg-surface-container-low rounded-xl p-5 space-y-3">
              <p className="text-xs text-secondary uppercase tracking-wider font-semibold">Meeting Summary</p>
              {isOrganizer ? (
                <div className="space-y-3">
                  <textarea
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    placeholder="Write a summary of the meeting..."
                    rows={4}
                    className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-sm text-on-surface placeholder:text-secondary/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {(startMeeting.error || endMeeting.error || submitSummary.error) && (
                    <p className="text-xs text-destructive">
                      {submitSummary.error?.message}
                    </p>
                  )}
                  <button
                    onClick={() => {
                      if (summaryText.trim()) {
                        submitSummary.mutate({ id, summary: summaryText.trim() });
                      }
                    }}
                    disabled={submitSummary.isPending || !summaryText.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    {submitSummary.isPending ? "Submitting..." : "Submit Summary"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-secondary/60">
                  {isSecretary ? "Waiting for the organizer to submit the summary." : "The meeting has ended."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-96 border-l border-outline-variant/20 bg-surface-container-lowest p-6 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="font-headline text-base font-semibold text-on-surface">Meeting Agenda</h2>
            <span className="text-xs font-medium text-secondary bg-surface-container-high px-2 py-0.5 rounded-full">
              {completed}/{total}
            </span>
          </div>

          <div className="space-y-2">
            {agendaItems.map((item, idx) => (
              <div
                key={item.id || `item-${idx}`}
                className={cn(
                  "rounded-xl p-4 transition-all",
                  item.id === liveState?.activeAgendaItemId
                    ? "bg-surface-container-lowest shadow-md border-l-4 border-primary"
                    : item.status === "COMPLETED" || item.status === "SKIPPED"
                    ? "opacity-60"
                    : "bg-surface-container-low"
                )}
              >
                {(item.status === "COMPLETED" || item.status === "SKIPPED") && (
                  <div className="flex items-start gap-3">
                    <span className={cn(
                      "h-5 w-5 shrink-0",
                      item.status === "COMPLETED" ? "text-primary" : "text-secondary/40"
                    )}>
                      {item.status === "COMPLETED" ? <CheckCircleOutlineIcon className="h-5 w-5" /> : <RemoveCircleIcon className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-sm font-medium",
                        item.status === "COMPLETED" ? "text-on-surface line-through" : "text-secondary/60"
                      )}>
                        {item.title}
                      </p>
                      <p className="text-xs text-secondary mt-0.5">{formatDuration(item.durationSeconds)}</p>
                    </div>
                  </div>
                )}

                {item.id === liveState?.activeAgendaItemId && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <PlayCircleIcon className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-on-surface">{item.title}</p>
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            IN PROGRESS
                          </span>
                        </div>
                        <p className="text-xs text-secondary mt-1">
                          {formatDuration(item.durationSeconds)} · {liveState.activeItemBudgetSeconds ? formatDuration(activeItemSecs) : "—"} remaining
                        </p>
                      </div>
                    </div>
                    {item.speakers && item.speakers.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        {item.speakers.map((s) => (
                          <div
                            key={s.userId}
                            className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold border-2 border-surface-container-lowest"
                          >
                            {s.user ? getInitials(s.user.name) : "?"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {item.status === "NOT_STARTED" && item.id !== liveState?.activeAgendaItemId && (
                  <div className="flex items-start gap-3">
                    <CircleIcon className="h-5 w-5 text-secondary/60 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface">{item.title}</p>
                      <p className="text-xs text-secondary mt-0.5">Scheduled: {formatDuration(item.durationSeconds)}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-outline-variant/20 bg-surface-container-lowest px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              {meeting.attendees?.filter((a) => !a.removedAt).slice(0, 5).map((a, i) => (
                <div
                  key={a.id || a.userId}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-surface-container-lowest -mr-2",
                    avatarColors[i % avatarColors.length],
                    "text-white"
                  )}
                >
                  {a.user ? getInitials(a.user.name) : "?"}
                </div>
              ))}
              {(meeting.attendees?.filter((a) => !a.removedAt).length ?? 0) > 5 && (
                <div className="w-8 h-8 rounded-full bg-surface-container-high text-secondary flex items-center justify-center text-[10px] font-bold border-2 border-surface-container-lowest">
                  +{(meeting.attendees?.filter((a) => !a.removedAt).length ?? 0) - 5}
                </div>
              )}
            </div>
            {meeting.attendees && meeting.attendees.length > 0 && (
              <span className="text-sm font-medium text-on-surface">{meeting.status === "IN_PROGRESS" ? "Connected" : "Attended"}</span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {(startMeeting.error || endMeeting.error || skipCurrent.error || extendAgenda.error || extendOvertime.error || takeover.error) && (
              <p className="text-xs text-destructive mr-2">
                {(startMeeting.error ?? endMeeting.error ?? skipCurrent.error ?? extendAgenda.error ?? extendOvertime.error ?? takeover.error)?.message}
              </p>
            )}

            {/* SCHEDULED */}
            {meeting.status === "SCHEDULED" && isSecretary && !isOrganizer && (
              <button
                onClick={() => takeover.mutate(id)}
                disabled={takeover.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                {takeover.isPending ? "Taking Over..." : "Take Over"}
              </button>
            )}

            {/* IN_PROGRESS (normal) */}
            {meeting.status === "IN_PROGRESS" && !isOvertime && (
              <>
                {isOrganizer && (
                  <>
                    <button
                      onClick={() => skipCurrent.mutate(id)}
                      disabled={skipCurrent.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50 disabled:pointer-events-none transition-all"
                    >
                      Skip Current Item
                    </button>
                    {[300, 600, 900].map((secs) => (
                      <button
                        key={secs}
                        onClick={() => extendAgenda.mutate({ meetingId: id, seconds: secs })}
                        disabled={extendAgenda.isPending}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50 disabled:pointer-events-none transition-all"
                      >
                        +{secs / 60}
                      </button>
                    ))}
                    <div className="w-px h-6 bg-outline-variant/20 mx-1" />
                  </>
                )}
                {isSecretary && !isOrganizer && (
                  <button
                    onClick={() => takeover.mutate(id)}
                    disabled={takeover.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    {takeover.isPending ? "Taking Over..." : "Take Over"}
                  </button>
                )}
                {(isOrganizer || isSecretary) && (
                  <button
                    onClick={() => endMeeting.mutate(id)}
                    disabled={endMeeting.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    {endMeeting.isPending ? "Ending..." : "End Meeting"}
                  </button>
                )}
              </>
            )}

            {/* IN_PROGRESS + OVERTIME */}
            {meeting.status === "IN_PROGRESS" && isOvertime && (
              <>
                {isOrganizer && (
                  <button
                    onClick={() => extendOvertime.mutate({ meetingId: id, seconds: 300 })}
                    disabled={extendOvertime.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    Extend 5 Minutes
                  </button>
                )}
                {(isOrganizer || isSecretary) && (
                  <button
                    onClick={() => endMeeting.mutate(id)}
                    disabled={endMeeting.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    {endMeeting.isPending ? "Ending..." : "End Meeting"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
