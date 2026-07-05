# Core-Loop Reset: Teach → MC → Speak Arc, Phrase Building Blocks, Dev Time-Travel

**Date:** 2026-07-05
**Status:** Approved (brainstorm 2026-07-05)
**Approach:** Extend the existing pure session modules (Approach A) — no schema changes,
no session-compiler rewrite, no server-side template scheduling (that remains "Plan B").

## Problem

Beta testing surfaced four pedagogical failures in the current core loop:

1. **Locked phrases flood the start of sessions.** Phrase admission tolerates one unknown
   component and interleave ordering is round-robin, so locked teasers land anywhere —
   including first, before any word has been taught.
2. **Words are quizzed (MC) without ever being introduced.** Items with an existing
   `review_state` row have `stage != 'new'` and skip the learn card entirely, landing
   straight on `word/hear` MC. (Stale test-account data amplifies this.)
3. **Almost no speaking.** `word/say` renders only after 6 correct *productive* reps
   (`PRODUCTION_GRADUATION_FLOOR`), but productive reps only accrue from production cards —
   a circular dependency. Outside picture cards, reviews are MC forever.
4. **No way to test day boundaries.** Daily caps and FSRS due dates are real-time-driven;
   there is no dev control to advance a day or reset progress.

## Goals

- Every new word runs the full arc **in its introduction session**:
  learn card (see + hear + meaning) → MC meaning quiz → speak it.
  **No MC ever appears for an item that has not had its learn/exposure card.**
- Phrases unlock like **building blocks**: the locked teaser appears only when the learner
  is exactly one word away AND that word is being introduced this session; learning it
  fires the chime + unlock reveal, then the phrase runs its own arc
  (`phrase/hear` → `phrase/meaning` → `phrase/sayit`).
- Reviews on later days **rotate modality** (MC ↔ speak) instead of the unreachable ladder.
- Dev-only controls: **skip-to-next-day** (time travel) and **reset progress**.
- Wipe the test accounts (`test@pocketpolyglot.dev`, `newuser@pocketpolyglot.dev`) to day 0
  as part of the build.

## Non-goals

- **No pronunciation grading.** Speak cards are practice/exposure: the learner records (or
  just says it) and continues. Completion — not correctness — is what counts. GOP scoring
  stays Phase 1 / later.
- **No audio special-casing.** Audio-less words and phrases are treated identically to
  audio-backed ones (silent play orb, degraded self-compare); this self-heals as TTS audio
  is backfilled. No admission gates on audio except the existing pair (drill) gate.
- No changes to picture-word flow (`word/pic-review` already runs a full multi-modal loop).
- No server-side/template-aware scheduling (Plan B), no schema migrations.

## Design

### 1. New-word arc — `expandLearningSteps` (src/session/learningSteps.ts)

Current output per group of ≤3 consecutive new words: `[intros…, MC retests…]`.
New output: `[intros…, MC retests…, speak retests…]`.

- `ReviewItem.retest` changes from `boolean` to a step marker: `'mc' | 'speak'`
  (update all producers/consumers; `renderFor` treats any truthy `retest` as
  "not a first exposure").
- `renderFor` routes `retest === 'speak'` → `word/say` for words. `word/say` becomes
  **audio-optional** (see §6).
