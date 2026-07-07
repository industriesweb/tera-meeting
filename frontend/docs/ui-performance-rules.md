# UI Performance Rules

Rules for the upcoming UI redesign. Follow these to preserve or improve Lighthouse scores.

## Component Architecture

1. **Do not turn whole pages into `"use client"` only for a button or modal.** Keep page shells as Server Components. Use `next/dynamic` for interactive islands.

2. **Keep static page shells, headings, cards, and read-only views lightweight.** A meeting detail page should render title, metadata, and status as server output. Only the attendee manager, cancel dialog, and override form need client interactivity.

3. **Use `next/dynamic` only for optional or heavy Client Components.** Good candidates:
   - Attendee manager
   - Schedule override dialog
   - Cancellation dialog
   - Parking Lot picker
   - Heavy calendar overlap/timeline view
   - Optional rich inputs
   - Charts, if added later
   - Admin page (only used by secretaries)

4. **Do not lazy-load above-the-fold content.** Dashboard greeting, primary CTA, meeting title, and status badges must load immediately.

5. **Do not use `ssr: false` unless a component truly needs browser APIs.** A form that uses `useState` can still be server-rendered on initial HTML — `ssr: false` is only for things that access `window`, `document`, or browser-only APIs on mount.

6. **Extract pure functions from `"use client"` files.** Utility functions like `creationAccess()`, `getInitials()`, `formatDuration()`, and `requestDetailPermissions()` should live in shared utility modules (like `meeting-presentation.tsx`), not inside client-component files. This prevents them from being bundled into every route that imports the client component.

## Animation and Visual Effects

7. **Do not add a heavy animation library for simple transitions.** Prefer CSS `transform` and `opacity` over JavaScript animation libraries.

8. **Avoid global blur, backdrop filters, large animated shadows, and list-item animation storms.** These cause layout thrashing and paint storms on lower-end devices.

9. **Keep transitions under 300ms.** Longer transitions feel sluggish and block interaction.

## Layout Stability (CLS)

10. **Use fixed-height/width skeletons to prevent layout shift.** Every loading state must have dimensions that match the final content.

11. **Keep images/icons sized explicitly.** Never let images load without defined `width`/`height` or aspect-ratio.

12. **Preserve mobile responsiveness.** All new components must work at 375px width without horizontal scroll.

## Data Fetching

13. **Never change API or permission logic during visual-only work.** The API contract, React Query keys, and mutation behavior are frozen until Phase 9.

14. **Do not add new global providers or context wrappers without performance review.** Each provider re-renders its entire subtree on value change.

15. **Do not fetch data in layout files that could be fetched in page files.** Layout data persists across navigations and cannot be garbage-collected.

## Fonts and Icons

16. **Use `next/font` for all web fonts.** Self-hosted fonts eliminate render-blocking network requests to Google Fonts CDN.

17. **Do not load entire icon fonts when only a few icons are used.** Prefer individual SVG imports over icon font CDN links.

18. **Limit font families to 2 maximum.** Each additional font family adds a network request and FOUT/FOIT risk.

## Bundle Hygiene

19. **Do not add large dependencies without checking bundle impact.** Run `ANALYZE=true npm run build` before adding any dependency over 20KB minified.

20. **Tree-shake aggressively.** Import only what you use: `import { format } from "date-fns"` not `import * as dateFns from "date-fns"`.

21. **Route-split heavy features.** The admin page, live meeting controls, and executive request planner should be dynamically imported since they are used by a subset of users.

## Measurement

22. **Do not claim Lighthouse scores without staging measurement.** Run Lighthouse against a deployed staging build, not localhost.

23. **Track these metrics per release:**
   - LCP (Largest Contentful Paint) — target < 2.5s
   - CLS (Cumulative Layout Shift) — target < 0.1
   - INP (Interaction to Next Paint) — target < 200ms
   - Total bundle size (First Load JS per route)
