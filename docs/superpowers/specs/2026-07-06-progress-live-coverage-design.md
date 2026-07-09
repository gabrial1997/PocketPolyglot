# Progress page — live coverage (real bands, honest denominator, true dot positions)

**Date:** 2026-07-06
**Status:** Approved (brainstorming with founder)
**Branch:** `claude/codebase-familiarization-m8wh90`

## Problem

Beta reports (2026-06-25 `a7c574c2`, 2026-07-05 `7f437ef5`) call the Progress page "just cosmetic".
Three concrete dishonesties today:

1. **The four frequency-band bars are hard-coded** (`DEFAULT_BANDS` in `ProgressScreen.tsx`:
   100/92/64/18%) — pure mockup residue, never wired to data.
2. **The hero denominator is wrong.** `user_coverage.total_count` counts lemmas with
   `qa_status <> 'draft'` — **18** on the live project — even though the full corpus is seeded
   (1,000 lemmas with `freq_rank`). The learner's real state (42 known) renders as 42 of 18.
3. **The dot grid lies about position.** It lights the first N dots sequentially while the grid is
   labeled "most common → rarer" — the dots don't correspond to which words are actually known.

## Decisions (locked with founder, 2026-07-06)

- **Denominator = the fixed 1,000-word corpus** (lemmas with `freq_rank`), NOT the QA-approved
  subset. Coverage is framed against the product promise ("the first 1,000 words") and stays
  stable while content QA proceeds.
- **Scope = real frequency bands only.** Ship the existing mockup faithfully with live numbers.
  Phrases-followed, speaking coverage, and recently-learned lists are out of scope for this pass.
- **Dot grid uses true rank positions.** Dot *i* (0-based) = frequency rank *i+1*; a known word
  lights its actual slot. The most-common/rarer axis becomes honest.
- **No gamification** (unchanged, locked): coverage framing only — no streaks/XP/confetti.

## Design

### 1. Service contract — `ProgressService.getCoverage()` returns ranks, not a pre-baked pair

```ts
export interface ProgressCoverage {
  /** Size of the core-word corpus (lemmas with a frequency rank; 1,000 in v1). */
  total: number;
  /** Frequency ranks (1-based) of the learner's KNOWN lemmas, ascending. */
  knownRanks: number[];
}
export interface ProgressService {
  getCoverage(): Promise<ProgressCoverage>;
}
```

One shape drives everything: hero count = `knownRanks.length`, hero % = `round(known/total)`,
band bars = ranks bucketed by cutoffs, grid = a rank set. A known lemma **without** a rank (off-list
content) doesn't count toward "of the 1,000" — honest by construction.

### 2. Supabase implementation — client-side join over existing RLS-safe views (NO migration)

`SupabaseProgressService.getCoverage()`:
1. `known_lemmas` → `select lemma_id` (security-invoker view; RLS scopes to the signed-in user).
2. `lemmas` → `select id, freq_rank` where `freq_rank not is null`, `.range(0, 1499)`.
3. `total` = ranked-lemma row count; `knownRanks` = known ids mapped through the rank map,
   sorted ascending.

The `user_coverage` view is no longer read by the app (it stays in the schema; fixing its
denominator is a content-QA-era migration we don't need now). NB: the REST page size caps step 2
at 1,000 rows — exactly the corpus size by design. If the corpus ever grows past 1,000, replace
with a server-side `user_rank_coverage` view (noted, not built — YAGNI).

### 3. Pure band math — `src/screens/coverageBands.ts`

```ts
export const BAND_DEFS = [
  { label: 'Top 100',    sub: 'the everyday core',    hi: 100 },
  { label: '101 – 300',  sub: 'common conversation',  hi: 300 },
  { label: '301 – 600',  sub: 'broader topics',       hi: 600 },
  { label: '601 – 1000', sub: 'fuller fluency',       hi: 1000 },
] as const;
export interface CoverageBand { label: string; sub: string; known: number; total: number; pct: number }
export function computeBands(knownRanks: readonly number[], total: number): CoverageBand[];
```

Band totals derive from the cutoffs clamped to `total`; `pct = round(100 * known / bandTotal)`
(0 when the band is empty). Pure, no services — unit-tested directly.

### 4. Screen + host

- `ProgressScreen` props become `{ total?: number; knownRanks?: number[] }`. It derives the hero
  count/%, computes bands via `computeBands`, and lights grid dot *i* iff rank *i+1* is in a
  `Set(knownRanks)`. Known-dot opacity fades by rank position (most-common brightest), replacing
  the old fade-by-fill-index. The hard-coded `DEFAULT_BANDS` and the `known`/`bands` props die.
- A completed band keeps the good-color bar + check; everything else renders exactly as today.
- `ProgressHost` passes the fetched `ProgressCoverage` through; keeps `{ total: 1000,
  knownRanks: [] }` defaults on failure (a fresh user honestly shows 0%).
  
  > **Errata (2026-07-09, rebase onto honest-data PR):** on fetch failure the host now shows a retryable error state (HostError) — the silent `{ total: 1000, knownRanks: [] }` default described here no longer exists.

- `StubProgressService` returns `{ total: 1000, knownRanks: [] }`.

## Out of scope (YAGNI)

- Phrases-followed stat, speaking (pronunciation-template) coverage, recently-learned words,
  coverage-over-time history — all future passes; the data exists when wanted.
- Fixing the `user_coverage` view / any migration.
- Content QA (`qa_status` promotion) — orthogonal.

## Testing

- `computeBands`: empty ranks → all 0%; ranks 1..100 → Top 100 at 100%, others 0; partial bands
  round correctly; ranks are bucketed by cutoff (e.g. rank 300 ∈ 101–300, rank 301 ∈ 301–600);
  a small `total` clamps band totals.
- `SupabaseProgressService`: fake client — known ids join to ranks (sorted, unranked known lemmas
  dropped); no known rows → `{ total: N, knownRanks: [] }`; query error → throws (host keeps
  defaults).
  
  > **Errata (2026-07-09, rebase onto honest-data PR):** on fetch failure the host now shows a retryable error state (HostError) — the silent `{ total: 1000, knownRanks: [] }` default described here no longer exists.
- `ProgressHost`: inject a service returning ranks 1..250 → renders "250", hero "25", Top 100 row
  complete (check icon), "101 – 300" row at 75%.
- Full CI green: `lint`, `typecheck`, `test`, `build`.
