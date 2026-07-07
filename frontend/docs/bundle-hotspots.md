# Bundle Hotspots — Chunk Investigation

Generated from `npm run analyze` (webpack mode) on 6 Jul 2026.

**Updated:** Phase 8A.1 applied — auth bundle isolation (2026-07-06)

## Phase 8A.1 Status

| Finding | Status | Action Taken |
|---------|--------|-------------|
| Login page static Supabase import | **Fixed** | Replaced with `loadSupabaseClient()` dynamic loader |
| Signup page static Supabase import | **Fixed** | Replaced with server component (no Supabase) |
| Signup link in login page | **Fixed** | Removed |
| `requestDetailPermissions` in page.tsx | **Fixed** | Moved to `features/executive-requests/request-detail-permissions.ts` |
| `buildExecutiveTargets` in page.tsx | **Fixed** | Moved to `features/executive-requests/executive-targets.ts` |
| Chunk `946.js` (server Supabase) | **Unchanged** | Server-side Supabase SDK — required for auth; renamed to `639.js` |
| Chunk `564.js` (client Supabase) | **Unchanged** | Client-side Supabase loaded by `auth-provider.tsx` and `api/client.ts` dynamic imports |

### After Sizes

| Chunk | Before | After | Notes |
|-------|--------|-------|-------|
| Login page | 33 KB | 6.9 KB | Dynamic import only |
| Signup page | 33 KB | 1.3 KB | Server component, no JS |
| `946.js` → `639.js` | 221 KB | 221 KB | Server-side, unchanged |
| `564.js` | 185 KB | 185 KB | Client-side, unchanged |

## Summary

All four largest chunks are **server-side** (Node.js) bundles, not client bundles. The two client-side framework chunks (`react-dom-client` at 200 KB, Next.js router at 222 KB) are unavoidable Next.js internals.

| Chunk | Parsed | Gzip | Type | Contains |
|-------|--------|------|------|----------|
| `319.js` | 367 KB | 96 KB | Server | Next.js RSC/metadata/dynamic-rendering internals |
| `946.js` | 221 KB | 57 KB | Server | Full Supabase SDK (auth + realtime + storage + postgrest) |
| `445.js` | 154 KB | 42 KB | Server | Next.js server runtime (OpenTelemetry, fetch patching, streaming) |
| `app/favicon.ico/route.js` | 69 KB | 25 KB | Server | Auto-generated route handler for favicon.ico |

---

## Chunk 1: `319.js` — 367 KB (96 KB gzip)

**Shared/Route-specific:** Shared — loaded by every server-rendered route.

### Top 10 Modules

| # | Module | Parsed | Gzip |
|---|--------|--------|------|
| 1 | `react-server-dom-webpack-client.node.production.js` | 29 KB | 9 KB |
| 2 | `metadata.js` (Next.js metadata resolution) | 23 KB | 8 KB |
| 3 | `dynamic-rendering.js` | 21 KB | 8 KB |
| 4 | `cache.js` (segment-cache) | 19 KB | 6 KB |
| 5 | `params.js` | 16 KB | 5 KB |
| 6 | `search-params.js` | 15 KB | 5 KB |
| 7 | `instant-samples.js` | 14 KB | 5 KB |
| 8 | `resolve-metadata.js` | 12 KB | 4 KB |
| 9 | `scheduler.js` (segment-cache) | 10 KB | 3 KB |
| 10 | `ppr-navigations.js` | 9 KB | 4 KB |

### Import Chain

No application import chain. These are **Next.js framework internals** bundled into every server-side compilation unit because:

- `src/app/(app)/layout.tsx` (line 1: `"use client"`) is rendered on the server for SSR. Next.js must bundle the RSC protocol, metadata resolution, dynamic rendering, and PPR navigation runtime to server-render client components.

### Classification

| Module | Required Globally | Route-Only | Lazy-Load Candidate | Unused/Duplicated |
|--------|:-:|:-:|:-:|:-:|
| react-server-dom-webpack | Yes (RSC) | | | |
| metadata.js | Yes (App Router) | | | |
| dynamic-rendering.js | Yes (App Router) | | | |
| segment-cache | Yes (App Router) | | | |
| ppr-navigations.js | Yes (App Router) | | | |

### Recommended Action

**Keep.** These are core Next.js App Router internals. Cannot be removed or lazy-loaded. Size is inherent to the framework.

### Risk

None — framework code, not application code.

---

## Chunk 2: `946.js` — 221 KB (57 KB gzip)

**Shared/Route-specific:** Shared — loaded on every server-rendered route (because login/signup statically import it).

### Top 10 Modules

