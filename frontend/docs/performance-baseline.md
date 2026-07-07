# Performance Baseline

Phase 8A audit results. This document captures the pre-redesign performance state.

**Audit date:** 2026-07-06
**Framework:** Next.js 16.2.10 | React 19.2.4 | TypeScript 5
**Audit scope:** Frontend only — no backend changes

---

## Routes Reviewed

| Route | File | `"use client"` | Server-renderable |
|-------|------|:-:|:-:|
| `/` (root) | `app/page.tsx` | No | Already server |
| `/login` | `app/login/page.tsx` | Yes | No — inherently interactive (uses dynamic `loadSupabaseClient()`) |
| `/signup` | `app/signup/page.tsx` | No | Yes — server component, renders static unavailable message |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Yes | Partially — static shell could be server |
| `/meetings` | `app/(app)/meetings/page.tsx` | Yes | Partially — table shell could be server |
| `/meetings/[id]` | `app/(app)/meetings/[id]/page.tsx` | Yes | Partially — detail layout could be server |
| `/meetings/[id]/live` | `app/(app)/meetings/[id]/live/page.tsx` | Yes | No — real-time controls |
| `/meetings/new` | `app/(app)/meetings/new/page.tsx` | Yes | Partially — chooser page is just 2 links |
| `/meetings/new/quick` | `app/(app)/meetings/new/quick/page.tsx` | No | Already delegates to client form |
| `/meetings/new/structured` | `app/(app)/meetings/new/structured/page.tsx` | No | Already delegates to client form |
| `/calendar` | `app/(app)/calendar/page.tsx` | Yes | Partially — grid is CSS-based |
| `/parking-lot` | `app/(app)/parking-lot/page.tsx` | Yes | Partially — list shell could be server |
| `/notifications` | `app/(app)/notifications/page.tsx` | Yes | Partially — list could be server |
| `/admin` | `app/(app)/admin/page.tsx` | Yes | Partially — stats cards are static |
| `/executive-requests` | `app/(app)/executive-requests/page.tsx` | Yes | Partially — card grid is static |
| `/executive-requests/new` | `app/(app)/executive-requests/new/page.tsx` | Yes | No — complex form |
| `/executive-requests/[id]` | `app/(app)/executive-requests/[id]/page.tsx` | Yes | Partially — detail could be server |
| `/executive-requests/[id]/plan` | `app/(app)/executive-requests/[id]/plan/page.tsx` | Yes | No — complex form |

---

## `"use client"` Findings

### Critical: `(app)/layout.tsx` is client-rendered

**File:** `src/app/(app)/layout.tsx`

This is the most impactful `"use client"` in the codebase. Every authenticated page (12+ routes) renders through this layout. The client boundary is caused by:

- `useAuth()` — context hook for Supabase auth state
- `useRouter()` — navigation
- `useEffect()` — auth redirect logic
- `window.location.reload()` — session refresh
- Supabase `onAuthStateChange` subscription

**Impact:** Zero authenticated pages can benefit from Server-Side Rendering. The entire authenticated shell (sidebar, nav, user profile, page content) renders on the client.

**Priority:** High — This is the #1 bottleneck for Lighthouse LCP and FCP on authenticated routes.

**Recommendation for Phase 8B:** Move auth gating to Next.js middleware. Keep `AuthProvider` and `QueryProvider` as client wrappers, but allow the layout shell (sidebar, nav) to be server-rendered.

### Pages that could become server-rendered

| Page | Why it's client | What could be server | Priority |
|------|----------------|---------------------|----------|
| Dashboard | `useCurrentUser`, `useDashboard`, `new Date().getHours()` | Static greeting card, stats skeleton, table skeleton | High |
| Meetings List | `useState` (search/filter), `useBrowseMeetings`, `useDashboard` | Page header, filter bar skeleton, table skeleton | High |
| Meeting Detail | `useParams`, `useMeeting`, modal handlers | Detail layout, metadata, status badge | Medium |
| Calendar | `useState` (date), `useDayCalendar`, `useDashboard` | Calendar grid skeleton, date header | Medium |
| Parking Lot | `useState`, 6 hooks, modal handlers | Page shell, list skeleton | Medium |
| Notifications | 3 hooks, onClick handlers | Page shell, notification list skeleton | Medium |
| Admin | `useState` (tab), 3 hooks | Tab bar, stats cards skeleton | Medium |
| Executive Requests | `useState` (filter), `useRoleAwareExecutiveRequests` | Card grid skeleton, filter bar | Medium |
| ER Detail | `useParams`, `useExecutiveRequest`, action handlers | Detail layout, metadata | Medium |
| New Meeting | `useCurrentUser`, `creationAccess()` | Two link cards (trivial to server-render) | Medium |

### Pages that must remain client-rendered

