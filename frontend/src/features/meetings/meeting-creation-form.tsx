"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/api/queries/auth";
import { useCreateQuickMeeting, useCreateStructuredMeeting } from "@/lib/api/queries/meetings";
import { useTeamParkingLotItems } from "@/lib/api/queries/parking-lot";
import { useRooms } from "@/lib/api/queries/rooms";
import { useTeams } from "@/lib/api/queries/teams";
import { useUsers } from "@/lib/api/queries/users";
import { mapQuickMeetingFormToDto, mapStructuredMeetingFormToDto, validateAgendaTotal } from "@/lib/api/mappers";
import type { LocationType, User } from "@/types/api";

export type CreationMode = "quick" | "structured";
export type AgendaFormItem = { title: string; durationMinutes: number; speakerIds: string[]; notes: string };
export type SelectionState = { attendeeIds: string[]; agendaItems: AgendaFormItem[]; parkingLotItemIds: string[] };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const structuredSteps = ["Basics", "Agenda", "People, Location, Parking Lot", "Review and Create"];

export function creationAccess(user?: Pick<User, "operationalRole" | "functionalTeamId" | "isExecutive"> | null) {
  if (!user) return { allowed: false, reason: "Loading your profile…" };
  if (user.operationalRole === "SECRETARY") return { allowed: true, lockedTeamId: null };
  if (user.operationalRole === "TEAM_ADMIN") {
    return user.functionalTeamId
      ? { allowed: true, lockedTeamId: user.functionalTeamId }
      : { allowed: false, reason: "Your Team Admin profile is not assigned to a Functional Team." };
  }
  return {
    allowed: false,
    reason: user.isExecutive
      ? "Executives cannot directly create meetings. Submit an Executive Request instead."
      : "Members do not have permission to create meetings.",
  };
}

export function resetTeamSelections(state: SelectionState): SelectionState {
  return {
    attendeeIds: [],
    agendaItems: state.agendaItems.map((item) => ({ ...item, speakerIds: [] })),
    parkingLotItemIds: [],
  };
}

export function applyLocationChange(locationType: LocationType) {
  return {
    locationType,
    roomId: locationType === "ONLINE" ? null : undefined,
    onlineLink: locationType === "PHYSICAL" ? "" : undefined,
  };
}

export function validateAgendaItems(items: AgendaFormItem[], plannedDurationMinutes: number): string | null {
  if (!items.length || items.some((item) => !item.title.trim())) return "Every agenda item needs a title";
  return validateAgendaTotal(items, plannedDurationMinutes);
}

function readFieldErrors(error: ApiError): Record<string, string[]> {
  const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
  return details?.fieldErrors ?? {};
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="mt-1 text-xs text-error">{errors.join("; ")}</p> : null;
}