| # | Module | Parsed | Gzip |
|---|--------|--------|------|
| 1 | `createBrowserClient.js` + 48 concatenated (@supabase/ssr) | 218 KB | 55 KB |
| 2 | `GoTrueClient.js` (@supabase/auth-js) | 62 KB | 18 KB |
| 3 | `storage-js/index.mjs` (@supabase/storage-js) | 26 KB | 8 KB |
| 4 | `postgrest-js/index.mjs` (@supabase/postgrest-js) | 26 KB | 8 KB |
| 5 | `phoenix.mjs` (@supabase/realtime-js) | 13 KB | 5 KB |
| 6 | `GoTrueAdminApi.js` (@supabase/auth-js) | 10 KB | 3 KB |
| 7 | `supabase-js/index.mjs` (@supabase/supabase-js) | 9 KB | 3 KB |
| 8 | `webauthn.js` (@supabase/auth-js) | 8 KB | 3 KB |
| 9 | `RealtimeChannel.js` (@supabase/realtime-js) | 8 KB | 3 KB |
| 10 | `RealtimeClient.js` (@supabase/realtime-js) | 6 KB | 2 KB |

### Import Chain (Two Paths)

**Chain A — Static import (defeats code splitting):**
```
src/app/login/page.tsx [line 7, "use client"]
  └── import { supabase } from "@/lib/supabase/client"     [STATIC]

src/app/signup/page.tsx [line 7, "use client"]
  └── import { supabase as supabaseClient } from "@/lib/supabase/client"  [STATIC]

src/lib/supabase/client.ts [line 1]
  └── import { createBrowserClient } from "@supabase/ssr"   [STATIC]
        └── import { createClient } from "@supabase/supabase-js"
              └── pulls in: @supabase/auth-js + @supabase/postgrest-js
                           + @supabase/realtime-js + @supabase/storage-js
                           + @supabase/functions-js
```

**Chain B — Dynamic import (correct but overridden by Chain A):**
```
src/app/(app)/layout.tsx [line 1, "use client"]
  └── import { useAuth, AuthProvider } from "@/components/providers/auth-provider"  [STATIC]
        └── src/components/providers/auth-provider.tsx [line 33, 69]
              └── const { supabase } = await import("@/lib/supabase/client")  [DYNAMIC]

src/lib/api/client.ts [line 28]
  └── const { supabase } = await import("@/lib/supabase/client")  [DYNAMIC]
```

**Critical finding:** The static imports in `login/page.tsx` and `signup/page.tsx` cause webpack to bundle the full `@supabase/ssr` → `@supabase/supabase-js` chain into the shared chunk, defeating the dynamic `import()` strategy in `auth-provider.tsx` and `api/client.ts`.

### Classification

| Module | Required Globally | Route-Only | Lazy-Load Candidate | Unused/Duplicated |
|--------|:-:|:-:|:-:|:-:|
| `@supabase/ssr` (createBrowserClient) | | | Yes — login/signup only | |
| `@supabase/auth-js` (GoTrueClient) | | | Yes — auth only | |
| `@supabase/postgrest-js` | | | Yes — API calls only | |
| `@supabase/realtime-js` (phoenix) | | | **Unused** — no subscriptions in frontend | |
| `@supabase/storage-js` | | | **Unused** — no file uploads in frontend | |
| `@supabase/functions-js` | | | **Unused** — no edge function calls | |
| `buffer` polyfill (22 KB) | | | **Unused** — browser has native Buffer | |
| `cookie` library (2 KB) | | | Yes — SSR cookie handling | |

### Recommended Action

1. **Move `login/page.tsx` and `signup/page.tsx` to dynamic imports** — `await import("@/lib/supabase/client")` instead of static import. This enables webpack to code-split the Supabase SDK into a separate chunk loaded only on auth pages.
2. **Add `@supabase/ssr` and `@supabase/supabase-js` to `optimizePackageImports`** in `next.config.ts` — enables tree-shaking of unused submodules (realtime-js, storage-js, functions-js).
3. **Consider `serverExternalPackages: ["@supabase/ssr"]`** in `next.config.ts` — prevents bundling the full SDK into server chunks.
4. **Remove unused submodules** if `optimizePackageImports` is insufficient — the frontend uses auth only (no realtime subscriptions, no storage, no edge functions).

### Risk

Low — converting static to dynamic imports is safe because `supabase()` is already a lazy singleton (creates client on first call, not at import time). The `login/page.tsx` and `signup/page.tsx` pages already use the `supabase()` function inside event handlers, not at module scope.

---

## Chunk 3: `445.js` — 154 KB (42 KB gzip)

**Shared/Route-specific:** Shared — loaded by every server-rendered route.

