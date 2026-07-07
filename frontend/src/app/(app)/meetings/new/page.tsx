"use client";

import Link from "next/link";
import { useCurrentUser } from "@/lib/api/queries/auth";
import { creationAccess } from "@/features/meetings/meeting-creation-form";

export default function NewMeetingPage() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <div className="p-10 text-secondary">Loading your meeting permissions…</div>;
  const access = creationAccess(user);
  if (!access.allowed) return <div data-testid="creation-forbidden" className="m-8 rounded-2xl border border-error/20 bg-error/5 p-8"><h1 className="text-xl font-bold">Meeting creation unavailable</h1><p className="mt-2 text-secondary">{access.reason}</p></div>;

  return <div className="mx-auto max-w-5xl p-8"><h1 className="text-3xl font-bold">Create a meeting</h1><p className="mt-2 text-secondary">Choose the workflow that matches the meeting.</p><div className="mt-8 grid gap-6 md:grid-cols-2"><Link href="/meetings/new/quick" className="rounded-2xl border bg-surface-container-lowest p-7 transition hover:border-primary"><h2 className="text-xl font-bold">Quick Meeting</h2><p className="mt-2 text-sm text-secondary">Schedule a focused same-Team meeting without an agenda or Parking Lot.</p></Link><Link href="/meetings/new/structured" className="rounded-2xl border bg-primary p-7 text-primary-foreground transition hover:brightness-110"><h2 className="text-xl font-bold">Structured Meeting</h2><p className="mt-2 text-sm text-primary-foreground/80">Build an ordered agenda with speakers, participants, location, and approved Parking Lot items.</p></Link></div></div>;
}
