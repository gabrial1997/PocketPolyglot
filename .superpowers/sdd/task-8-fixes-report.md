# Task 8 — final whole-branch review fixes (`feat/core-loop-reset`)

Fixes applied per the final code review. Suite was 678/678 green before; 691/691 green after
(13 new tests: 1 + 2 + 2 + 3 + 2 + 2 + 1, see below).

## Fix 1 — free-practice fallback leaks future-dated drills (Important)

`src/services/supabase/SupabaseSrsService.ts` (~line 536): added `.neq('stage', 'new')` to the
free-practice fallback query, with a comment explaining a never-seen item is not "practice". This
stops freshly-seeded (by `ensureDrillsSeeded`), future-dated minimal-pair drills from leaking into
a same-day reopen when nothing is due and the daily allowance is spent.

- Test: `src/services/supabase/SupabaseSrsService.test.ts` — new test
  `'free-practice fallback does not leak freshly-seeded, future-dated drills'` in the
  `SupabaseSrsService drill seeding` describe block: seeds a drill (due tomorrow, stage='new')
  with zero candidates and zero due items, asserts `getDueBatch()` returns `[]`.
- Command: `npx jest src/services/supabase/SupabaseSrsService.test.ts` → 22/22 passed.

## Fix 2 — overload gates don't suppress phrase admission (Important)

`src/session/selectBatch.ts`: named the due-flood condition `dueFloodGateFired` (step 3) and
wrapped the entire phrase-admission pass (pass 2 — fully-known + one-away phrases) in
`if (!dueFloodGateFired) { ... }`. A merely-spent daily allowance (newAllowance === 0, gate not
fired) still runs pass 2 — a fully-known phrase's building-block unlock is still allowed to land
the same day its last component word does, per the controller's decision.

- Test: `src/session/selectBatch.test.ts` — new describe block
  `'due-flood gate suppresses phrase admission (Fix 2)'` with two tests: (a) flood gate fired +
  fully-known phrase candidate → `admittedNew` is empty; (b) flood gate NOT fired, allowance merely
  spent (`introducedToday === STEADY_STATE_NEW_CAP`) → the fully-known phrase is still admitted.
- Command: `npx jest src/session/selectBatch.test.ts` → 38/38 passed.

## Fix 3 — no-choices word MC is a hard-stuck card (Important)

`src/screens/WordHear.tsx`: when `(item.choices?.length ?? 0) < 2` (e.g. `get_distractors` RPC
failure), the card now renders an exposure-style completable state instead of a chooseless dead
end — `GlossLine` (word + gloss, no pron-only bare gloss) inside `CardBody`, plus a `CardFooter`
with a `CtaButton` "Continue" that fires
`onComplete({ itemId: item.id, cardKind: 'word/hear', spoke: false })` with **no** `correct` field.
Because `repKind()` only counts a receptive rep when `correct === true`, this cannot count as a rep
or feed the "recalled"/"known" sets that gate phrase unlocks — it is a pure exposure, matching how
first-exposure "learn" cards already behave. Card stays pure (no new imports beyond existing
`CtaButton`/`CardFooter`/`GlossLine` chrome primitives).

- Test: `src/screens/WordHear.test.tsx` — new describe block
  `'no choices (get_distractors failure) — exposure fallback'`: (a) renders Continue + gloss text
  and asserts the `onComplete` payload has no `correct` key when `choices: undefined`; (b) same
  degrade path when `choices` has exactly 1 entry.