### Top 10 Modules

| # | Module | Parsed | Gzip |
|---|--------|--------|------|
| 1 | `@opentelemetry/api/index.js` | 24 KB | 8 KB |
| 2 | `dynamic-rendering.js` | 21 KB | 8 KB |
| 3 | `patch-fetch.js` | 11 KB | 4 KB |
| 4 | `node-web-streams-helper.js` | 10 KB | 3 KB |
| 5 | `constants.js` | 7 KB | 2 KB |
| 6 | `@edge-runtime/cookies/index.js` | 5 KB | 2 KB |
| 7 | `trace/constants.js` | 5 KB | 2 KB |
| 8 | `staged-rendering.js` | 4 KB | 1 KB |
| 9 | `response-cache/index.js` | 4 KB | 1 KB |
| 10 | `next-url.js` | 4 KB | 1 KB |

### Import Chain

No application import chain. These are **Next.js server runtime internals**:

- `@opentelemetry/api` — tracing hooks injected by Next.js
- `patch-fetch.js` — patches global `fetch` for `revalidate`/`cache` tags
- `node-web-streams-helper` — stream utilities for SSR
- `staged-rendering.js` / `response-cache` — rendering pipeline
- `@edge-runtime/cookies` — cookie parsing for middleware (even though no `middleware.ts` exists)

### Classification

| Module | Required Globally | Route-Only | Lazy-Load Candidate | Unused/Duplicated |
|--------|:-:|:-:|:-:|:-:|
| `@opentelemetry/api` | Yes (Next.js injects it) | | | |
| `patch-fetch.js` | Yes (fetch interception) | | | |
| `node-web-streams-helper` | Yes (SSR streaming) | | | |
| `@edge-runtime/cookies` | Yes (middleware runtime) | | | |
| `response-cache` | Yes (ISR/PPR) | | | |

### Recommended Action

**Keep.** These are core Next.js server runtime internals. Cannot be removed or lazy-loaded.

### Risk

None — framework code, not application code.

---

## Chunk 4: `app/favicon.ico/route.js` — 69 KB (25 KB gzip)

**Shared/Route-specific:** Route-specific — only loaded when serving `GET /favicon.ico`.

### Module Breakdown

| # | Module | Parsed | Gzip |
|---|--------|--------|------|
| 1 | Compiled route wrapper (Next.js internals) | 69 KB | 25 KB |
| 2 | `app-paths` router utils | — | — |
| 3 | `connection()` function | — | — |
| 4 | `createDefaultMetadata` / `createDefaultViewport` | — | — |
| 5 | Error overlay CSS / SVG icon component | — | — |

All sub-modules are externals (0 parsedSize leaf modules). The 69 KB is the compiled route handler wrapping.

### Import Chain

No application import chain. Next.js automatically creates a route handler for `src/app/favicon.ico` (a 25 KB static file). The route handler bundles shared Next.js runtime (metadata resolution, error handling, static generation bailout) into this compilation unit.

### Classification

| Module | Required Globally | Route-Only | Lazy-Load Candidate | Unused/Duplicated |
|--------|:-:|:-:|:-:|:-:|
| Route handler wrapper | | Yes (favicon only) | | |
| Metadata resolution | | | | Duplicated from 319.js |
| Error overlay CSS | | | | Duplicated from framework |

### Recommended Action

**Optimize asset.** Replace `src/app/favicon.ico` (25 KB) with a smaller favicon:
- Use a 16x16 or 32x32 ICO file (typically 1-4 KB)
- Or use `src/app/icon.png` with `next/image` optimization
- The 69 KB route handler size is inflated by webpack bundling shared Next.js runtime — this is inherent to the framework

### Risk

Low — favicon optimization is cosmetic.

---

## Special Investigations

### Why is `app/favicon.ico/route.js` 69 KB?

The favicon.ico file itself is 25 KB. Next.js creates an auto-generated route handler for it, which bundles shared framework runtime (metadata resolution, error handling, connection detection) into the route's compilation unit. The 69 KB includes ~44 KB of framework boilerplate duplicated from other server chunks.

**Not actionable** — this is webpack's chunk splitting behavior for auto-generated routes.

### Does Socket.IO client appear in shared chunks?

**No.** Zero imports of `socket.io-client` or `socket.io` found anywhere in `src/`. The frontend uses HTTP polling via React Query (`refetchInterval`), not WebSocket connections.

### Do chart/editor/calendar/animation/icon/date/modal libraries appear in shared chunks?

