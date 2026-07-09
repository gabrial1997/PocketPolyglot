# Progress Live Coverage Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. TDD each task.

**Goal:** Make the Progress page functional — real per-band coverage, the fixed 1,000-word
denominator, and dot-grid dots at each known word's true frequency-rank position.

**Architecture:** `ProgressService.getCoverage()` returns `{ total, knownRanks }` (client-side join
of the `known_lemmas` view with `lemmas.freq_rank` — no migration). A pure `computeBands()` helper
buckets ranks into the four mockup bands; `ProgressScreen` derives hero/bands/grid from ranks.

**Tech Stack:** Expo / React Native (TypeScript), Supabase (existing views only), Jest + RNTL.

## Global Constraints

- **No gamification** — coverage framing only; visual design of the screen is otherwise unchanged.
- **Tier-B boundary:** the screen stays PURE (props only); the host talks to the injected service.
- **No `any`** in contracts; no migration (existing RLS-safe views only).
- **Keep CI green:** `npm run lint && npm run typecheck && npm test && npm run build`.

---

### Task 1: Pure band math — `computeBands`

**Files:** Create `src/screens/coverageBands.ts`, `src/screens/coverageBands.test.ts`.

- [x] Failing tests: empty → all pct 0; ranks 1..100 → Top 100 = 100% (known 100/100), others 0;
  ranks 1..250 → bands 100%, 75%, 0%, 0%; cutoff edges (rank 300 in band 2, 301 in band 3,
  1000 in band 4); small `total` clamps band totals.
- [x] Implement `BAND_DEFS` + `computeBands(knownRanks, total)`.

### Task 2: Service contract — `ProgressCoverage`

**Files:** Modify `src/services/index.ts`, `src/services/stubs.ts`,
`src/services/supabase/SupabaseProgressService.ts`; create
`src/services/supabase/SupabaseProgressService.test.ts`.

- [x] Failing service test with a fake client: known ids join to sorted ranks; unranked known
  lemma dropped; empty known → `[]`; total = ranked count.
- [x] `ProgressService.getCoverage(): Promise<ProgressCoverage>`; stub returns
  `{ total: 1000, knownRanks: [] }`.
- [x] Rewrite `SupabaseProgressService` per spec §2 (drop `user_coverage`).

### Task 3: Screen + host render live data

**Files:** Modify `src/screens/ProgressScreen.tsx`, `src/screens/ProgressHost.tsx`,
`src/screens/ProgressHost.test.tsx`.

- [x] Failing host tests: service returns ranks 1..250 → "250", hero "25", "101 – 300" row shows
  75%; Top 100 completed (check icon renders, no "100%" text).
- [x] Screen: props `{ total, knownRanks }`; derive hero; `computeBands`; grid dot i ← rank i+1
  membership; opacity fades by rank. Delete `DEFAULT_BANDS`.
- [x] Host passes coverage through; defaults `{ total: 1000, knownRanks: [] }`.
  
  > **Errata (2026-07-09, rebase onto honest-data PR):** on fetch failure the host now shows a retryable error state (HostError) — the silent `{ total: 1000, knownRanks: [] }` default described here no longer exists.

### Task 4: CI + docs + ship

- [x] Full suite: `lint`, `typecheck`, `test`, `build` green.
- [x] Update `docs/WIRING_MAP.md` / `docs/BACKEND_INTEGRATION.md` if they pin the old
  `getCoverage() → { known, total }` shape.
- [x] Commit + push `claude/codebase-familiarization-m8wh90`.
