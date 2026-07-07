# V2 Integration Audit

Scope: current Prisma schema, Zod schemas, backend routes/services, frontend API layer, and current route pages. Old docs were not used. Express wraps successful responses as `{ success: true, data: T }`; errors are `{ success: false, error: { code, message, details? } }`.

## 1. Canonical enums actually used

- Operational roles: `MEMBER | TEAM_ADMIN | SECRETARY`; executive status is the separate `isExecutive: boolean`.
- Meeting statuses: `DRAFT | SCHEDULED | IN_PROGRESS | ENDED_PENDING_SUMMARY | COMPLETED_LOCKED | CANCELLED`.
- Meeting kinds: `QUICK_TEAM | STRUCTURED`.
- Location types: `PHYSICAL | ONLINE | HYBRID`.
- Attendee roles: none. `MeetingAttendee` has no role field. Speaking is modeled independently by `AgendaItemSpeaker`.

## 2. Exact accepted request DTOs

All meeting-create Zod objects are strict; unknown keys are rejected. IDs marked UUID are validated as UUID strings.

### `POST /meetings/quick`

```ts
{
  title: string;                         // required, non-empty
  ownerTeamId: UUID;                     // required
  plannedDurationSeconds: positive int;  // required
  scheduledAt?: string;                  // not date-validated by Zod
  locationType?: "PHYSICAL" | "ONLINE" | "HYBRID";
  roomId?: UUID | null;
  onlineLink?: URL | null;
  attendeeIds?: UUID[];
  agendaItems?: Array<{
    title: string; durationSeconds?: nonnegative int; // defaults 0
    speakerIds?: UUID[]; notes?: string | null;
  }>;
}
```

`kind` and `parkingLotItemIds` are rejected. Location constraints run only when `locationType` is supplied: physical requires room/no link; online requires link/no room; hybrid requires both.

### `POST /meetings/structured`

Same fields as quick, plus:

```ts
{
  agendaItems: NonEmptyArray<{
    title: string; durationSeconds?: nonnegative int; // defaults 0
    speakerIds?: UUID[]; notes?: string | null;
  }>;
  parkingLotItemIds?: UUID[];
}
```

`kind` is rejected. Service also rejects total agenda duration greater than `plannedDurationSeconds`.

### `POST /executive-requests/:id/plan-meeting`

No Zod schema is applied. The controller forwards only these keys; unknown keys are ignored:

```ts
{
  title: string;
  scheduledAt: string;
  plannedDurationSeconds: number;
  roomId?: string | null;
  onlineLink?: string | null;             // forwarded but not persisted
  ownerTeamId: string;
  attendeeIds: string[];                  // runtime-required (`includes` is called)
  agendaItems: Array<{
    title: string; durationSeconds?: number;
    speakerIds?: string[]; notes?: string | null;
  }>;
  parkingLotItemIds?: string[];
  organizerId?: string | null;
}
```

`locationType` is not forwarded. Service enforces request status/authorization, requested date/period, non-empty agenda, agenda total, organizer membership, room conflicts, and approved same-org parking items.

## 3. Exact returned response shapes

All Prisma `DateTime` values serialize as ISO strings. “Scalars” below means every scalar field on that Prisma model.

- `GET /auth/me`: `User` scalars + `organization` (all Organization scalars) + `functionalTeam: { id, name } | null`. It may create/re-key a profile by authenticated subject/email.
- `GET /meetings`: array of Meeting scalars + `attendees` (MeetingAttendee scalars + full `user`) + `agendaItems` (AgendaItem scalars, ordered; no speakers) + full `creator`. Only meetings where caller is attendee or creator are returned.
- `GET /meetings/:id`: Meeting scalars + `attendees` (scalars + full user), ordered `agendaItems` (scalars; no speakers), `notes` (MeetingNote scalars + `author:{id,name}`), `timer` (MeetingTimer scalars or null), `bookings` (RoomBooking scalars), full `creator`, `organizer:{id,name,email}`, full `room|null`, `ownerTeam:{id,name}`.
- `GET /meetings/:id/live-state`: `{ meetingId, version, serverNow, meetingStatus, meetingStartedAt, plannedDurationSeconds, overtimeStartedAt, overtimeDeadlineAt, activeAgendaItemId, activeItemStartedAt, activeItemBudgetSeconds, activeItemExtensionSeconds, agendaComplete }`; timestamps/budget/item ID are nullable.
- `GET /dashboard`: `{ todayMeetings:number, upcomingMeetings:Array<{id,title,scheduledAt,plannedDurationSeconds}>, pendingDrafts:number, unreadCount:number }`. `scheduledAt` is selected as nullable in Prisma although frontend declares it non-null.
- `GET /teams`: active FunctionalTeam scalars + `members:Array<{id,name}>`.
- `GET /rooms`: active Room scalars only.