**No.** None of the following are imported in the frontend:
- Chart libraries (recharts, d3, chart.js)
- Editor libraries (quill, tiptap, prosemirror)
- Calendar libraries (fullcalendar, calendarjs)
- Animation libraries (framer-motion, lottie)
- Date libraries (date-fns — confirmed dead dependency)
- Modal libraries (@headlessui, @radix-ui, @base-ui)

### Does the app layout/global provider import route-only dependencies?

**No direct imports, but indirect static imports defeat code splitting:**

- `src/app/layout.tsx` — clean server component, zero Supabase/API imports ✓
- `src/app/(app)/layout.tsx` — imports `AuthProvider` which uses **dynamic** `import("@/lib/supabase/client")` ✓
- `src/app/(app)/layout.tsx` — imports `AppLayout` → `api/client.ts` which uses **dynamic** `import("@/lib/supabase/client")` ✓

**BUT:** `login/page.tsx` and `signup/page.tsx` use **static** imports of `@/lib/supabase/client`, which pulls the full Supabase SDK into the shared server chunk for all routes.

---

## Complete Chunk Map (Server-Side)

| Chunk | Size | Content | Action |
|-------|------|---------|--------|
| `319.js` | 367 KB | Next.js RSC/metadata/dynamic-rendering | Keep (framework) |
| `946.js` | 221 KB | Full Supabase SDK | **Dynamic import + tree-shake** |
| `445.js` | 154 KB | Next.js server runtime | Keep (framework) |
| `favicon.ico/route.js` | 69 KB | Auto-generated route handler | Optimize favicon asset |
| `883.js` | 58 KB | ky + @tanstack/react-query | Keep (live dependencies) |
| `meetings/[id]/page.js` | 54 KB | Meeting detail page | Route-only (correct) |
| `meetings/[id]/live/page.js` | 48 KB | Live meeting page | Route-only (correct) |
| `executive-requests/[id]/plan/page.js` | 46 KB | ER planning page | Route-only (correct) |
| `meetings/page.js` | 43 KB | Meetings list page | Route-only (correct) |
| `parking-lot/page.js` | 41 KB | Parking lot page | Route-only (correct) |
| `dashboard/page.js` | 37 KB | Dashboard page | Route-only (correct) |
| `executive-requests/new/page.js` | 35 KB | New ER page | Route-only (correct) |
| `admin/page.js` | 34 KB | Admin page | Route-only (correct) |
| `executive-requests/page.js` | 34 KB | ER list page | Route-only (correct) |
| `login/page.js` | 33 KB | Login page | Route-only (correct) |
| `signup/page.js` | 33 KB | Signup page | Route-only (correct) |
| `calendar/page.js` | 33 KB | Calendar page | Route-only (correct) |
| `(app)/layout.js` | 22 KB | Auth layout | Route-only (correct) |

## Complete Chunk Map (Client-Side)

| Chunk | Size | Content | Action |
|-------|------|---------|--------|
| `794.js` | 222 KB | Next.js client router (RSC client, segment cache) | Keep (framework) |
| `4bd1b696.js` | 200 KB | react-dom-client (production) | Keep (framework) |
| `framework.js` | 190 KB | react + react-dom + scheduler | Keep (framework) |
| `564.js` | 185 KB | @supabase/ssr + buffer + cookie | **Dynamic import + tree-shake** |
| `main.js` | 132 KB | Next.js main bundle | Keep (framework) |
| `44530001.js` | 62 KB | GoTrueClient (auth) | **Dynamic import** |
| `609.js` | 45 KB | ky + @tanstack/react-query | Keep (live deps) |
| `409.js` | 27 KB | App-specific code | Keep |
| `(app)/meetings/[id]/page.js` | 22 KB | Meeting detail | Route-only (correct) |
| `(app)/layout.js` | 22 KB | Auth layout shell | Route-only (correct) |

## Priority Actions

| # | Action | Expected Savings | Risk |
|---|--------|-----------------|------|
| 1 | Convert `login/page.tsx` and `signup/page.tsx` to dynamic `import("@/lib/supabase/client")` | ~155 KB server, ~185 KB client (enables code splitting) | Low |
| 2 | Add `@supabase/ssr` to `optimizePackageImports` in `next.config.ts` | ~20-40 KB (tree-shake realtime/storage/functions) | Low |
| 3 | Add `serverExternalPackages: ["@supabase/ssr"]` in `next.config.ts` | ~120 KB server chunk (prevents bundling into 946.js) | Medium |
| 4 | Replace 25 KB favicon.ico with smaller asset | ~20 KB route handler | Low |
| 5 | Remove dead deps: `@base-ui/react`, `date-fns`, `zod`, `react-hook-form`, `@hookform/resolvers`, `nuqs`, `zustand` | ~228 KB+ minified | None |