| Page | Reason |
|------|--------|
| Login | Form with auth state, uses dynamic `loadSupabaseClient()` |
| Live Meeting | Real-time timer, socket-like polling, controls |
| New Executive Request | Complex multi-field form |
| Plan Meeting from ER | Complex form with dependent state |

### Pages that are now server-rendered

| Page | Change |
|------|--------|
| Signup | Replaced with static unavailable message (no Supabase, no form) |

### Pure functions trapped in client files

| Function | Defined in | Should be extracted to |
|----------|-----------|----------------------|
| `creationAccess()` | `meeting-creation-form.tsx` | Shared utility (already partially in `meeting-presentation.tsx`) |
| `getInitials()` | `app-layout.tsx`, `admin/page.tsx`, `meetings/[id]/page.tsx`, `meetings/[id]/live/page.tsx` | Shared utility |
| `formatDuration()` | `meeting-presentation.tsx`, `dashboard/page.tsx`, `meetings/[id]/page.tsx`, `meetings/[id]/live/page.tsx` | `meeting-presentation.tsx` (already exported) |
| `requestDetailPermissions()` | `executive-requests/[id]/page.tsx` | `features/executive-requests/request-detail-permissions.ts` ✓ moved |
| `buildExecutiveTargets()` | `executive-requests/new/page.tsx` | `features/executive-requests/executive-targets.ts` ✓ moved |
| `resetTeamSelections()` | `meeting-creation-form.tsx` | Shared utility |
| `applyLocationChange()` | `meeting-creation-form.tsx` | Shared utility |
| `validateAgendaItems()` | `meeting-creation-form.tsx` | Shared utility |

### Missing `"use client"` directives