- **New phrases get the same arc.** `expandLearningSteps` also expands `stage === 'new'`
  phrases: `[phrase (hear), phrase retest:'mc' (meaning), phrase retest:'speak' (sayit)]`.
  `renderFor` for phrases honors the marker: `retest:'mc'` → `phrase/meaning`
  (falls back to `phrase/hear` if < 2 choices, as today), `retest:'speak'` → `phrase/sayit`.
  Phrases are expanded as single-item groups (they don't batch with word groups).
- Group size stays `LEARNING_STEP_GROUP_SIZE = 3`.

The "no MC without introduction" guarantee = data reset (§7) + this arc: post-reset, every
item's first appearance is `stage:'new'`, which always renders the learn/exposure card first.

### 2. Phrase building blocks — `selectBatch` (src/session/selectBatch.ts)

**Admission tightens.** A phrase candidate is admitted only if:
- **zero unknown components** (all already known), or
- **exactly one unknown component AND that lemma is admitted as a NEW word in this same
  batch** (not merely present in the raw candidate pool or due list — the current
  satisfiability check accepts those, which is the source of the randomness).
- The existing anchor-recalled requirement stays. `I_PLUS_ONE_UNKNOWN_TOLERANCE` stays 1.

**Placement is deterministic.** In the assembled order:
- A one-away phrase is placed **immediately BEFORE its final unknown word's position** in
  the new-units sequence (as a contiguous unit with that word, surviving interleave — same
  mechanism as phoneme-block mini-sets). Session experience: locked teaser ("one word
  away…") → word's intro group runs → requeue re-surfaces the phrase → chime + unlock
  reveal → phrase arc.
  - Placement must be *before the word's learning-step group*, because the chime
    (`phrase/unlock` in `decideKind`) only fires for a phrase previously *seen locked*
    this session (`seenLocked`). A phrase first seen after its word is learned renders as
    plain `phrase/hear` — no chime. The existing `seenLocked`/`revealed`/requeue machinery
    is unchanged.
- A fully-known phrase (zero unknowns) has no locked teaser; it enters the new-units
  sequence in utility order like a word and runs its arc directly.
- **Words come before phrases within the new-units ordering** except for the
  paired (one-away phrase + word) units, which sit at the word's slot.

**Interaction with learning steps:** `expandLearningSteps` groups only *consecutive* new
words, and a locked teaser sitting immediately before its word splits the run. Expansion
must skip over locked-phrase units when forming word groups (treat the phrase teaser as
transparent for grouping purposes) OR simply accept smaller groups; the spec choice is
**transparent**: the teaser is emitted in place, and the word joins the group it would
otherwise have formed. (Test pins this.)

### 3. Review rotation — `renderFor` (src/session/renderFor.ts) + rep counting

For a **due, non-picture word**, modality rotates by total rep parity:

- `totalReps = receptiveReps + productiveReps`
- even → `word/hear` (MC meaning) · odd → `word/say` (speak)

For a **due phrase**: even → `phrase/meaning` (fallback `phrase/hear` if < 2 choices) ·
odd → `phrase/sayit`.

Day-1 arithmetic: the learn card emits no `correct` and is not a production kind, so it
counts nothing; the MC retest adds 1 receptive rep; the completed speak adds 1 productive
rep. A word leaves day 1 with totalReps = 2 (even) → its first due review is MC, its
second is speak, alternating thereafter. The invariant that matters is **speaking every
other review**, which parity delivers regardless of starting value.

**Rep counting fix (`SupabaseSrsService.submit` + the C2 derivation in `getDueBatch`):**
productive reps currently count `review_log` rows with `correct === true` for
`PRODUCTION_CARD_KINDS`. Speak cards do not grade correctness (non-goal), so:

- **productive rep = a `review_log` row for a production card kind** (`word/say`,
  `phrase/sayit`, `pron`), regardless of `correct` (which will be null).
- receptive rep counting is unchanged (`correct === true` on non-production kinds).
- Both the post-submit rung derivation and the `getDueBatch` C2 enrichment use the same
  rule (extract a shared helper; both sites currently duplicate the loop).

**Ladder retirement:** `computeRung`'s `production` rung and
`PRODUCTION_GRADUATION_FLOOR` no longer gate card choice for words/phrases (rotation
replaces them). `computeRung` itself stays (translation-visibility still keys off rungs and
`recall` at `RECEPTIVE_GRADUATION_FLOOR = 3` is unaffected); with productive reps now
countable, the production rung becomes *reachable* rather than load-bearing. Remove the
`hasAudio && rung === 'production'` branches in `renderFor` in favor of rotation.

### 4. Dev controls — Settings tab, `__DEV__` only

New **Developer** section on the Settings screen, rendered only when `__DEV__` is true.

**Clock module** (`src/services/devClock.ts`):
- `now(): Date` = real now + `offsetDays × 86_400_000`.
- `offsetDays` persisted in AsyncStorage (`pp.dev.clockOffsetDays`), loaded at startup,
  `0` in production builds (module returns real time when not `__DEV__`).
- Injected as the `now` function `SupabaseSrsService` already accepts (`this.now()`); wired
  in `ServiceProvider`. Other services keep the real clock (accepted mixed-clock caveat:
  `review_log.created_at` is DB-stamped real time; offset is effectively one-way — going
  backward would leave items due in the future; Reset progress is the escape hatch).

**Controls:**
- **Skip to next day** — increments `offsetDays`; shows the current simulated date and
  offset ("Simulated: Tue 7 Jul (+2 days)"). Tap repeatedly for day N.
- **Reset progress** — confirm dialog, then: delete this user's `review_state` and
  `review_log` rows, clear `offsetDays`, and trigger a session reload. (Recordings and
  profile are untouched.)

**One-off:** wipe `test@` and `newuser@` accounts' `review_state` + `review_log` via
Supabase MCP as part of the build, before on-device verification.

### 5. Pacing

- `DAY_ONE_NEW_CAP`: 20 → **10** (3 cards per new word ⇒ ~30-card first session).
- `STEADY_STATE_NEW_CAP` stays 5. All other pacing constants unchanged.

### 6. `word/say` audio-optional (one card touched)

`word/say` (and the phrase equivalent if needed) must render without an audio envelope:
silent play orb (pattern exists on `word/hear`), record + continue still work, self-compare
degrades gracefully (nothing to compare against). No admission or routing gate on audio for
words/phrases anywhere in the new logic. Pairs (perception drills) keep their audio gate.

### 7. Data reset + drill seeding check

Reset (both the dev button and the one-off wipe) deletes `review_state` + `review_log` for
the user. Derived state (known_lemmas, recalled sets, rolling retention, introducedToday)
all read from those tables, so everything self-resets. **Verify during build:** after a
wipe, `ensureDrillsSeeded` re-seeds minimal pairs — confirm seeded pairs do not flood day 0
ahead of the first words (they surface as due reviews; if they front-run the intro arc,
seed them with a deferred `due_at` or exclude pairs from day-0 due ordering).

## Testing

All changed modules are pure with existing suites — extend, don't replace:

- **learningSteps**: arc ordering `[intros, MCs, speaks]`; phrase single-item arc
  expansion; teaser-transparency for word grouping.
- **renderFor**: `retest:'mc'`/`retest:'speak'` routing; parity rotation for due
  words/phrases; audio-less `word/say` reachable; picture words unaffected.
- **selectBatch**: one-away phrase admitted only when its word is admitted in the same
  batch; placement contiguity (teaser immediately before its word, surviving interleave);
  locked phrase never precedes all words at position 0 unless paired with the first word;
  phrases with 2+ unknowns or un-admitted final words rejected; fully-known phrases
  admitted without teaser.
- **SupabaseSrsService**: productive-rep counting without `correct`; shared helper used by
  both counting sites.
- **sessionController**: teaser → word arc → requeue → chime/unlock → phrase arc sequence;
  double-tap latch still holds across the new card kinds.
- **devClock**: offset persistence, `__DEV__` gating, injection into the SRS service.
- Full suite green (`lint`, `typecheck`, `test`).

On-device verification (`npm run phone`): day-0 fresh session end-to-end, one skip-to-next-
day cycle, one reset-progress cycle.

## Risks / accepted caveats

- **Mixed clocks under time travel** (dev-only, accepted; documented in §4).
- **Parity source correctness** — rotation depends on the rep-counting fix in §3; pinned by
  a dedicated test (this is concern #2 from review, resolved by counting completion).
- **Session length** — day-1 = ~30+ cards with the arc; mitigated by the cap cut (§5),
  re-tunable in one constant.
- **Locked-teaser adjacency vs due interleave** — due reviews may still interleave between
  the teaser and the word group; the requeue machinery tolerates this (the phrase
  re-surfaces after its component regardless). Only adjacency of the *unit* is guaranteed.
