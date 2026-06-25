# Learning Steps — interleave new-word introduction with in-session quizzing

**Date:** 2026-06-25
**Status:** Approved (brainstorming) — pending spec review
**Branch:** continues on `feat/bug-report` (depends on the Bug C `get_distractors` fix, which builds the MC `choices`).

## Problem

A brand-new "day one" learner sees **20 word *introduction* cards back-to-back with zero quizzes**. Root cause (verified in `src/session/`):
1. No review history → the batch is 20 new words; with no due reviews to interleave with, they present consecutively (`selectBatch.ts` `interleave([], new)` returns all new in order).
2. `renderFor` routes any `stage==='new'` word to a `word/learn-*` introduction card; it only becomes a quiz on a *future* day once FSRS marks it due.
3. **No in-session re-test mechanism exists for words** (only phrases get re-queued in `sessionController`).

Compounding constraint (verified in the DB): the existing recognition quiz (`word/hear`) **requires an audio envelope**, but only **155 of the 1000** ranked words have audio (5 of the first 20). So even with interleaving, ~75% of early words have no quiz surface and fall back to the intro.

## Decisions (locked with the user)

- **Rhythm:** introduce **3** new words → immediately quiz those **3** (recognition MC) → next 3. (`LEARNING_STEP_GROUP_SIZE = 3`.)
- **Day-one cap:** unchanged at **20** (so ~7 intro→quiz cycles).
- **Audio-less words are quizzable:** the recognition card shows the **written word** + a **play button** (silent when there's no audio — the user's "hit play, no sound = needs audio later" signal) + the 4 meaning choices. It is a **quiz** (pick the meaning), not a reveal.

## Design

### A. Recognition card works without audio — `src/screens/WordHear.tsx`

`word/hear` becomes the universal recognition MC, audio-optional:
- **Show the written target word** (`item.target`) prominently (today it shows only the audio orb + choices). This is what makes it answerable without audio.
- **Play button stays**, but degrades gracefully when `item.audio` / native url is absent: the orb renders and is tappable, plays nothing (no crash), and the live waveform renders flat/empty rather than erroring. No "audio required" guard may throw.
- Choices (meanings), wrong-answer-no-advance ("Try again", chosen option reddens, correct never revealed), and correct→advance all stay exactly as today.
- `translationVisibility` behavior is unchanged.

### B. Routing — `src/session/renderFor.ts`

- **Intro only on genuine first exposure:** route to `word/learn-*` only when `stage==='new' && type==='word' && !item.retest`.
- **Recognition is audio-optional:** for word reviews / retests, drop the "audio-less → re-show learn" fallback. New routing for `type==='word'` (non-intro):
  - has image → `word/pic-review`
  - else `hasAudio && computeRung(...)==='production'` → `word/say` (production still needs native audio to compare)
  - else → `word/hear` (recognition — now works with or without audio)
- A `retest` word (even with `stage==='new'`) therefore routes to `word/hear` (or `word/pic-review` if it has an image).

### C. In-session interleaving — pure transform `src/session/learningSteps.ts`

`expandLearningSteps(batch: ReviewItem[], groupSize: number): ReviewItem[]` — pure, no clock/services:
- Walk `batch` in order. For maximal runs of **new words** (`stage==='new' && type==='word'`), chunk into groups of `groupSize`; after each group emit the group's intros followed by a **retest copy** of each word in that group (`{...item, retest: true}`). The remainder group (< groupSize) is handled the same way.
- **Non-new items and non-word items pass through unchanged** (due reviews and phrases are already their own tests; phrases keep their locked/unlock flow).
- Stable & deterministic (no randomness); empty batch → empty.

Result for 20 new words: `[L1 L2 L3 Q1 Q2 Q3  L4 L5 L6 Q4 Q5 Q6  … L19 L20 Q19 Q20]` (Lx = learn, Qx = retest quiz).

### D. Type + constant + controller wiring

- `src/types/reviewItem.ts`: add `retest?: boolean` (additive, optional; defaults undefined/false).
- `src/session/pacing.ts`: add `export const LEARNING_STEP_GROUP_SIZE = 3 as const;`
- `src/session/sessionController.ts`: apply `expandLearningSteps(batch, LEARNING_STEP_GROUP_SIZE)` to the `getDueBatch()` result before presenting; the controller walks the expanded list. `total`/`step` reflect the expanded length. No DB change; the retest copy is in-memory only.

### Submission semantics
Both the intro (`word/learn-*`) and the retest (`word/hear`) flow through the normal `submit` path. A word may therefore get two `review_log` rows in its first session (an exposure + a recognition) — acceptable and intended (FSRS handles repeated reviews). GlideViewport keys on `id:kind`, so the intro and the quiz copy are distinct mounts (no remount collision).

## Out of scope (YAGNI)
- Generating audio/TTS for the unvoiced words (separate content effort; tracked as follow-up — silent play button is the placeholder).
- Interleaving phrases (the complaint is about words; phrases keep their existing flow).
- Anki-style expanding gaps / spaced learning steps within a session (fixed group-of-3 is the chosen rhythm).
- Changing `DAY_ONE_NEW_CAP` or other pacing constants.

## Testing
- `learningSteps.test.ts` (pure): grouping into 3s incl. remainder; retest copies carry `retest:true` and preserve item id/fields; non-new + phrase items pass through untouched; empty batch; a mixed batch (some due reviews + new words) interleaves only the new words.
- `renderFor.test.ts`: retest word → `word/hear`; retest word with image → `word/pic-review`; audio-less word review → `word/hear` (not learn); audio word at production rung → `word/say`; genuine new word (no retest) → `word/learn-*`.
- `WordHear.test.tsx`: renders the written word; renders with **no** `item.audio` without crashing; choices + wrong-answer-no-advance still work.
- `sessionController` test: the presented sequence is the expanded (interleaved) batch.
