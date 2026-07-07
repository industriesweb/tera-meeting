"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/api/queries/auth";
import { useExecutiveRequest, usePlanMeeting } from "@/lib/api/queries/executive-requests";
import { useTeamParkingLotItems } from "@/lib/api/queries/parking-lot";
import { useRooms } from "@/lib/api/queries/rooms";
import { useTeams } from "@/lib/api/queries/teams";
import { useUsers } from "@/lib/api/queries/users";
import { mapExecutiveRequestPlanFormToDto, validateAgendaTotal } from "@/lib/api/mappers";
import type { LocationType } from "@/types/api";
import { requestDetailPermissions } from "@/features/executive-requests/request-detail-permissions";

type AgendaItem = { title: string; durationMinutes: number; speakerIds: string[]; notes: string };

const WINDOW_MORNING = { start: 8, end: 12 };
const WINDOW_AFTERNOON = { start: 13, end: 17 };

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

export default function PlanMeetingPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const { data: request, isLoading: reqLoading } = useExecutiveRequest(id);
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useUsers();
  const { data: rooms = [] } = useRooms();
  const planMutation = usePlanMeeting();

  const permissions = request ? requestDetailPermissions(request, currentUser) : null;

  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState(30);
  const [locationType, setLocationType] = useState<LocationType>("PHYSICAL");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [onlineLink, setOnlineLink] = useState("");
  const [ownerTeamId, setOwnerTeamId] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([
    { title: "", durationMinutes: 10, speakerIds: [], notes: "" },
  ]);
  const [parkingLotItemIds, setParkingLotItemIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: parkingItems = [] } = useTeamParkingLotItems(ownerTeamId);
  const availableParkingItems = parkingItems.filter((item) => item.status === "APPROVED" && !item.agendaMeetingId);
  const teamMembers = useMemo(
    () => users.filter((user) => user.functionalTeamId === ownerTeamId && user.isActive),
    [ownerTeamId, users],
  );

  useEffect(() => {
    if (!request) return;
    const allowedOwners = new Set(
      (request.targets ?? [])
        .filter((t) => t.targetType === "TEAM")
        .map((t) => t.targetTeamId)
        .filter(Boolean) as string[]
    );
    if (!ownerTeamId || !allowedOwners.has(ownerTeamId)) {
      if (allowedOwners.size === 1) {
        const next = [...allowedOwners][0];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOwnerTeamId(next);
      }
    }
  }, [request, ownerTeamId]);

  if (reqLoading) return <div className="p-8 text-secondary">Loading request…</div>;
  if (!request) return <div className="p-8">Request not found.</div>;
  if (!permissions?.canPlan) return <div className="p-8 text-secondary">You do not have permission to plan this request.</div>;

  const req = request;
  const requestedDateStr = req.requestedDate.slice(0, 10);
  const windowLimits = req.preferredPeriod === "AFTERNOON" ? WINDOW_AFTERNOON : WINDOW_MORNING;
  const allowedOwnerTeamIds = (req.targets ?? [])
    .filter((t) => t.targetType === "TEAM")
    .map((t) => t.targetTeamId)
    .filter(Boolean) as string[];
  const agendaTotal = agendaItems.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);

  function validateForm(): boolean {
    const errors: Record<string, string[]> = {};
    if (!title.trim()) errors.title = ["Title is required"];
    if (!time) errors.time = ["Time is required"];
    if (!requestedDateStr) errors.date = ["Request date is missing"];
    if (!Number.isInteger(plannedDurationMinutes) || plannedDurationMinutes <= 0) {
      errors.plannedDurationSeconds = ["Duration must be a positive whole number"];
    }

    if (time) {
      const startHour = parseInt(time.split(":")[0], 10);
      const startMin = parseInt(time.split(":")[1] ?? "0", 10);
      const endHourDecimal = startHour + startMin / 60 + plannedDurationMinutes / 60;
      if (startHour < windowLimits.start || endHourDecimal > windowLimits.end) {
        errors.time = [
          `Meeting must be within ${formatHour(windowLimits.start)}–${formatHour(windowLimits.end)} for ${req.preferredPeriod.toLowerCase()} period`
        ];
      }
    }

    if (!ownerTeamId || !allowedOwnerTeamIds.includes(ownerTeamId)) {
      errors.ownerTeamId = ["Select a valid target team"];
    }
    if ((locationType === "PHYSICAL" || locationType === "HYBRID") && !roomId) errors.roomId = ["Room is required"];
    if ((locationType === "ONLINE" || locationType === "HYBRID") && !onlineLink.trim()) errors.onlineLink = ["Online link is required"];
    if (onlineLink && !/^https?:\/\//i.test(onlineLink)) errors.onlineLink = ["Enter a valid URL"];

    const agendaError = validateAgendaItems(agendaItems, plannedDurationMinutes);
    if (agendaError) errors.agendaItems = [agendaError];

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateAgendaItems(items: AgendaItem[], maxMinutes: number): string | null {
    if (!items.length || items.some((item) => !item.title.trim())) return "Every agenda item needs a title";
    return validateAgendaTotal(items, maxMinutes);
  }

  async function submit() {
    setSubmitError(null);
    if (!validateForm()) return;
    const scheduledAt = new Date(`${requestedDateStr}T${time}:00`).toISOString();
    try {
      const meeting = await planMutation.mutateAsync({
        requestId: id,
        data: mapExecutiveRequestPlanFormToDto({
          title,
          ownerTeamId,
          plannedDurationMinutes,
          scheduledAt,
          locationType,
          roomId,
          onlineLink: onlineLink || null,
          attendeeIds,
          agendaItems,
          parkingLotItemIds,
        }),
      });
      router.push(`/meetings/${meeting.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        setFieldErrors(details?.fieldErrors ?? {});
        setSubmitError(error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : "Planning failed");
      }
    }
  }

  function changeLocation(next: LocationType) {
    setLocationType(next);
    if (next === "ONLINE") setRoomId(null);
    if (next === "PHYSICAL") setOnlineLink("");
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link href={`/executive-requests/${id}`} className="text-sm text-primary">← Back to request</Link>
      <div className="mb-6 mt-4">
        <p className="text-sm text-primary">Executive Request Planning</p>
        <h1 className="text-3xl font-bold">Plan Meeting</h1>
        <p className="mt-2 text-sm text-secondary">
          Requested: {requestedDateStr} · {req.preferredPeriod.toLowerCase()} · {Math.round((req.requestedDurationSeconds ?? 0) / 60)} min
        </p>
      </div>

      <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm space-y-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="md:col-span-2 text-sm font-semibold">
            Title
            <input aria-label="Plan title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" placeholder="Meeting title" />
            {fieldErrors.title && <p className="text-xs text-error">{fieldErrors.title.join("; ")}</p>}
          </label>

          <label className="text-sm font-semibold">
            Owner Team
            <select aria-label="Owner Team" value={ownerTeamId} onChange={(e) => setOwnerTeamId(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal">
              <option value="">Select a target team…</option>
              {teams.filter((t) => allowedOwnerTeamIds.includes(t.id)).map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
            {fieldErrors.ownerTeamId && <p className="text-xs text-error">{fieldErrors.ownerTeamId.join("; ")}</p>}
          </label>

          <label className="text-sm font-semibold">
            Planned duration (minutes)
            <input aria-label="Planned duration" type="number" min={1} value={plannedDurationMinutes} onChange={(e) => setPlannedDurationMinutes(Number(e.target.value))} className="mt-1 w-full rounded-xl border p-3 font-normal" />
            {fieldErrors.plannedDurationSeconds && <p className="text-xs text-error">{fieldErrors.plannedDurationSeconds.join("; ")}</p>}
          </label>

          <div className="text-sm font-semibold">
            <p>Requested date (locked)</p>
            <input aria-label="Requested date" type="date" value={requestedDateStr} disabled className="mt-1 w-full rounded-xl border p-3 font-normal bg-surface-container-high text-secondary/60" />
          </div>

          <label className="text-sm font-semibold">
            Time ({formatHour(windowLimits.start)}–{formatHour(windowLimits.end)})
            <input aria-label="Plan time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" />
            {fieldErrors.time && <p className="text-xs text-error">{fieldErrors.time.join("; ")}</p>}
          </label>
        </div>

        <div>
          <p className="text-sm font-semibold">Location type</p>
          <div className="mt-2 flex gap-2">
            {(["PHYSICAL", "ONLINE", "HYBRID"] as LocationType[]).map((type) => (
              <button type="button" key={type} onClick={() => changeLocation(type)}
                className={`rounded-xl border px-4 py-2 text-sm ${locationType === type ? "bg-primary text-primary-foreground" : ""}`}>
                {type}
              </button>
            ))}
          </div>
        </div>

        {(locationType === "PHYSICAL" || locationType === "HYBRID") && (
          <label className="block text-sm font-semibold">
            Room
            <select aria-label="Room" value={roomId ?? ""} onChange={(e) => setRoomId(e.target.value || null)} className="mt-1 w-full rounded-xl border p-3 font-normal">
              <option value="">Select a room…</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
            {fieldErrors.roomId && <p className="text-xs text-error">{fieldErrors.roomId.join("; ")}</p>}
          </label>
        )}

        {(locationType === "ONLINE" || locationType === "HYBRID") && (
          <label className="block text-sm font-semibold">
            Online link
            <input aria-label="Online link" value={onlineLink} onChange={(e) => setOnlineLink(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" placeholder="https://…" />
            {fieldErrors.onlineLink && <p className="text-xs text-error">{fieldErrors.onlineLink.join("; ")}</p>}
          </label>
        )}

        <div>
          <p className="text-sm font-semibold">Same-Team attendees</p>
          <p className="text-xs text-secondary">Cross-Team invitations happen after meeting creation.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {teamMembers.map((member) => (
              <label key={member.id} className="rounded-xl border p-3 text-sm">
                <input type="checkbox" checked={attendeeIds.includes(member.id)}
                  onChange={() => setAttendeeIds((current) =>
                    current.includes(member.id)
                      ? current.filter((id) => id !== member.id)
                      : [...current, member.id]
                  )} className="mr-2" />
                {member.name}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4" data-testid="agenda-section">
          <div className="flex justify-between">
            <div>
              <h2 className="font-bold">Agenda</h2>
              <p className="text-sm text-secondary">Running total: {agendaTotal} / {plannedDurationMinutes} minutes</p>
            </div>
            <button type="button" onClick={() => setAgendaItems((items) => [...items, { title: "", durationMinutes: 10, speakerIds: [], notes: "" }])}
              className="rounded-xl border px-3 py-2">Add item</button>
          </div>
          {fieldErrors.agendaItems && <p className="text-xs text-error">{fieldErrors.agendaItems.join("; ")}</p>}
          {agendaItems.map((item, index) => (
            <div key={index} className="rounded-xl bg-surface-container-low p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
                <input aria-label={`Agenda title ${index + 1}`} value={item.title}
                  onChange={(e) => setAgendaItems((items) => items.map((v, i) => i === index ? { ...v, title: e.target.value } : v))}
                  className="rounded-xl border p-3" placeholder="Agenda title" />
                <input aria-label={`Agenda duration ${index + 1}`} type="number" min={0} value={item.durationMinutes}
                  onChange={(e) => setAgendaItems((items) => items.map((v, i) => i === index ? { ...v, durationMinutes: Number(e.target.value) } : v))}
                  className="rounded-xl border p-3" />
                <button type="button" onClick={() => setAgendaItems((items) => items.filter((_, i) => i !== index))}>Remove</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {teamMembers.map((member) => (
                  <button type="button" key={member.id}
                    onClick={() => setAgendaItems((items) => items.map((v, i) => i === index ? {
                      ...v,
                      speakerIds: v.speakerIds.includes(member.id)
                        ? v.speakerIds.filter((id) => id !== member.id)
                        : [...v.speakerIds, member.id]
                    } : v))}
                    className={`rounded-full px-3 py-1 text-xs ${item.speakerIds.includes(member.id) ? "bg-primary text-primary-foreground" : "bg-surface-container-high text-on-surface"}`}>
                    {member.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div data-testid="parking-lot-section">
          <h2 className="font-bold">Approved Parking Lot items</h2>
          <div className="mt-2 space-y-2">
            {availableParkingItems.map((item) => (
              <label key={item.id} className="block rounded-xl border p-3 text-sm">
                <input type="checkbox" className="mr-2" checked={parkingLotItemIds.includes(item.id)}
                  onChange={() => setParkingLotItemIds((current) =>
                    current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
                  )} />
                {item.title}
              </label>
            ))}
            {!availableParkingItems.length && <p className="text-sm text-secondary">No approved unused items.</p>}
          </div>
        </div>

        {submitError && <p className="rounded-xl bg-error/10 p-3 text-sm text-error">{submitError}</p>}

        <div className="flex justify-end border-t pt-4">
          <button type="button" onClick={submit} disabled={planMutation.isPending}
            className="rounded-xl bg-primary px-5 py-2 text-primary-foreground disabled:opacity-40">
            {planMutation.isPending ? "Creating Meeting…" : "Plan Meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}
