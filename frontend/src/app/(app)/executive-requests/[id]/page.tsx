"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCurrentUser } from "@/lib/api/queries/auth";
import { useCancelExecutiveRequest, useExecutiveRequest, useStartPlanning } from "@/lib/api/queries/executive-requests";
import { requestDetailPermissions } from "@/features/executive-requests/request-detail-permissions";

function targetSummary(request: import("@/types/api").ExecutiveRequest) {
  return request.targets?.map((target) => target.targetType === "USER" ? target.targetUser?.name : target.targetTeam?.name).filter(Boolean).join(", ") || "No targets";
}

export default function ExecutiveRequestDetailPage() {
  const id = useParams().id as string;
  const { data: currentUser } = useCurrentUser();
  const { data: request, isLoading } = useExecutiveRequest(id);
  const startPlanning = useStartPlanning();
  const cancel = useCancelExecutiveRequest();
  if (isLoading) return <div className="p-8 text-secondary">Loading request…</div>;
  if (!request) return <div className="p-8">Request not found.</div>;
  const permissions = requestDetailPermissions(request, currentUser);

  return <div className="mx-auto max-w-4xl p-8"><Link href="/executive-requests" className="text-sm text-primary">← Executive Requests</Link><div className="mt-5 rounded-2xl bg-surface-container-lowest p-7"><div className="flex items-start justify-between"><div><p className="text-sm text-secondary">{request.status}</p><h1 className="text-3xl font-bold">{request.title}</h1></div><span className="rounded-full bg-primary/10 px-3 py-1 text-sm">{request.urgency ?? "NORMAL"}</span></div>
    <dl className="mt-7 grid gap-5 sm:grid-cols-2"><div><dt className="text-xs uppercase text-secondary">Creator</dt><dd>{request.createdBy?.name ?? "Unknown"}</dd></div><div><dt className="text-xs uppercase text-secondary">Targets</dt><dd data-testid="target-summary">{targetSummary(request)}</dd></div><div className="sm:col-span-2"><dt className="text-xs uppercase text-secondary">Description</dt><dd>{request.description || "No description"}</dd></div><div><dt className="text-xs uppercase text-secondary">Requested date</dt><dd>{new Date(request.requestedDate).toLocaleDateString()}</dd></div><div><dt className="text-xs uppercase text-secondary">Preferred period</dt><dd>{request.preferredPeriod}</dd></div><div><dt className="text-xs uppercase text-secondary">Requested duration</dt><dd>{request.requestedDurationSeconds ? `${Math.round(request.requestedDurationSeconds / 60)} minutes` : "Not specified"}</dd></div></dl>
    {request.currentMeeting && <Link href={`/meetings/${request.currentMeeting.id}`} className="mt-6 block rounded-xl border border-primary/20 bg-primary/5 p-4"><span className="text-xs text-secondary">Linked meeting</span><p className="font-bold">{request.currentMeeting.title}</p></Link>}
    <div className="mt-7 flex flex-wrap gap-3">{permissions.canStartPlanning && <button onClick={() => startPlanning.mutate(id)} className="rounded-xl border px-4 py-2">Start Planning</button>}{permissions.canPlan && <Link href={`/executive-requests/${id}/plan`} className="rounded-xl bg-primary px-4 py-2 text-primary-foreground">Plan Meeting</Link>}{permissions.canCancel && <button onClick={() => cancel.mutate(id)} className="rounded-xl bg-error px-4 py-2 text-error-foreground">Cancel Request</button>}{currentUser?.operationalRole === "SECRETARY" && request.currentMeeting && <Link href={`/meetings/${request.currentMeeting.id}`} className="rounded-xl border border-error/30 px-4 py-2 text-error">Open linked meeting cancellation flow</Link>}</div>
  </div></div>;
}
