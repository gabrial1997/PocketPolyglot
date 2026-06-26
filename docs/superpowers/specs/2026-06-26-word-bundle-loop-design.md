# Word-Bundle Loop — Design Spec

- **Date:** 2026-06-26
- **Status:** Approved for planning (brainstorm converged)
- **Scope:** The core SRS session loop for **words**. Phrases and minimal-pair drills are out of scope (follow-up).

## 1. Motivation

Beta bug reports (2026-06-25/26) converge on one root cause: **the loop's unit is the
individual card, not the word.** Symptoms:

- "This quiz was introduced before the word was" — recognition quizzes appear with no prior
  meaning exposure.
- "There have not been any cards prompting me to speak" — the speak card (`word/say`) is gated
  behind `productiveReps ≥ 6` (many days out) and required audio that didn't exist until the
  ElevenLabs corpus landed (2026-06-26).
- "Introduce 15 and quiz 2 — the frequency is off" / "a ton of single-word cards" — new
  introductions and quizzes are counted and paced as independent cards.
- Picturable words run a *different* all-in-one card (`word/pic-review`) than non-picturable
  words, so the experience is inconsistent.

**Goal:** make the **word** the unit of the loop. Introducing a word means giving it a guided
first exposure (*onboarding*) and then letting its *retrieval quizzes* live in spaced repetition.
Daily pacing counts **words**, not cards.

## 2. Core model

Every word splits into **two buckets of cards** with different jobs:

### 🎓 Onboarding — exposure (shown once, in order, the day the word is introduced; NOT in FSRS)

A fixed 3-card guided first encounter. Not graded, no spaced repetition — this is "meet the word."

1. **Meaning** — the written word + English gloss (+ **image** for picturable words).
2. **Hear** — play the native clip + show the written word. Pure exposure (no multiple-choice).
3. **Say** — record + compare to the native clip. A try, not scored.

Onboarding runs as the word enters the session. Its three cards appear in order but may be
**spaced** among other items (not necessarily back-to-back).

### 🔁 Quiz cards — retrieval (recurring, **each on its own FSRS schedule** — "model B")

The tests. These are what spaced repetition schedules over time.

- **Recognition** — hear/see the word → pick the meaning (multiple choice). For picturable words
  this reuses the picture + 2×2 word-grid prompt.
- **Pronunciation** — prompted by the meaning → say it, compared to native (the same voice-compare
  card from onboarding, now recurring to keep testing speech).

Recognition and Pronunciation are **independently scheduled** — a learner is typically ready to
review recognizing a word before producing it.

### Counting

The daily **new-word budget counts words (notes), not cards.** Introducing one word ≈ 5 cards over
its life (3 onboarding + 2 recurring quiz templates), but it costs **1** against the cap.

## 3. Card inventory & reuse

| Bucket | Card | Source today | Change |
|---|---|---|---|
| Onboarding | Meaning | `word/learn-concrete` / `-abstract` / `-function` | Show image when present; always step 1 |
| Onboarding | Hear | (new lightweight exposure variant) | Listen + reveal; **no MC** |
| Onboarding | Say | `word/say` | Used as exposure (not scored) the first time |
| Quiz (FSRS) | Recognition | `word/hear` (MC) / `word/pic-review` choose-stage | Standalone MC quiz; picture+grid for picturable |
| Quiz (FSRS) | Pronunciation | `word/say` | Recurring, scored/compared |

