# Performance Optimization (Phase 9) — Before / After

This document records the measurable impact of the Phase 9 performance work so
future changes can be compared against a known baseline.

## What changed

1. **Route-level code splitting** — every page component in `client/src/App.tsx`
   is now loaded with `React.lazy` + `Suspense`. Heavy, rarely-first-loaded
   libraries (xlsx, reports, KRA/KPI, compliances, html2canvas) now ship in
   their own on-demand chunks instead of the initial bundle.
2. **On-demand TensorFlow / face-api** — the eager `loadFaceModels()` call was
   removed from server startup (`server/index.ts`); `server/mobile-routes.ts`
   now dynamically `import("./face-match")` inside the punch handler, so the
   native TF runtime and model weights load only on the first face match.
3. **Short-lived dashboard cache** — `GET /api/dashboard/stats` is cached in
   memory for 30s, keyed by scope (`super_admin` vs `company:<id>`), so repeated
   dashboard loads within the window skip the aggregate DB queries.
4. **React Query tuning** — global `gcTime` (30 min) added alongside the
   existing `staleTime: Infinity` to bound long-session memory growth.
5. **Employees table virtualization** — the largest list table now uses
   `@tanstack/react-virtual` so only the visible rows are mounted in the DOM,
   keeping scrolling smooth for companies with thousands of employees.

## Client bundle (production `npm run build`)

| Metric | Before | After |
| --- | --- | --- |
| Initial app chunk (`index-*.js`) | 2,806.99 kB (727.40 kB gzip) | 393.10 kB (124.22 kB gzip) |
| Bundle shape | one giant chunk | ~40 route/lib chunks loaded on demand |

The initial JavaScript the browser must download and parse on first load dropped
by roughly **86%** raw / **83%** gzip. Large per-feature libraries are now only
fetched when the user opens the page that needs them (e.g. `xlsx` ~424 kB,
`kra-kpi` ~467 kB, `reports` ~200 kB, `compliances` ~162 kB).

## Server startup

| Metric | Before | After |
| --- | --- | --- |
| TensorFlow / face models | loaded at boot ("[face-match] Models loaded") | loaded lazily on first face match |

After the change there is no `[face-match] Models loaded` line at boot, and
startup no longer pays the TF native-binding initialization cost.

## Dashboard

`GET /api/dashboard/stats` now serves from a 30s in-memory cache per scope, so
back-to-back dashboard visits (a common pattern) avoid repeating the aggregate
queries until the TTL expires.

## Not done in this phase (tracked as follow-ups)

- **Server-side pagination for high-volume list endpoints** (attendance,
  payroll, employees). These endpoints still return the full result set; only
  the employees *UI* is virtualized. Changing the API contracts is a larger,
  higher-risk change tracked as a follow-up so it can be done deliberately
  without regressions.

## Verification

- `tsc --noEmit` error count unchanged from baseline (pre-existing errors only).
- App boots on port 5000; public and authenticated pages render.
