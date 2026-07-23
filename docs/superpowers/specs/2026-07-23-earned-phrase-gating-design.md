# Earned-phrase gating (rounds) + mockup teaser card — design

**Date:** 2026-07-23 · **Origin:** bug report `e9e78a2a` ("Man ir labi." teaser felt unearned —
"I haven't learned Man or ir") + founder mockup `Screenshot 2026-07-22 184701.png` (root repo).
**Approved by founder in brainstorming session 2026-07-22/23.**

## Problem

1. The phrase teaser (`phrase/locked`) counts a component word as known the moment its
   teach→MC→say arc completes once — speed-tapping three cards in ~6 seconds "knows" a word.
   Function words then surface inflected (*Man* ← es, *ir* ← būt), forms the learner was never
   shown, so the gate fires "correctly" while feeling wrong.
2. The teaser card doesn't match the approved mockup (per-word status chips, count copy, lock
   pill, filled CTA).

## Decisions (locked with founder)

- **Learned = earned**: a word counts for phrase gating only after a correct recognition
  answer in a **different round** than the one that introduced it (or any later calendar day).
- **Rounds, not days**: a round = one session. A keen user may progress up to **3 days'
  worth in one day** — at most `NEW_ROUND_DAY_CAP = 3` rounds per calendar day may introduce
  new words. Round 4+ the same day: reviews/probes only.
- **No minimum gap between rounds** (`ROUND_MIN_GAP_MS = 0`, kept as a tunable constant).
  Accepted limitation: app-restart farming can compress the arc; the 3-round cap bounds it.
- **Unlock is never same-round**: teaser round N (2 of 3 earned + the missing word taught) →
  the missing word is earned by a recall probe in round N+1 → unlock chime + arc in the round
  where all components are earned. Day-1 users see no teasers and no unlocks — by design.
- **Chips show surface forms** with a `form of es` sub-label when surface ≠ lemma (goes beyond
  the mockup; prevents the exact Man/ir confusion). CTA is the filled primary button labeled
  **"Continue"** (mockup says "Begin listening", but the next card is a word teach — deviation
  approved).
- `known_lemmas` (DB view) and Progress coverage semantics are **untouched** — coverage keeps
  meaning "words you've met"; phrase pacing runs on "words you've proven".

## 1. The earned set

`earnedLemmaIds` (client-side, computed in `SupabaseSrsService` next to `recalledLemmaIds`):

A lemma is **earned** iff `review_log` contains a row R with `item_type='lemma'`,
`correct=true`, `card_kind IN ('word/hear','word/recall')`, and its intro row I
(`card_kind LIKE 'word/learn%'`, earliest) satisfies:

- `R.session_id IS DISTINCT FROM I.session_id`, **or**
- `date(R.created_at) > date(I.created_at)`  ← grandfathers all pre-stamping history and
  keeps dev time-travel working.

No intro row at all (legacy data) → any correct row earns (fallback to old behavior).
Earned is **monotonic** — once earned, never un-earned; nothing ever re-locks.

`word/say` self-ratings do NOT earn (self-marked, not retrieval-verified).

## 2. Session stamping (migration 0021)

- `alter table review_log add column session_id uuid;` — nullable, no backfill, additive
  (safe alongside parallel builds). Index `(user_id, created_at)` if not already present.
- The app generates one session UUID per `getDueBatch()` call (expo-crypto UUID — Hermes has
  no `crypto.randomUUID`, see 2026-06-25 bug) and stamps every `review_log` insert that
  session, including probes.

## 3. Serving rules (selectBatch Pass 2 + decideKind)

All phrase gating consults the **earned set** (replacing `knownLemmaIds` for components and
`recalledLemmaIds` for the anchor — earned is the single bar):

- **Teaser** admitted iff: anchor earned, **all components except exactly one** earned, and
  that one word is admitted in Pass 1 this session. Unit shape unchanged:
  `[teaser…, word, pairs…]`.
- **Unlock** (fully-earned path) admitted iff all components earned → `phrase/unlock` chime +
  hear/MC/speak arc, exactly the existing machinery.
- `decideKind` receives the earned set — **not** `knownUnion`. The session-learned union
  (`learned.current`) no longer feeds phrase gating; delete the union for this purpose.
  The controller's set source (`SupabaseKnownWordsStore`) switches to the earned
  computation — one shared pure helper (`computeEarned(rows)` over review_log rows) used by
  both the store and the selectBatch ctx, so the two gates can never diverge.