**Picturable words:** the all-in-one `word/pic-review` routing is **retired**. Picturable words
flow through the identical onboarding + quiz structure; the image becomes *content* on the Meaning
(and Hear) cards, and the recognition quiz reuses pic-review's picture + 2×2 grid visual as its
prompt. No image work is lost — only the combined card-flow routing changes. (The `WordPicReview`
component's visual pieces are salvaged into the Meaning and Recognition cards.)

## 4. Scheduling & pacing

- **Onboarding fires on introduction.** When a word is admitted as "new," its 3 onboarding cards
  enter the session queue in order (spaced via the existing interleave).
- **First quiz the same session.** After onboarding, the word's Recognition (and Pronunciation)
  quiz cards are created in FSRS with a short **learning step** so the first retrieval happens
  later in the *same* session, then spaces out — rather than nothing until tomorrow.
- **Reviews interleave** between new words as today (`selectBatch` interleave), uncapped.
- **New-word cap counts words.** `DAY_ONE_NEW_CAP` = 20 words (one-time bolus); steady-state
  `STEADY_STATE_NEW_CAP` ≈ 3–5 words/day. Both are tunable constants in `pacing.ts`; we feel out
  the steady number by hand. The existing due-flood and retention gates still apply (now in word
  units).
- **Day-boundary carryover.** If a session ends before a word's onboarding completes, the
  remaining onboarding cards resume next session (the word is not re-counted against the cap).

## 5. Data-model changes

Today `review_state` has **one row per content item** and `renderFor` derives the card kind from
that row's rep counts (`ladder.ts`). Model B requires a **per-template** schedule.

- **Quiz schedules are per `(word, template)`.** Add a `template` dimension to `review_state`
  (e.g. `'recognition' | 'pronunciation'`), so each quiz card has its own FSRS state. Introducing a
  word creates its quiz rows once onboarding completes.
- **Onboarding is tracked separately** from FSRS — a per-word onboarding marker (e.g. an
  `onboarded_at` timestamp / `onboard_step` on the word's row, or a small `word_onboarding` table).
  Onboarding is not spaced and not graded; the marker just prevents re-onboarding and gates quiz
  creation.
- **"Known word" redefinition.** `known_lemmas` (drives the phrase i+1 gate) is currently a view
  over `review_state.stage`. Redefine it against the **Recognition** template reaching
  review/mature stage (you "know" a word when you reliably recognize it). Pronunciation maturity
  does not gate phrase unlocks.
- **New-word counting** (`introducedToday`, the cap) counts **distinct words whose onboarding
  started today**, not `review_state` rows.
- **Migration:** existing single-row `review_state` per word maps to the Recognition template;
  Pronunciation rows are created lazily on next encounter. No content/audio re-seed needed.

(Exact DDL and the `SupabaseSrsService` / mapper changes are for the implementation plan.)

## 6. Logic changes (where the work lands)

- `renderFor.ts` / `ladder.ts`: onboarding becomes a **deterministic ordered sequence** on
  introduction (not rep-derived); quiz kind is chosen per **template**, not by a single rep ladder.
  The `productiveReps ≥ 6` gate on speaking is removed (speak is in onboarding + its own template).
- `selectBatch.ts` / `pacing.ts`: count **words** for the cap; emit onboarding bundles; treat
  per-template quiz rows as due items.
- `learningSteps.ts`: generalize from "(intro, retest)" to "emit onboarding sequence + seed the
  same-session first quiz."
- `SupabaseSrsService.ts` + `mappers.ts`: read/write per-template `review_state`; expose the
  onboarding marker.

## 7. What we keep

- FSRS itself (just applied per template).
- All existing card *components* and visuals (recomposed, not rewritten).
- The ElevenLabs audio + envelopes just seeded (every word now has a native clip for Hear/Say).
- The pacing-constant discipline (`pacing.ts`) — only the *units* and a couple of values change.
- The "wrong answers don't advance," "progress = coverage," and non-gamified constraints.

## 8. Non-goals (this spec)

- **Phrases** — they get the same onboarding/quiz split in a follow-up spec.
- **Minimal-pair / diphthong drills** — unchanged; still attach to lemmas via the existing path.
- **Pronunciation *scoring* quality** (GOP / ML) — the Pronunciation quiz uses the existing
  record-and-compare; real scoring is the separate Phase-1 ML track.
- **Final tuning of the steady-state word count** — a constant we adjust by feel post-build.

## 9. Bug-report traceability

| Report | Addressed by |
|---|---|
| Quiz introduced before the word | Quiz cards can't exist until onboarding completes (§2) |
| No cards prompting speech | Say is in onboarding for every word + a recurring Pronunciation quiz (§2) |
| Introduce 15 / quiz 2; frequency off | Count words not cards; same-session first quiz (§2, §4) |
| Too many function words front-loaded | New-word *selection* mix — tracked separately; cap now in words |
| Picture words behave differently | Unified onboarding + quiz structure; `pic-review` routing retired (§3) |
| "Lūdzu treated like a phrase" | Separate content/data bug — tracked separately |

## 10. Open tunables (decide by feel, not blocking)

- Steady-state words/day (start 3–5).
- Same-session first-quiz learning-step delay.
- Whether the Hear exposure also ever recurs (default: no — recognition covers hearing).

## 11. Testing

- Pure units: word-counting cap, onboarding-sequence emission, per-template due selection,
  `known_lemmas` redefinition, day-boundary carryover.
- `renderFor`/scheduler snapshot tests updated for the onboarding sequence + per-template quizzes.
- Migration test: existing single-row words map to Recognition; Pronunciation created lazily.
- Keep CI green (`lint`, `typecheck`, `test`, `build`).