export function MeetingCreationForm({ mode }: { mode: CreationMode }) {
  const router = useRouter();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useUsers();
  const { data: rooms = [] } = useRooms();
  const quickMutation = useCreateQuickMeeting();
  const structuredMutation = useCreateStructuredMeeting();

  const access = creationAccess(currentUser);
  const [ownerTeamId, setOwnerTeamId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState(45);
  const [locationType, setLocationType] = useState<LocationType>("PHYSICAL");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [onlineLink, setOnlineLink] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaFormItem[]>([
    { title: "", durationMinutes: 10, speakerIds: [], notes: "" },
  ]);
  const [parkingLotItemIds, setParkingLotItemIds] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: parkingItems = [] } = useTeamParkingLotItems(ownerTeamId);
  const availableParkingItems = parkingItems.filter((item) => item.status === "APPROVED" && !item.agendaMeetingId);
  const selectedTeam = teams.find((team) => team.id === ownerTeamId);
  const teamMembers = useMemo(
    () => users.filter((user) => user.functionalTeamId === ownerTeamId && user.isActive),
    [ownerTeamId, users],
  );
  const agendaTotal = agendaItems.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  const isPending = quickMutation.isPending || structuredMutation.isPending;

  useEffect(() => {
    if (access.allowed && access.lockedTeamId && ownerTeamId !== access.lockedTeamId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOwnerTeamId(access.lockedTeamId);
    }
  }, [access.allowed, access.lockedTeamId, ownerTeamId]);

  if (userLoading) return <div className="p-10 text-secondary">Loading your meeting permissions…</div>;
  if (!access.allowed) {
    return <div data-testid="creation-forbidden" className="m-8 rounded-2xl border border-error/20 bg-error/5 p-8"><h1 className="text-xl font-bold">Meeting creation unavailable</h1><p className="mt-2 text-secondary">{access.reason}</p></div>;
  }

  function changeTeam(nextTeamId: string) {
    const reset = resetTeamSelections({ attendeeIds, agendaItems, parkingLotItemIds });
    setOwnerTeamId(nextTeamId);
    setAttendeeIds(reset.attendeeIds);
    setAgendaItems(reset.agendaItems);
    setParkingLotItemIds(reset.parkingLotItemIds);
    setFieldErrors({});
  }

  function changeLocation(next: LocationType) {
    const changed = applyLocationChange(next);
    setLocationType(next);
    if (changed.roomId === null) setRoomId(null);
    if (changed.onlineLink === "") setOnlineLink("");
    setFieldErrors((current) => ({ ...current, roomId: [], onlineLink: [] }));
  }

  function validateCurrent(): boolean {
    const errors: Record<string, string[]> = {};
    if (!title.trim()) errors.title = ["Title is required"];
    if (!UUID_PATTERN.test(ownerTeamId) || !teams.some((team) => team.id === ownerTeamId)) errors.ownerTeamId = ["Select a valid Functional Team"];
    if (!date || !time) errors.scheduledAt = ["Scheduled date and time are required"];
    if (!Number.isInteger(plannedDurationMinutes) || plannedDurationMinutes <= 0) errors.plannedDurationSeconds = ["Duration must be a positive whole number"];
    if (step >= 3) {
      if ((locationType === "PHYSICAL" || locationType === "HYBRID") && !roomId) errors.roomId = ["Room is required"];
      if ((locationType === "ONLINE" || locationType === "HYBRID") && !onlineLink.trim()) errors.onlineLink = ["Online link is required"];
      if (onlineLink && !/^https?:\/\//i.test(onlineLink)) errors.onlineLink = ["Enter a valid URL"];
    }
    if (step >= 2 && mode === "structured") {
      const agendaError = validateAgendaItems(agendaItems, plannedDurationMinutes);
      if (agendaError) errors.agendaItems = [agendaError];
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit() {
    setSubmitError(null);
    if (!validateCurrent()) return;
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    const base = { title, ownerTeamId, plannedDurationMinutes, scheduledAt, locationType, roomId, onlineLink: onlineLink || null, attendeeIds };
    try {
      const meeting = mode === "quick"
        ? await quickMutation.mutateAsync(mapQuickMeetingFormToDto(base))
        : await structuredMutation.mutateAsync(mapStructuredMeetingFormToDto({ ...base, agendaItems, parkingLotItemIds }));
      setSuccess(`${mode === "quick" ? "Quick" : "Structured"} meeting created successfully`);
      window.setTimeout(() => router.push(`/meetings/${meeting.id}`), 500);
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(readFieldErrors(error));
        setSubmitError(error.message);
      } else setSubmitError(error instanceof Error ? error.message : "Meeting creation failed");
    }
  }

  const basics = (
    <div className="grid gap-5 md:grid-cols-2">
      <label className="md:col-span-2 text-sm font-semibold">Title<input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" /><FieldError errors={fieldErrors.title} /></label>
      <label className="text-sm font-semibold">Owner Team<select aria-label="Owner Team" value={ownerTeamId} onChange={(e) => changeTeam(e.target.value)} disabled={!!access.lockedTeamId} className="mt-1 w-full rounded-xl border p-3 font-normal"><option value="">Select a team…</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><FieldError errors={fieldErrors.ownerTeamId} /></label>
      <label className="text-sm font-semibold">Planned duration (minutes)<input aria-label="Planned duration" type="number" min={1} value={plannedDurationMinutes} onChange={(e) => setPlannedDurationMinutes(Number(e.target.value))} className="mt-1 w-full rounded-xl border p-3 font-normal" /><FieldError errors={fieldErrors.plannedDurationSeconds} /></label>
      <label className="text-sm font-semibold">Date<input aria-label="Scheduled date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" /></label>
      <label className="text-sm font-semibold">Time<input aria-label="Scheduled time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" /><FieldError errors={fieldErrors.scheduledAt} /></label>
    </div>
  );

  const locationAndPeople = (
    <div className="space-y-5">
      <div><p className="text-sm font-semibold">Location type</p><div className="mt-2 flex gap-2">{(["PHYSICAL", "ONLINE", "HYBRID"] as LocationType[]).map((type) => <button type="button" key={type} onClick={() => changeLocation(type)} className={`rounded-xl border px-4 py-2 text-sm ${locationType === type ? "bg-primary text-primary-foreground" : ""}`}>{type}</button>)}</div></div>
      {(locationType === "PHYSICAL" || locationType === "HYBRID") && <label className="block text-sm font-semibold">Room<select aria-label="Room" value={roomId ?? ""} onChange={(e) => setRoomId(e.target.value || null)} className="mt-1 w-full rounded-xl border p-3 font-normal"><option value="">Select a room…</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select><FieldError errors={fieldErrors.roomId} /></label>}
      {(locationType === "ONLINE" || locationType === "HYBRID") && <label className="block text-sm font-semibold">Online link<input aria-label="Online link" value={onlineLink} onChange={(e) => setOnlineLink(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" placeholder="https://…" /><FieldError errors={fieldErrors.onlineLink} /></label>}
      <div><p className="text-sm font-semibold">Same-Team attendees</p><p className="text-xs text-secondary">Cross-Team invitations happen after meeting creation.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{teamMembers.map((member) => <label key={member.id} className="rounded-xl border p-3 text-sm"><input type="checkbox" checked={attendeeIds.includes(member.id)} onChange={() => setAttendeeIds((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} className="mr-2" />{member.name}</label>)}</div></div>
    </div>
  );

  const agenda = (
    <div className="space-y-4" data-testid="agenda-section"><div className="flex justify-between"><div><h2 className="font-bold">Agenda</h2><p className="text-sm text-secondary">Running total: {agendaTotal} / {plannedDurationMinutes} minutes</p></div><button type="button" onClick={() => setAgendaItems((items) => [...items, { title: "", durationMinutes: 10, speakerIds: [], notes: "" }])} className="rounded-xl border px-3 py-2">Add item</button></div><FieldError errors={fieldErrors.agendaItems} />
      {agendaItems.map((item, index) => <div key={index} className="rounded-xl bg-surface-container-low p-4"><div className="grid gap-3 md:grid-cols-[1fr_140px_auto]"><input aria-label={`Agenda title ${index + 1}`} value={item.title} onChange={(e) => setAgendaItems((items) => items.map((value, i) => i === index ? { ...value, title: e.target.value } : value))} className="rounded-xl border p-3" placeholder="Agenda title" /><input aria-label={`Agenda duration ${index + 1}`} type="number" min={0} value={item.durationMinutes} onChange={(e) => setAgendaItems((items) => items.map((value, i) => i === index ? { ...value, durationMinutes: Number(e.target.value) } : value))} className="rounded-xl border p-3" /><button type="button" onClick={() => setAgendaItems((items) => items.filter((_, i) => i !== index))}>Remove</button></div><div className="mt-3 flex flex-wrap gap-2">{teamMembers.map((member) => <button type="button" key={member.id} onClick={() => setAgendaItems((items) => items.map((value, i) => i === index ? { ...value, speakerIds: value.speakerIds.includes(member.id) ? value.speakerIds.filter((id) => id !== member.id) : [...value.speakerIds, member.id] } : value))} className={`rounded-full px-3 py-1 text-xs ${item.speakerIds.includes(member.id) ? "bg-primary text-primary-foreground" : "bg-surface-container-high text-on-surface"}`}>{member.name}</button>)}</div></div>)}
    </div>
  );

  const parking = mode === "structured" ? <div data-testid="parking-lot-section"><h2 className="font-bold">Approved Parking Lot items</h2><div className="mt-2 space-y-2">{availableParkingItems.map((item) => <label key={item.id} className="block rounded-xl border p-3 text-sm"><input type="checkbox" className="mr-2" checked={parkingLotItemIds.includes(item.id)} onChange={() => setParkingLotItemIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.title}</label>)}{!availableParkingItems.length && <p className="text-sm text-secondary">No approved unused items.</p>}</div></div> : null;

  const reviewStart = date && time ? new Date(`${date}T${time}`) : null;
  const reviewEnd = reviewStart ? new Date(reviewStart.getTime() + plannedDurationMinutes * 60_000) : null;
  const review = <div className="space-y-3" data-testid="review-step"><h2 className="font-bold">Review and Create</h2><dl className="grid gap-2 text-sm"><div><dt className="text-secondary">Title</dt><dd>{title}</dd></div><div><dt className="text-secondary">Owner Team</dt><dd>{selectedTeam?.name ?? "Not selected"}</dd></div><div><dt className="text-secondary">Scheduled</dt><dd>{reviewStart?.toLocaleString() ?? "Not scheduled"} {reviewEnd ? `– ${reviewEnd.toLocaleString()}` : ""}</dd></div><div><dt className="text-secondary">Duration</dt><dd>{plannedDurationMinutes} minutes</dd></div><div><dt className="text-secondary">Location</dt><dd>{locationType}{roomId ? ` · ${rooms.find((room) => room.id === roomId)?.name}` : ""}{onlineLink ? ` · ${onlineLink}` : ""}</dd></div><div><dt className="text-secondary">Attendees</dt><dd>{teamMembers.filter((member) => attendeeIds.includes(member.id)).map((member) => member.name).join(", ") || "None"}</dd></div>{mode === "structured" && <><div><dt className="text-secondary">Agenda and speakers</dt><dd>{agendaItems.map((item) => `${item.title || "Untitled"} (${item.speakerIds.length} speakers)`).join(", ")}</dd></div><div><dt className="text-secondary">Parking Lot</dt><dd>{availableParkingItems.filter((item) => parkingLotItemIds.includes(item.id)).map((item) => item.title).join(", ") || "None"}</dd></div></>}</dl></div>;

  const content = mode === "quick" ? <>{basics}<div className="mt-6">{locationAndPeople}</div></> : step === 1 ? basics : step === 2 ? agenda : step === 3 ? <div className="space-y-7">{locationAndPeople}{parking}</div> : review;

  return <div className="mx-auto max-w-5xl p-8"><div className="mb-6"><p className="text-sm text-primary">{mode === "quick" ? "Quick Meeting" : "Structured Meeting"}</p><h1 className="text-3xl font-bold">Create {mode === "quick" ? "a Quick" : "a Structured"} Meeting</h1>{mode === "structured" && <p className="mt-2 text-sm text-secondary">Step {step} of 4 · {structuredSteps[step - 1]}</p>}</div><div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">{content}{submitError && <p className="mt-5 rounded-xl bg-error/10 p-3 text-sm text-error">{submitError}</p>}<div className="mt-6 flex justify-between border-t pt-4">{mode === "structured" && step > 1 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="rounded-xl border px-4 py-2">Back</button> : <span />}{mode === "structured" && step < 4 ? <button type="button" onClick={() => { if (validateCurrent() || step < 2) setStep((value) => value + 1); }} className="rounded-xl bg-primary px-5 py-2 text-primary-foreground">Continue</button> : <button type="button" onClick={submit} disabled={isPending || !UUID_PATTERN.test(ownerTeamId)} className="rounded-xl bg-primary px-5 py-2 text-primary-foreground disabled:opacity-40">{isPending ? "Creating…" : "Create Meeting"}</button>}</div></div>{success && <div role="status" className="fixed bottom-6 right-6 rounded-xl bg-primary px-5 py-3 text-primary-foreground shadow-xl">{success}</div>}</div>;
}