- **No re-locking, structurally**: the lock/unlock gate applies only to phrases with
  `stage === 'new'`. A phrase already in review (unlocked under the old, weaker rule)
  always renders its review kind — the stricter bar must not yank shipped phrases back
  behind a teaser.
- **Same-session unlock path deleted**: on locked-advance the controller no longer calls
  `requeuePhraseAfterComponents` (teaser shows once per session, then leaves the queue);
  the `phrase/unlock`-after-learning `requeueArcNext` trigger for that flow goes with it
  (`requeueArcNext` itself stays — the unlock-round arc still uses it).
- `PHRASE_INTRO_CAP = 2` unchanged.

## 4. Recall probes

- When `getDueBatch` runs in a round that isn't the day's first, prepend **probe items**:
  words introduced **today in an earlier session** (different `session_id`, same calendar
  day) that are not yet earned.
- A probe renders as the existing `word/hear` MC card (same distractor path), marked
  in-memory `probe: true` on the ReviewItem (never persisted, like `retest`).
- On submit: log to `review_log` with `card_kind='word/recall'`, `correct`, `session_id` —
  **no FSRS grade** (a same-day extra Good inflates intervals — 2026-07-22 pacing artifact).
  Wrong answer: no penalty, simply not earned; re-probed next round.
- Words from previous days need no probes — their normal FSRS due reviews earn them.

## 5. Round cap

Count distinct `session_id` values among **today's intro rows** (`card_kind LIKE
'word/learn%'`, `created_at` today). If ≥ `NEW_ROUND_DAY_CAP` (3), `newAllowance = 0`
(reviews/probes still run). Each qualifying round gets the normal per-day `newCap`.

## 6. Teaser card rebuild (`PhraseLocked.tsx`, mockup match)

Top-to-bottom:

1. **Chip row** — one chip per word, phrase order. Earned: outlined, surface form +
   `✓ known`, plus sub-label `form of <lemma>` when `surface.toLowerCase() !== lemma`
   (case-insensitive). Missing word: grey filled, surface form + `🔒 new`.
2. **Count copy** — "You already know two of these words. Learn one more and the phrase
   opens." Number words one–nine, pluralized; 0 known → "Learn these words and the phrase
   opens."
3. **Phrase line** — serif, as mocked (`PhraseLine`, not dimmed).
4. **Lock pill** — rounded outline: `🔒 1 word to go — learn <lemma>` (lemma in the pill,
   surface on the chip). Falls back to "Unlocks when you know its words."
5. **CTA** — filled `CtaButton`, "Continue", still `onAdvance()` (gate card: no CardResult).

Data plumbing: `buildComponentBreakdown` gains `lemmaId` per entry; the controller decorates
the locked item with per-chip `known` flags from the earned set (same place `lockHint` runs,
`sessionController.ts:162`). Missing breakdown → degrade to today's layout. Card stays pure
data-in/events-out (CLAUDE.md boundary).

## 7. Out of scope

Session chrome ("TODAY · 1 PHRASE" header, no ✕/counter), visual sync of other phrase cards,
any Progress/coverage change, the mockup's "Begin listening" label.

## 8. Testing

- Earned-set: same-session correct ≠ earned; different-session same-day = earned; later-day
  legacy (null session_id) = earned; say-card correct ≠ earned; no-intro legacy fallback.
- selectBatch: teaser only at exactly-one-unearned + word admitted; unlock only fully earned;
  anchor bar; probe prepend; 3-round cap zeroes newAllowance; day-1 → no teasers/unlocks.
- Controller: locked-advance does not re-queue; probes submit without FSRS grade; probe wrong
  → re-probed next round (pure fn level).
- Card: chips render earned/new + `form of` sub-label only when surface ≠ lemma; copy
  variants (0/1/2 known, 1/2 remaining); degrade without breakdown; snapshot light/dark.
- Full suite + lint/typecheck/build green.

## Prerequisite / base branch

Branches `fix/bug-list-2026-07-22` and `feat/fsrs-pacing-phrase-tier` are unmerged and touch
`SupabaseSrsService` (teach-card no-grade pattern, tier-ordered candidates) — **merge them
first**, then base this work on `main`. Migrations 0019/0020 are already applied live; this
work's migration is **0021**.
