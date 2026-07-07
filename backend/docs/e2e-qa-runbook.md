# E2E QA Runbook

## Prerequisites

1. Backend running on `http://localhost:4000`
2. Frontend running on `http://localhost:3000`
3. Dedicated QA database (never production)
4. Supabase Auth users created with matching emails (see Step 1)

## Step 1 — Reset QA Database

```bash
cd backend

# Set QA database URL (separate from dev database)
export DATABASE_URL="postgresql://...your-qa-database..."

# Run QA reset
npm run qa:reset
```

The script refuses to run when `NODE_ENV=production` or when the database URL appears to target production.

After reset, create Supabase Auth users with these emails and passwords:

| Role | Email | Password |
|------|-------|----------|
| Secretary | qa-secretary@example.com | QA-Secretary-2024! |
| Sales Team Admin | qa-sales-admin@example.com | QA-SalesAdmin-2024! |
| Operations Team Admin | qa-ops-admin@example.com | QA-OpsAdmin-2024! |
| Sales Member | qa-sales-member@example.com | QA-SalesMember-2024! |
| Operations Member | qa-ops-member@example.com | QA-OpsMember-2024! |
| Executive | qa-executive@example.com | QA-Executive-2024! |
| Speaker Only | qa-speaker@example.com | QA-Speaker-2024! |

## Step 2 — Start Backend

```bash
cd backend
npm run dev
```

## Step 3 — Start Frontend

```bash
cd frontend
npm run dev
```

## Journey A — Executive Request to Locked Record

1. Login as **Executive** (qa-executive@example.com)
2. Navigate to Executive Requests
3. Create a new Executive Request targeting **Sales** team
4. Logout
5. Login as **Secretary** (qa-secretary@example.com)
6. Navigate to Executive Requests, open the request
7. Plan an **ONLINE or HYBRID Structured Meeting**
8. Verify location type and online link persist
9. Logout, login as **Operations Team Admin** (organizer)
10. Navigate to the meeting, click **Start**
11. Submit organizer summary
12. Click **Lock Record**
13. Logout, login as **Executive**
14. Verify the Executive can view the request/meeting record
15. Login as **Sales Member** (ordinary attendee)
16. Verify they cannot see private notes

## Journey B — Quick Team Meeting

1. Login as **Sales Team Admin** (qa-sales-admin@example.com)
2. Create a **QUICK_TEAM** meeting for **Sales** team
3. Add **Sales Member** as attendee (same team)
4. Attempt to add **Operations Member** (cross-team) — confirm rejection
5. Remove **Sales Member** before starting
6. Attempt self-removal — confirm rejection
7. Attempt organizer removal — confirm rejection
8. Start the meeting
9. End the meeting
10. Verify Dashboard, Browse List, Calendar, and Detail all show the same meeting

## Journey C — Parking Lot Workflow

1. Login as **Sales Member** (qa-sales-member@example.com)
2. Create a Parking Lot item
3. Verify pending item visibility is restricted (only creator + admin see it)
4. Logout, login as **Sales Team Admin**
5. Approve the item
6. Navigate to a **STRUCTURED DRAFT or SCHEDULED** meeting
7. Add the Parking Lot item to the agenda
8. Verify item becomes **USED_IN_AGENDA**
9. Attempt to archive it — confirm rejection
10. Attempt to attach it again — confirm rejection
11. Attempt to add it to a **QUICK_TEAM** meeting — confirm rejection

## Journey D — Room Conflict and Secretary Override

1. Login as **Operations Team Admin**
2. Create a **PHYSICAL or HYBRID** meeting in **Boardroom** with a specific time
3. Attempt to create another meeting in **Boardroom** with overlapping time
4. Confirm **ROOM_CONFLICT** error appears
5. Logout, login as **Secretary**
6. Edit the second meeting using **Schedule Override**
7. Enter a required reason
8. Verify date, duration, locationType, roomId, and onlineLink persist
9. Verify an audit event is created

## Journey E — Live Permissions, Notes, and Takeover

1. Login as **Operations Team Admin** (organizer)
2. Start the **Operations Weekly Review** meeting
3. Logout, login as **Operations Member** (attendee)
4. Navigate to live room, submit one note
5. Logout, login as **Speaker Only** (qa-speaker@example.com)
6. Navigate to live room, submit one note
7. Confirm **Operations Member** cannot read **Speaker Only** notes (and vice versa)
8. Logout, login as **Secretary**
9. Take over the meeting
10. Confirm organizer changes to Secretary
11. Confirm takeover audit event exists
12. Confirm local timer visibly counts down without repeated network calls
13. End meeting, confirm notes are locked

## Journey F — Removed Access and Visibility

1. Login as **Operations Team Admin**
2. Create a meeting, add **Operations Member** as attendee
3. Remove **Operations Member** before starting
4. Logout, login as **Operations Member**
5. Verify they cannot access meeting detail
6. Verify they cannot access live room
7. Verify meeting does not appear in their browse list or calendar
8. Verify they cannot access notes
9. Login as **Secretary** — verify they retain access
10. Login as **Organizer** — verify they retain access

## Journey G — Browse, Calendar, Dashboard Consistency

For the **Operations Weekly Review** (HYBRID, SCHEDULED):

1. Login as any authorized user
2. Open **Dashboard** — verify correct card, status, and action
3. Open **Meetings List** — verify same Team, status, duration, attendee count
4. Open **Calendar** — verify same start/end and location summary
5. Open **Meeting Detail** — verify same core record
6. Repeat for a **PHYSICAL** meeting example
7. Repeat for an **ONLINE** meeting example

## Defect Reporting

Log defects in `docs/e2e-defects.md` using the format:

```
ID: QA-001
Severity: P0
Journey: A
Expected: ...
Actual: ...
Reproduction: ...
Root cause: ...
Fix: ...
Regression test: ...
Status: Open
```

## Severity Classification

- **P0**: Authorization bypass, private data leak, wrong Org/Team access, data corruption, room double-booking, incorrect state transition
- **P1**: Core journey blocked, wrong endpoint/payload, stale record after mutation, timer/summary/note workflow broken
- **P2**: Misleading label, layout issue, missing loading/empty/error state
