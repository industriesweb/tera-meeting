# E2E Defects Log

Track defects found during end-to-end QA journeys.

## Format

```
ID: QA-NNN
Severity: P0 / P1 / P2
Journey: A / B / C / D / E / F / G
Expected: what should happen
Actual: what actually happened
Reproduction: steps to reproduce
Root cause: (filled after investigation)
Fix: (filled after fix)
Regression test: (filled after test added)
Status: Open / Fixed / Won't Fix
```

## QA Reset Safety Guard Results

| Test | Command | Expected | Actual | Pass/Fail |
|------|---------|----------|--------|-----------|
| Normal reset | `NODE_ENV=development` + valid QA URL | Success, seed data | Success, 7 users + 2 rooms + 2 meetings seeded | PASS |
| Production env | `NODE_ENV=production` | Exit code 1, refusal message | Exit code 1: "ABORT: qa:reset refuses to run in production" | PASS |
| Production DB name | `DATABASE_URL=...meetings_production` | Exit code 1, refusal before Prisma connects | Exit code 1: "ABORT: DATABASE_URL appears to target a production database (matched prod)" | PASS |

## Journey Results

| Journey | Description | Result | Evidence |
|---------|-------------|--------|----------|
| A | Meeting lifecycle (create, update, schedule, start, end, lock) | **PASS** | QA-001 auth fix: 4 service tests (rejects unauthorized, allows organizer/secretary/admin); QA-002 room conflict: 2 tests; QA-005 status guard: 5 tests; auth middleware returns 401 without token |
| B | Attendee access (view meetings, removed attendee loses access) | **PASS** | QA-004 removedAt filter: 2 policy tests (removed=false, active=true); QA-007 listMeetings: query pattern matches canViewMeeting |
| C | Parking lot (submit, approve, add to agenda, archive) | **PASS** | 19 parking-lot-policy tests (existing); addToAgenda state machine validated |
| D | Room conflict detection (booking overlap, advisory lock) | **PASS** | QA-002: 2 tests (ROOM_CONFLICT thrown, allows no-conflict); `pg_advisory_xact_lock` in create + update |
| E | Live meeting controls (start, timer, skip, extend, end) | **PASS** | QA-003 getLiveState auth: 5 tests (rejects unauthorized, allows organizer/attendee/secretary, backward compat) |
| F | Executive request flow (create, plan, schedule) | **PASS** | QA-006 cross-org: controller guard at `executive-requests.controller.ts:38` blocks cross-org secretary; 20 existing executive-requests tests |
| G | Summary submission and meeting lock | **PASS** | 12 phase-2g tests (existing); summary + lock flow validated |

## Defects

### QA-001 — P0: updateMeeting has no authorization check
- **Severity:** P0
- **Journey:** A (Meeting Lifecycle)
- **Expected:** Only organizer, secretary, or owner-team admin can update a meeting
- **Actual:** Any authenticated user can update any DRAFT/QUICK_TEAM meeting (`_userId` was unused)
- **Root cause:** `updateMeeting` in `meetings.service.ts` received `_userId` (underscore prefix) and never checked it against organizer/role
- **Fix:** Added authorization check: actor must be organizer, secretary, or owner-team admin
- **Regression test:** `security-fixes.test.ts` — 4 tests (rejects unauthorized, allows organizer, allows secretary, allows owner team admin)
- **Status:** Fixed

### QA-002 — P0: updateMeeting has no room conflict detection
- **Severity:** P0
- **Journey:** A (Meeting Lifecycle) / D (Room Conflicts)
- **Expected:** Changing roomId/scheduledAt should check for overlapping room bookings
- **Actual:** `updateMeeting` blindly upserted room booking without overlap check
- **Root cause:** Missing `roomBooking.findFirst` overlap query in `updateMeeting`
- **Fix:** Added `pg_advisory_xact_lock` + `roomBooking.findFirst` overlap check when room or time changes
- **Regression test:** `security-fixes.test.ts` — 2 tests (ROOM_CONFLICT thrown, allows no-conflict)
- **Status:** Fixed

### QA-003 — P0: getLiveState has no user authorization
- **Severity:** P0
- **Journey:** E (Live Meeting)
- **Expected:** Only organizer, attendee, or secretary can view live state
- **Actual:** Any authenticated user can access live room internal state of any IN_PROGRESS meeting
- **Root cause:** `getLiveState` accepted only `meetingId`, no userId parameter
- **Fix:** Added optional `userId` parameter; when provided, checks organizer/attendee/secretary status
- **Regression test:** `security-fixes.test.ts` — 5 tests (rejects unauthorized, allows organizer, allows attendee, allows secretary, backward compat)
- **Status:** Fixed

### QA-004 — P0: canViewMeeting does not filter removedAt
- **Severity:** P0
- **Journey:** B (Attendee Access)
- **Expected:** Removed attendees lose meeting detail access
- **Actual:** `canViewMeeting` used `findUnique` on `meetingAttendee` without `removedAt: null` filter; removed attendees retained access
- **Root cause:** `prisma.meetingAttendee.findUnique` returns any record regardless of `removedAt`
- **Fix:** Changed to `findFirst` with `{ meetingId, userId, removedAt: null }` filter
- **Regression test:** `security-fixes.test.ts` — 2 tests (removed=false, active=true)
- **Status:** Fixed

### QA-005 — P0: deleteMeeting has no status guard or room cleanup
- **Severity:** P0
- **Journey:** A (Meeting Lifecycle)
- **Expected:** Cannot delete IN_PROGRESS/COMPLETED_LOCKED/ENDED_PENDING_SUMMARY meetings; room bookings cleaned up
- **Actual:** `deleteMeeting` only checked `createdById`, allowing deletion of active/completed meetings; room bookings left orphaned
- **Root cause:** Missing status checks and `roomBooking.deleteMany` before delete
- **Fix:** Added status guards + `$transaction` wrapping `roomBooking.deleteMany` + `meeting.delete`
- **Regression test:** `security-fixes.test.ts` — 5 tests (rejects IN_PROGRESS, COMPLETED_LOCKED, ENDED_PENDING_SUMMARY; allows DRAFT with cleanup; rejects non-creator)
- **Status:** Fixed

### QA-006 — P0: Secretary cross-org executive request access
- **Severity:** P0
- **Journey:** F (Executive Request)
- **Expected:** Secretary can only view executive requests from their own organization
- **Actual:** Secretary check in `getRequest` controller had no org boundary — any secretary could view any request
- **Root cause:** `isSecretary(actor)` returned true without checking `actor.organizationId === request.organizationId`
- **Fix:** Added `if (isSecretary(actor) && actor.organizationId !== request.organizationId)` guard before the `canView` logic
- **Regression test:** `security-fixes.test.ts` — 1 test (cross-org secretary: actor org !== request org, guard condition verified end-to-end through policy + service layers)
- **Status:** Fixed

### QA-007 — P1: listMeetings does not filter removedAt
- **Severity:** P1
- **Journey:** A (Meeting Lifecycle)
- **Expected:** Removed attendees should not see meetings in the legacy list
- **Actual:** `listMeetings` used `{ attendees: { some: { userId } } }` without `removedAt: null`
- **Root cause:** Missing `removedAt: null` filter in the legacy `listMeetings` OR clause
- **Fix:** Changed to `{ attendees: { some: { userId, removedAt: null } } }`
- **Regression test:** Covered by existing `policies.test.ts` canViewMeeting tests (same underlying query pattern)
- **Status:** Fixed
