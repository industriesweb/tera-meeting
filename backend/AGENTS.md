# Guidelines

## Anchored Summary

## Goal
- Implement Phase 6.2 (Meetings List browse + Day Calendar), Phase 6.2.1 (Contract Integrity), and Security Remediation Pass

## Constraints & Preferences
- Do not redesign Analytics, add charts, or change database schema
- Do not query `GET /meetings` multiple times from Dashboard page – only `GET /dashboard`
- Reuse/extract same visibility logic used by Meeting Detail, do not duplicate
- Use Organization timezone, not server-local time
- Frontend `unwrap()` expects `{ success: true, data: … }` envelope – maintain app-wide convention
- Dashboard must invalidate after all meeting mutations
- All status labels must use canonical uppercase V2 values
- No generic Meeting models in response – use DTOs (`MeetingBrowseCard`, `CalendarMeetingCard`, `DashboardMeetingCard`)
- PHYSICAL/HYBRID must have non-null room; ONLINE must have null room – enforced server-side with `ValidationError`
- Cursor must be opaque Base64url-encoded JSON with `{ version, sort, id, scheduledAt?, lockedAt?, title? }`
- Invalid or sort-mismatched cursors return 400
- `onlineLink` never exposed in browse/calendar DTOs
- Do not build month calendar, drag-and-drop, Analytics, or new meeting actions

## Progress
### Done
- Phase 1-4: Core meeting lifecycle, agenda, notes, timer, locking, summary, creation enforcement, notifications, room booking, cancel/attendee/override, live controls, takeover
- Phase 5.1: Canonical status presentation, safe detail response shape, CTA in detail page, 9 backend tests, 23 frontend tests
- Phase 5.2: Real capabilities in `getMeetingDetail`, attendee management modal, cancellation dialog, secretary override form, all CTAs gated by capabilities, 9 backend + 8 frontend new tests
- Phase 5.2.1: Cancellation/override contracts frozen, self-removal rejected, `canOpenLiveRoom` restricted, 10 new backend tests
- Phase 6.1: V2 Dashboard Contract — shared `buildMeetingVisibilityFilter()` policy, rewritten dashboard service with `DashboardMeetingCard` DTOs, org timezone, creation capabilities, single `useDashboard()` frontend hook, `invalidateDashboardQueries` on all mutations, summaryActions filtered to organizer only, 4 OR-branch correctness tests; 307 backend / 105 frontend tests
- Phase 6.2: Meetings List + Day Calendar — paginated `GET /meetings` with cursor, search, status/kind/team filters, sort modes, `MeetingBrowseResponse` DTO; `GET /calendar/day` with timezone-aware UTC bounds via `Intl.DateTimeFormat.formatToParts`, overlap-aware query, `CalendarDayResponse` DTO; frontend `useBrowseMeetings`/`useDayCalendar` hooks, `meetingKeys.browse()`/`calendarKeys.day()` query keys, invalidation on all mutations; rewritten Meetings page (filter bar, cursor pagination, capabilities-based row actions) and Calendar page (time-axis day layout, overlap lanes, date navigation); centralized presentation module `meeting-presentation.tsx`; 13 backend + 13 frontend tests; 320 backend / 118 frontend tests
- Phase 6.2.1: Contract Integrity — opaque cursor (`encodeCursor`/`decodeCursor` with base64url JSON, version=1 validation, sort-mismatch rejection); location invariant enforcement (PHYSICAL/HYBRID → room non-null, ONLINE → room null) in both `browseMeetings` and `getDayCalendar`; removed legacy `useMeetings`/`fetchMeetings`/`MeetingListItem` import from frontend; updated `locationSummary` presentation (PHYSICAL→room name, ONLINE→"Online"); added `timezone` field to `MeetingBrowseResponse`; 10 new backend tests (cursor encode/decode, invalid/mismatch cursor, RECENT/TITLE pagination, PHYSICAL/ONLINE/HYBRID room invariants in browse + calendar); updated test 8 for opaque cursor; 330 backend / 118 frontend tests
- Security Remediation Pass: 5 P0 + 1 P0 confirmed + 1 P1 defects found and fixed — `updateMeeting` auth + room conflict, `getLiveState` auth, `canViewMeeting` removedAt filter, `deleteMeeting` status guard + room cleanup, Secretary cross-org ER access, `listMeetings` removedAt; 19 regression tests; `qa-reset.ts` with production safety guards; `docs/e2e-defects.md` populated; 374 backend / 128 frontend tests

### In Progress
- (none)

### Blocked
- (none)

## Key Decisions
- Shared visibility policy `buildMeetingVisibilityFilter()` used by Dashboard, Browse, Calendar, and Meeting Detail — single source of truth
- Opaque cursor uses `base64url(JSON.stringify({ version: 1, sort, id, scheduledAt?, lockedAt?, title? }))` with version/sort validation preventing cursor injection and cross-sort misuse
- Location invariants enforced as runtime `ValidationError` in DTO mapper, not just DB constraints — prevents data corruption from reaching clients
- Calendar day bounds computed from org timezone using `Intl.DateTimeFormat.formatToParts` offset at UTC noon — DST-safe for day-boundary determination
- `timezone` field added to `MeetingBrowseResponse` for consistent frontend formatting using `Intl.DateTimeFormat` with `timeZone` option
- Frontend presentation module `meeting-presentation.tsx` owns ALL status labels, duration formatting, time/date formatting, location labels — no page has its own maps
- `updateMeeting` requires actor to be organizer, secretary, or owner-team admin; room conflict checked via `pg_advisory_xact_lock` + `roomBooking.findFirst` when room/time changes
- `getLiveState` accepts optional `userId`; when provided, checks organizer/attendee/secretary; without userId (internal calls) works as before
- `canViewMeeting` uses `findFirst` with `removedAt: null` — removed attendees lose meeting detail access
- `deleteMeeting` blocks IN_PROGRESS/COMPLETED_LOCKED/ENDED_PENDING_SUMMARY; wraps `roomBooking.deleteMany` + `meeting.delete` in `$transaction`
- Secretary cross-org ER access blocked in `getRequest` controller via `actor.organizationId !== request.organizationId` guard

