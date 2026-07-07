# Phase 4a: Timer Model Migration Report

## Schema Changes

### MeetingTimer (replaced)

**Old model:**
```
startedAt?, itemStartedAt?, baseTotal(0), baseItem(0), isRunning(false), activeItemIndex(0), pausedAt?, version(1)
```

**New model:**
```
startedAt?, activeAgendaItemId?, activeItemStartedAt?, activeItemExtensionSeconds(0),
overtimeStartedAt?, overtimeDeadlineAt?, overtimeExtensionCount(0), version(0), updatedAt
```

### AgendaItem (added fields)

- `activatedAt?` — when item became active
- `completedAt?` — when item completed
- `skippedAt?` — when item skipped
- `extensionSeconds(0)` — per-item extension tally
- `actualDurationSeconds?` — exact seconds item was active

## Existing Data Handling

- Prisma `db push` will drop old `meeting_timers` table columns (`base_total`, `base_item`, `is_running`, `active_item_index`, `paused_at`) and add new columns.
- **Any currently InProgress V1 meeting will lose its timer state.** This is acceptable because:
  - No production meetings are live during this migration.
  - The new `startMeeting` path always initializes a fresh timer record.
  - Stale `isRunning=true` pre-migration records cannot be safely interpreted without knowing true elapsed.
- A one-off cleanup query can delete orphaned timer records:
  ```sql
  DELETE FROM meeting_timers WHERE meeting_id IN (
    SELECT id FROM meetings WHERE status NOT IN ('InProgress', 'ENDED_PENDING_SUMMARY')
  );
  ```

## New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /meetings/:id/live-state | Current timer/agenda state |
| POST | /meetings/:id/agenda/skip-current | Skip active item |
| POST | /meetings/:id/agenda/extend-current | Extend active item (+5/+10/+15) |
| POST | /meetings/:id/overtime/extend | Extend overtime (+5 min) |
| POST | /meetings/:id/takeover | Secretary assumes organizer role |

## Disabled Legacy Endpoints

| Method | Path | Status |
|--------|------|--------|
| GET | /timer/:id | 410 LEGACY_TIMER_DISABLED |
| POST | /timer/:id/:action | 410 LEGACY_TIMER_ACTION_DISABLED |
| GET | /meetings/:id/timer | 410 LEGACY_TIMER_COMMAND_DISABLED |
| POST | /meetings/:id/timer/:action | 410 LEGACY_TIMER_COMMAND_DISABLED |

## Socket.IO Event

One event type only:

```
meeting:live-state
```

Payload includes `meetingId`, `version`, `serverNow`, `meetingStatus`, `meetingStartedAt`,
`plannedDurationSeconds`, `overtimeStartedAt`, `overtimeDeadlineAt`, `activeAgendaItemId`,
`activeItemStartedAt`, `activeItemBudgetSeconds`, `activeItemExtensionSeconds`, `agendaComplete`.

Frontend renders local countdowns from this data. No per-second Socket.IO traffic.

## Worker

`src/workers/live-meeting-reconciler.ts` — runs every 1s (configurable via `LIVE_RECONCILE_INTERVAL_MS`),
uses transactional version-optimistic writes, emits events only on actual transitions.

## Concurrency

`reconcileLiveMeeting` uses `prisma.$transaction` with `version` check. Only the first worker
to write a transition wins. Second attempt sees new version and skips already-applied work.