- Command: `npx jest src/screens/WordHear.test.tsx` → 19/19 passed (existing snapshot unaffected —
  the fallback path only activates below 2 choices, which the snapshot fixture doesn't hit).

## Fix 4 — devTools test + reset failure surfaced (carried finding)

(a) Added `src/services/devTools.test.ts`: mocks `./devClock`'s `clearClockOffset` and a fake
Supabase client's `rpc`. Asserts `resetProgress`: calls `client.rpc('reset_my_progress')`; throws
the RPC's `error` on failure and does NOT call `clearClockOffset`; calls `clearClockOffset()`
strictly AFTER a successful RPC (asserted via a call-order array, not just call counts).

(b) `src/screens/SettingsHost.tsx` / `src/screens/SettingsScreen.tsx`: added an optional
`resetError?: boolean` field to the `dev` prop object (`SettingsScreenProps`). The host now tracks
`resetError` state — set `true` in `onResetProgress`'s `.catch()` (previously silently swallowed),
cleared on a successful reset AND on a successful skip-day. `DevSection` shows the reset row title
as `'Reset failed — tap to retry'` (danger variant, same two-tap confirm flow) when `resetError` is
set, falling back to the normal `'Reset progress'` / `'Tap again to erase all progress'` copy
otherwise.

- Tests:
  - `src/services/devTools.test.ts` (new, 3 tests).
  - `src/screens/SettingsHost.test.tsx` — 2 new tests: a rejected `resetProgress` surfaces
    `'Reset failed — tap to retry'`; a subsequent successful reset clears it back to
    `'Reset progress'`.
  - `src/screens/SettingsScreen.test.tsx` — 2 new tests: `dev.resetError: true` renders the danger
    copy and still requires the two-tap confirm before firing `onResetProgress`; `resetError:
    false` renders the normal copy.
- Commands: `npx jest src/services/devTools.test.ts src/screens/SettingsHost.test.tsx
  src/screens/SettingsScreen.test.tsx` → 3 + 8 + 12 = 23/23 passed.

## Fix 5 — comment/test slop (Minor ride-alongs)

- `SupabaseSrsService.ts` `submit()` companion-recognition-write comment (~804): rewritten. Live
  purpose now stated: under the MC↔speak rotation a graded turn can be a pronunciation-template
  rating with no recognition-template grade that round, so the companion write keeps the
  recognition schedule's `due_at` advancing regardless of which turn (MC or speak) actually fired.
- `SupabaseSrsService.ts` ~845: replaced the stale "split by production card-kind set" comment —
  `repKind()` is now cited as the single source of truth for the receptive/productive split
  (production kinds are completion-counted, not correctness-gated).
- `SupabaseSrsService.ts`: added module-level `const DRILL_SEED_DEFER_MS = 86_400_000` (next to
  `PRACTICE_BATCH`) and replaced the inline `86_400_000` literal in `ensureDrillsSeeded`'s due_at
  calculation with it. `pacing.ts` is session-layer and left untouched — this constant is local to
  the service file per the controller's decision.
- `src/session/sessionController.test.tsx` ~249: replaced the stale "renderFor doesn't yet route
  these specially" comment — renderFor DOES route `retest:'speak'` to `word/say` when the item has
  choices; the test fixtures (`newWord()`) simply have none, so they fall back to `word/hear`,
  same as the MC step. Comment now states this precisely.
- `src/services/supabase/index.ts`: added a one-line comment on `if (__DEV__) void
  loadClockOffset();` noting the fire-and-forget AsyncStorage read races the SRS calls made just
  below, so `devNow()` may run real-time (offset 0) for the very first fetch of a session —
  dev-only, self-heals by the next fetch. No structural change (factory stays sync).

No dedicated test for Fix 5 (comment/constant-only changes); covered indirectly by the full suite
staying green (constant substitution is behavior-preserving, verified by
`SupabaseSrsService.test.ts`'s existing drill-seeding tests, which assert on the actual due_at
value).

## Fix 6 — pin the headline guarantee (Recommendation, cheap)

Added `src/session/noMcBeforeIntro.test.ts`: composes `expandLearningSteps` (`LEARNING_STEP_GROUP_SIZE`
from `pacing.ts`) with `renderFor`/`decideKind` over a representative day-0 batch — one word of
each `wordClass` (concrete/abstract/function), one picture word, a locked teaser phrase (unknown
component present in the batch but not yet known), and a fully-known phrase. For every item id, it
finds the FIRST occurrence in the expanded step sequence and asserts its rendered kind is one of
`word/learn-concrete` / `word/learn-abstract` / `word/learn-function` / `word/pic-review` /
`phrase/hear` / `phrase/locked` — never a quiz kind (`word/hear`, `word/say`, `phrase/meaning`,
`phrase/sayit`, ...). A sanity assertion (`steps.some(retest === 'mc' || 'speak')`) guards against
the test trivially passing if `expandLearningSteps` stopped producing retest copies. Pure-module
test, no React, no clock.

- Command: `npx jest src/session/noMcBeforeIntro.test.ts` → 1/1 passed.

## Full-suite verification

- `npm run lint` → clean.
- `npm run typecheck` (`tsc --noEmit`) → clean.
- `npx jest` (parallel, default) → **691/691 passed**, 76 suites, 17 snapshots (up from
  678/678 pre-fix; +13 new tests across the fixes above).
- `npx jest --runInBand` → **691/691 passed** (same totals) — StartingLoop-style flake mentioned
  in the task brief did NOT reproduce in either mode on this run.

No files touched beyond those named in the task (plus their test files) and this report.
