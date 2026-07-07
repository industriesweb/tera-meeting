"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/api/queries/auth";
import { useCreateExecutiveRequest } from "@/lib/api/queries/executive-requests";
import { useTeams } from "@/lib/api/queries/teams";
import { useUsers } from "@/lib/api/queries/users";
import { type TargetMode, buildExecutiveTargets } from "@/features/executive-requests/executive-targets";

export default function NewExecutiveRequestPage() {
  const router = useRouter();
  const { data: currentUser, isLoading } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: teams = [] } = useTeams();
  const createRequest = useCreateExecutiveRequest();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<TargetMode>("USER");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetTeamIds, setTargetTeamIds] = useState<string[]>([]);
  const [requestedDate, setRequestedDate] = useState("");
  const [preferredPeriod, setPreferredPeriod] = useState<"MORNING" | "AFTERNOON">("MORNING");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [urgency, setUrgency] = useState("NORMAL");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);

  if (isLoading) return <div className="p-8 text-secondary">Loading…</div>;
  if (!currentUser?.isExecutive) return <div data-testid="request-create-forbidden" className="m-8 rounded-2xl border border-error/20 bg-error/5 p-8"><h1 className="text-xl font-bold">Executive Request creation unavailable</h1><p className="mt-2 text-secondary">Only executives can create Executive Requests.</p></div>;

  async function submit() {
    setErrors({}); setMessage(null);
    const nextErrors: Record<string, string[]> = {};
    if (!title.trim()) nextErrors.title = ["Title is required"];
    if (!requestedDate) nextErrors.requestedDate = ["Requested date is required"];
    let targets;
    try { targets = buildExecutiveTargets(mode, targetUserId, targetTeamIds); }
    catch (error) { nextErrors.targets = [error instanceof Error ? error.message : "Select a target"]; }
    if (Object.keys(nextErrors).length || !targets) { setErrors(nextErrors); return; }
    try {
      const request = await createRequest.mutateAsync({
        title: title.trim(), description: description.trim() || undefined, requestedDate,
        preferredPeriod, requestedDurationSeconds: durationMinutes * 60, urgency, targets,
      });
      router.push(`/executive-requests/${request.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        setErrors(details?.fieldErrors ?? {}); setMessage(error.message);
      } else setMessage(error instanceof Error ? error.message : "Request creation failed");
    }
  }

  return <div className="mx-auto max-w-3xl p-8"><h1 className="text-3xl font-bold">New Executive Request</h1><div className="mt-6 space-y-5 rounded-2xl bg-surface-container-lowest p-6">
    <label className="block text-sm font-semibold">Title<input aria-label="Request title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" />{errors.title && <span className="text-xs text-error">{errors.title.join("; ")}</span>}</label>
    <label className="block text-sm font-semibold">Description<textarea aria-label="Request description" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" /></label>
    <div><p className="text-sm font-semibold">Target mode</p><div className="mt-2 flex gap-2">{(["USER", "TEAM"] as TargetMode[]).map((value) => <button type="button" key={value} onClick={() => { setMode(value); setTargetUserId(""); setTargetTeamIds([]); }} className={`rounded-xl border px-4 py-2 ${mode === value ? "bg-primary text-primary-foreground" : ""}`}>{value}</button>)}</div></div>
    {mode === "USER" ? <label className="block text-sm font-semibold">Target user<select aria-label="Target user" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal"><option value="">Select one user…</option>{users.filter((user) => user.isActive).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label> : <div><p className="text-sm font-semibold">Target Teams</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{teams.map((team) => <label key={team.id} className="rounded-xl border p-3 text-sm"><input type="checkbox" className="mr-2" checked={targetTeamIds.includes(team.id)} onChange={() => setTargetTeamIds((ids) => ids.includes(team.id) ? ids.filter((id) => id !== team.id) : [...ids, team.id])} />{team.name}</label>)}</div></div>}{errors.targets && <p className="text-xs text-error">{errors.targets.join("; ")}</p>}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Requested date<input aria-label="Requested date" type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal" /></label><label className="text-sm font-semibold">Preferred period<select aria-label="Preferred period" value={preferredPeriod} onChange={(e) => setPreferredPeriod(e.target.value as typeof preferredPeriod)} className="mt-1 w-full rounded-xl border p-3 font-normal"><option value="MORNING">Morning</option><option value="AFTERNOON">Afternoon</option></select></label></div>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Requested duration (minutes)<input aria-label="Requested duration" type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="mt-1 w-full rounded-xl border p-3 font-normal" /></label><label className="text-sm font-semibold">Urgency<select aria-label="Urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-normal"><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label></div>
    {message && <p className="rounded-xl bg-error/10 p-3 text-sm text-error">{message}</p>}<button type="button" onClick={submit} disabled={createRequest.isPending} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">{createRequest.isPending ? "Submitting…" : "Create Request"}</button>
  </div></div>;
}