## 4. Frontend mismatches, ranked

### Blocker

- Executive-request page always uses `GET /executive-requests`, which backend permits only for `SECRETARY`; executives and team admins should use `/mine` or `/assigned` based on identity.
- `RequestPlanMeetingPayload.attendeeIds` is optional, but backend service calls `data.attendeeIds.includes(...)`; omission causes a runtime 500 rather than validation error.
- No frontend route/page exists for executive-request detail, creation, or plan-meeting, despite hooks existing. Users cannot complete the executive-request workflow from the imported UI.

### High

- Plan mapper sends `locationType`, but controller drops it. Service creates a meeting without `locationType`, so Prisma defaults it to `PHYSICAL`.
- Plan controller forwards `onlineLink`, but `planMeetingFromRequest` does not write it to Meeting. Online/hybrid planning data is lost.
- `UpdateMeetingPayload` and update mapper expose `ownerTeamId`, `attendeeIds`, and `agendaItems`; controller explicitly rejects all three before Zod parsing. The mapper can therefore construct guaranteed-rejected PATCH bodies.
- Create contract still exposes optional `kind`; both `/quick` and `/structured` reject it. Current form mapper omits it, but direct hook callers can trigger 400 responses.
- New-meeting form has room selection but no location-type/online-link controls. It cannot deliberately create `ONLINE` or `HYBRID` meetings and can submit location combinations different from user intent.
- Live page imports mutation support but does not call meeting lifecycle/timer/agenda command hooks; it renders state but provides no operational controls for start/end/skip/extend/takeover.

### Medium

- Runtime status-style maps in dashboard, meeting list, and meeting detail still key `InProgress`, `Scheduled`, `Draft`, and `Cancelled`; canonical uppercase statuses fall back to generic styling/labels.
- Frontend `FunctionalTeam.members?: User[]` is too broad for `GET /teams`, which returns only `{id,name}` members.
- Frontend `DashboardResponse.upcomingMeetings[].scheduledAt` is `string`, while backend selection is structurally `Date | null`.
- Meeting detail response does not include `agendaItems.speakers`, although frontend type suggests speakers may be present. Speaker-dependent detail UI cannot rely on this endpoint.
- Live page computes elapsed time from the detail response's timer and a single render-time `new Date()` rather than `liveState.serverNow`; the displayed countdown does not continuously track server state.
- Executive-request list includes target rows but not target user/team relations; UI tries `targetUser?.name`/`targetTeam?.name`, so targets display as an em dash.

### Low

- No business page uses mock datasets; current pages use API hooks. Local state is limited to filters/forms/presentation constants.
- Old V1 field names appear only in a frontend test’s forbidden-field list, not runtime code. No runtime references found for `department`, `meetingType`, `vibe`, `scheduledDuration`, `facilitatorId`, `UserRole`, `meeting_hosts`, `meeting_entries`, or `TimelineEvent`.
- Frontend model relations are broadly optional, which hides endpoint-specific include differences from TypeScript rather than expressing distinct list/detail DTOs.

## 5. Backend endpoints without a frontend entry point

- No API hooks/pages: generic `POST /meetings`; meeting `complete`, `archive`, and nested timer endpoints; agenda CRUD/ready/reorder; reports; cross-team invites; meeting join requests; organization audit.
- Hooks exist but no current page/action: executive-request create/detail/plan/transitions; team/user/room mutations; meeting schedule/cancel/summary/lock/delete/attendee/override/timer commands; notification center/preferences; parking-lot creation/review/archive; search; calendar slot selection.
- Backend `files` and `speakers` routers currently define no routes, so they are not missing frontend integrations.

## 6. Phased implementation order

1. Phase 1 — contract safety: split endpoint-specific create/update DTOs; make plan attendees required; add plan Zod validation; stop sending rejected PATCH fields; define endpoint-specific response DTOs.
2. Phase 2 — meeting creation: add explicit location controls and valid location mapping; persist plan `locationType`/`onlineLink`; verify quick/structured/plan payload fixtures.
3. Phase 3 — role-aware executive flow: choose all/mine/assigned query by user role; add request detail, create, planning, and transition pages/actions.
4. Phase 4 — live operations: wire lifecycle, agenda, timer, takeover, notes, and server-clock reconciliation into the live page.
5. Phase 5 — response/UI fidelity: canonical status presentation; target names; team-member partial type; nullable dashboard date; speaker includes or dedicated query.
6. Phase 6 — remaining product surfaces: notifications, parking lot, audit, reports, invites/join requests, search, and admin mutations; add only the routes the UI actually exposes.

READY FOR PHASE 1