## Next Steps
- Run full `cd backend && npx tsc --noEmit && npm test`
- Run full `cd frontend && npx tsc --noEmit && npm test && npm run build`

## Critical Context
- Project at `C:\Users\Jozact\Desktop\meetings 2\`
- Backend: Node/Express + Prisma + Zod + vitest; tests at `src/__tests__/`
- Frontend: Next.js App Router + React Query + shadcn-style Tailwind + vitest; tests at `src/__tests__/`
- Response envelope: `wrapResponse` middleware wraps all successful responses in `{ success: true, data: <body> }`; frontend `unwrap()` extracts `res.data`
- Cursor implementation: `encodeCursor()`/`decodeCursor()` in `meetings.service.ts`; controller validates sort param then passes to browse service which calls `decodeCursor` internally
- `ValidationError` from `../../common/errors/app-error` used for cursor errors (code: `INVALID_CURSOR`, `INVALID_CURSOR_VERSION`, `CURSOR_SORT_MISMATCH`)
- Location invariant: `toCard()` in `browseMeetings()` and `toCalendarCard()` in `getDayCalendar()` both throw `ValidationError` on invalid locationType/room combinations
- No runtime frontend caller remains on `useMeetings` or expects `GET /meetings` to return raw array — both `fetchMeetings` and `useMeetings` removed from `queries/meetings.ts`
- `MeetingListItem` type definition still exists in `types/api.ts` (type-only, no runtime imports)
- Phase-6c backend tests now include both Phase 6.2 and Phase 6.2.1 tests: browse/calendar visibility, filters, pagination, room invariants, opaque cursor, sort-mode pagination proofs (23 tests)

## Relevant Files
- `backend/src/policies/meeting-visibility.ts`: shared visibility filter builder
- `backend/src/policies/meeting-policy.ts`: `canViewMeeting` with `removedAt: null` filter
- `backend/src/modules/meetings/meetings.service.ts`: `browseMeetings()` with cursor pagination, sort modes, filters, location enforcement, `encodeCursor()`/`decodeCursor()`; `updateMeeting` with auth + room conflict; `getLiveState` with userId auth; `deleteMeeting` with status guard + room cleanup
- `backend/src/modules/meetings/meetings.controller.ts`: Zod-validated browse query, calls `browseMeetings()`
- `backend/src/modules/calendar/calendar.service.ts`: `getDayCalendar()` with timezone-aware UTC bounds, overlap query, location enforcement
- `backend/src/modules/calendar/calendar.controller.ts`: `GET /calendar/day` handler with date format validation
- `backend/src/modules/calendar/calendar.routes.ts`: `GET /day` route
- `backend/src/modules/dashboard/dashboard.service.ts`: dashboard data aggregation using shared visibility
- `frontend/src/types/api.ts`: `MeetingBrowseCard`, `MeetingBrowseResponse`, `CalendarMeetingCard`, `CalendarDayResponse`, `DashboardMeetingCard`, `DashboardResponse`
- `frontend/src/features/meetings/meeting-presentation.tsx`: centralized `StatusBadge`, `KindBadge`, `formatDuration`, `formatTime`, `formatDate`, `formatDateTime`, `locationSummary`
- `frontend/src/lib/api/query-keys.ts`: `meetingKeys.browse()`, `calendarKeys.day()`
- `frontend/src/lib/api/queries/meetings.ts`: `useBrowseMeetings`, browse invalidation on all mutations, `useMeeting`, `useLiveState`, all mutation hooks
- `frontend/src/lib/api/queries/calendar.ts`: `useDayCalendar`
- `frontend/src/lib/api/queries/dashboard.ts`: `useDashboard`
- `frontend/src/app/(app)/meetings/page.tsx`: paginated browse with filters, capabilities-based row actions
- `frontend/src/app/(app)/calendar/page.tsx`: day timeline with overlap lanes, date navigation, org timezone
- `frontend/src/app/(app)/dashboard/page.tsx`: single `useDashboard()`, loading/error/empty states, canonical status
- `backend/src/__tests__/phase-6c.test.ts`: 23 tests (Phase 6.2 browse/calendar + Phase 6.2.1 room invariants, opaque cursor, sort pagination)
- `backend/src/__tests__/security-fixes.test.ts`: 19 tests (updateMeeting auth, room conflict, getLiveState auth, canViewMeeting removedAt, deleteMeeting status guard, cross-org ER)
- `frontend/src/__tests__/phase-6c.test.tsx`: 13 frontend tests (browse, calendar, filters, pagination, capabilities, overlap, timezone)