These files use React hooks but lack the directive (works by coincidence since they're only imported by client files):

- `src/lib/api/queries/auth.ts` — `useCurrentUser()`
- `src/lib/api/queries/dashboard.ts` — `useDashboard()`
- `src/lib/api/queries/meetings.ts` — all hooks
- `src/lib/api/queries/calendar.ts` — all hooks
- `src/lib/api/queries/notifications.ts` — all hooks
- `src/lib/api/queries/parking-lot.ts` — all hooks
- `src/lib/api/queries/executive-requests.ts` — all hooks
- `src/lib/api/queries/teams.ts` — all hooks
- `src/lib/api/queries/users.ts` — all hooks
- `src/lib/api/queries/rooms.ts` — all hooks
- `src/lib/api/queries/notes.ts` — all hooks
- `src/lib/api/queries/search.ts` — all hooks
- `src/lib/supabase/client.ts` — uses `createBrowserClient()`
- `src/lib/api/client.ts` — uses `ky` with browser credentials

---

## Bundle Hotspots

### Dead dependencies (zero imports found in `src/`)

| Package | Estimated Size | Status |
|---------|---------------|--------|
| `date-fns` | ~70KB min | **UNUSED** — all dates use native `Intl.DateTimeFormat` |
| `zod` | ~100KB+ min | **UNUSED** — validation is backend-only |
| `react-hook-form` | ~40KB min | **UNUSED** — forms use native state |
| `@hookform/resolvers` | ~10KB min | **UNUSED** — paired with react-hook-form |
| `nuqs` | ~5KB min | **UNUSED** — URL state managed manually |
| `zustand` | ~3KB min | **UNUSED** — state managed by React Query |

**Total dead weight: ~228KB+ minified**

### Heavy live dependencies

| Package | Est. Size | Used By | Risk |
|---------|----------|---------|------|
| `@supabase/supabase-js` | ~200KB+ | Auth provider only | Loaded on every authenticated route via layout |
| `@tanstack/react-query` | ~50KB | All data fetching | Necessary, well-optimized |
| `@base-ui/react` | ~40KB | `button.tsx` only | High cost for single component |
| `lucide-react` | ~60KB full | 2 icons in 2 files | Could use inline SVGs |
| `next` + `react` + `react-dom` | Framework | All routes | Cannot be removed |

### Global imports affecting all routes

| Import | Location | Impact |
|--------|----------|--------|
| Google Fonts CDN (Literata, Nunito Sans, Material Symbols) | `app/layout.tsx` `<link>` tags | 3 render-blocking font requests on every page |
| `tailwindcss` + `tw-animate-css` + `shadcn/tailwind.css` | `globals.css` | CSS loaded on every page (expected) |
| React Query | `(app)/layout.tsx` via `QueryProvider` | ~50KB on every authenticated route |
| Supabase Auth | `(app)/layout.tsx` via `AuthProvider` | ~200KB on every authenticated route |

### Dynamic imports (existing)

| File | Import | Config |
|------|--------|--------|
| `providers/query-provider.tsx` | `@tanstack/react-query-devtools` | `{ ssr: false }` |
| `components/providers/auth-provider.tsx` | `@/lib/supabase/client` | Dynamic `import()` in `useEffect` |
| `lib/api/client.ts` | `@/lib/supabase/client` | Dynamic `import()` in `getAuthToken()` |
| `app/login/page.tsx` | `@/lib/supabase/client` | Via `loadSupabaseClient()` cached dynamic loader |

### Duplicate code across routes

| Function | Defined In (duplicated) |
|----------|------------------------|
| `getInitials()` | 4 files |
| `formatDuration()` | 4 files (already exported from `meeting-presentation.tsx`) |
| `StatusBadge` / status maps | 3 files (already exported from `meeting-presentation.tsx`) |

---

## Socket.IO Scope

**Finding: Socket.IO is not used anywhere in the frontend.**

- `socket.io-client` is not in `package.json`
- Zero socket imports, connections, or event handlers exist
- The backend has Socket.IO for `notifyMeetingUpdate`, but the frontend does not consume it

### Actual real-time mechanism

| What | How | Interval |
|------|-----|----------|
| Live meeting state | React Query `refetchInterval` | 10 seconds |
| Unread notification count | React Query `refetchInterval` | 30 seconds |
| Live countdown timer | `setInterval` in `useLiveCountdown` | 1 second (local only, no network) |

### Polling analysis

- **10s live-state poll:** Reasonable for a live meeting. Only active on the Live Meeting page. Stops on unmount (React Query cleans up active observers).
- **30s unread-count poll:** Only active on Notifications page. Low impact.
- **1s countdown tick:** Pure client-side math (`Date.now()` interpolation from `serverNow` timestamp). Zero network requests. Properly cleaned up via `clearInterval`.

**No 1-second network polling exists.**

---

## Duplicate API Request Findings

### `useDashboard()` called unnecessarily on 2 pages

| Page | Uses `useDashboard()` for | Could use instead |
|------|--------------------------|-------------------|
| Meetings List | `capabilities.canCreateQuickMeeting` | `useCurrentUser().operationalRole` via `creationAccess()` |
| Calendar | `capabilities.canCreateQuickMeeting` | Same |

**Impact:** Low. React Query caches the dashboard response for 5 minutes. Second navigation within 5 minutes uses cache. But initial fresh load of Meetings List or Calendar makes an unnecessary `GET /dashboard` request.

### Unused query hooks (dead code)

These hooks are defined but never imported by any page:

- `useWeeklyView` (calendar)
- `useAvailableSlots` (calendar)
- `useDraftsNeedingNudge` (calendar)
- `useNotificationPreferences` (notifications)
- `useRoom` (rooms)
- `useRoomConflicts` (rooms)
- `useUser` (users)
- `useTeam` (teams)
- `useParkingLotItem` (parking-lot)
- `useSearch` (search)
- `useExecutiveRequests` (executive-requests)
- `useMyExecutiveRequests` (executive-requests)
- `useAssignedExecutiveRequests` (executive-requests)

### Per-route request count (clean)

| Route | Requests on mount | Notes |
|-------|------------------|-------|
| Dashboard | 2 (`auth/me`, `dashboard`) | Correct |
| Meetings List | 3 (`auth/me`, `dashboard`, `meetings/browse`) | `dashboard` is unnecessary |
| Calendar | 3 (`auth/me`, `dashboard`, `calendar/day`) | `dashboard` is unnecessary |
| Meeting Detail | 2 (`auth/me`, `meetings/{id}`) | Correct |
| Live Meeting | 3 (`auth/me`, `meetings/{id}`, `meetings/{id}/live-state`) | Correct |
| Parking Lot | 5+ (`auth/me`, `users`, `teams`, `parking-lot/*`, `meetings/browse`) | Expected for complex page |
| Notifications | 2 (`auth/me`, `notifications`) | Correct |
| Executive Requests | 2 (`auth/me`, `executive-requests/*`) | Correct |

---

## CLS Risks

| Risk | Source | Severity |
|------|--------|----------|
| Loading skeletons without fixed height | Dashboard, Meetings List, Calendar — skeleton shapes may not match final content | Medium |
| Dynamic table rows | Meetings list renders variable-height rows as data loads | Low |
| Auth gate redirect | `(app)/layout.tsx` renders loading state then replaces with content | Medium |
| Font FOUT | 3 Google Fonts loaded via CDN — flash of unstyled text on first paint | Medium |
| Calendar grid reflow | Calendar day cells may resize when meeting data loads | Low |

## LCP Risks

| Risk | Source | Severity |
|------|--------|----------|
| Client-only layout | All authenticated content waits for JS hydration before rendering | **High** |
| Font loading | 3 render-blocking font CDN requests | Medium |
| Supabase client initialization | Auth provider must initialize before content renders | Medium |
| No `next/image` usage | All images use raw `<img>` or no optimization | Low (few images) |

---

## Recommended Priorities for Phase 8B (After UI Redesign)

### Priority 1 — Layout architecture
1. Move `(app)/layout.tsx` auth gating to Next.js middleware
2. Make `(app)/layout.tsx` a Server Component with client wrappers only for `AuthProvider` and `QueryProvider`
3. Allow sidebar/nav to be server-rendered

### Priority 2 — Remove dead weight
4. Remove 6 unused dependencies (`date-fns`, `zod`, `react-hook-form`, `@hookform/resolvers`, `nuqs`, `zustand`)
5. Replace `@base-ui/react` button with native `<button>` or lighter primitive
6. Replace `lucide-react` (2 icons) with inline SVGs
7. Replace Material Symbols CDN font with individual SVG icons

### Priority 3 — Route-level optimization
8. Extract duplicated utilities (`getInitials`, `formatDuration`) to shared modules
9. Convert Dashboard, Meetings List, Calendar to server-component shells with client islands
10. Use `next/dynamic` for Admin page, Live Meeting controls, and heavy form pages
11. Add `next/font` for Literata and Nunito Sans (self-host, eliminate CDN)

### Priority 4 — Measurement
12. Add `@next/bundle-analyzer` for local analysis
13. Run Lighthouse against deployed staging build
14. Track LCP, CLS, INP per route

---

## Phase 8A.1 Results — Auth Bundle Isolation

**Date:** 2026-07-06

### Changes Made

1. **Created `lib/supabase/load-client.ts`** — cached dynamic loader that prevents static Supabase imports from polluting shared chunks
2. **Updated `login/page.tsx`** — replaced static `import { supabase }` with `loadSupabaseClient()` dynamic loader
3. **Replaced `signup/page.tsx`** — server component rendering static unavailable message (no Supabase, no form)
4. **Removed signup link** from login page
5. **Moved `requestDetailPermissions`** to `features/executive-requests/request-detail-permissions.ts`
6. **Moved `buildExecutiveTargets`** to `features/executive-requests/executive-targets.ts`
7. **Updated imports** in `executive-requests/[id]/page.tsx`, `new/page.tsx`, `[id]/plan/page.tsx`, and test file

### Bundle Before/After

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Login page chunk | 33 KB | 6.9 KB | **−79%** |
| Signup page chunk | 33 KB | 1.3 KB | **−96%** |
| Signup page | `"use client"` form with Supabase | Server component, static message | No JS bundle |
| `requestDetailPermissions` | In page.tsx (bundled with route) | In `features/` (shared module) | Extracted |
| `buildExecutiveTargets` | In page.tsx (bundled with route) | In `features/` (shared module) | Extracted |

### Supabase Bundle Location

| Location | Before | After |
|----------|--------|-------|
| Client shared chunk (`564.js`) | 185 KB (contains `@supabase/ssr` + auth) | 185 KB (unchanged — loaded by `auth-provider.tsx` and `api/client.ts` dynamic imports) |
| Client auth chunk (`44530001.js`) | 62 KB (`GoTrueClient`) | 62 KB (unchanged — lazy-loaded auth client) |
| Server shared chunk (`946.js` → `639.js`) | 221 KB (full Supabase SDK) | 221 KB (unchanged — server-side rendering requirement) |

**Note:** The shared client chunk `564.js` still contains Supabase because `auth-provider.tsx` and `api/client.ts` use dynamic `import()` that webpack resolves at bundle time. The improvement is that login/signup page chunks are drastically smaller and no longer statically pull Supabase into the initial load.

### Tests Added

- `auth-bundle-isolation.test.tsx` — 4 tests proving:
  - Signup renders unavailable message, not a form
  - Signup does not import Supabase
  - Login does not statically import Supabase
  - Login does not contain a link to /signup

---

## Local Run Commands

```bash
# Typecheck
cd frontend && npx tsc --noEmit

# Tests
cd frontend && npm test

# Production build (check route-level bundle sizes)
cd frontend && npm run build

# Bundle analysis (after adding @next/bundle-analyzer)
cd frontend && npm run analyze
# Note: Uses --webpack flag because Turbopack is incompatible with @next/bundle-analyzer
```

## Lighthouse Against Staging

```bash
# 1. Deploy to staging environment
# 2. Run Lighthouse CLI
lighthouse https://staging.example.com/dashboard --output=json --output-path=./lighthouse-dashboard.json
lighthouse https://staging.example.com/meetings --output=json --output-path=./lighthouse-meetings.json
lighthouse https://staging.example.com/calendar --output=json --output-path=./lighthouse-calendar.json

# Or use Chrome DevTools > Lighthouse tab against each route
```

**Do not claim scores without running against a deployed staging build. Localhost Lighthouse scores are not representative.**
