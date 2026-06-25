# Phrase unlock: correctness gate + audio-less phrases

**Date:** 2026-06-25
**Status:** Approved (brainstorming) — pending spec review
**Branch:** new branch off `main` (`e5bc89d`).

## Problem

Founder's intent: a phrase unlocks (chime + enters the loop) when the learner has gotten its
component words *right* — tracked in the background. Two gaps found in the current pipeline:

1. **Same-session unlock counts mere exposure, not correctness.** `sessionController.submit` adds a
   word to the in-session known overlay (`learned.current`) on ANY word completion — even a wrong
   answer (no `result.correct` check). So a phrase can unlock from tapping through component words
   without getting them right. (Cross-session is already correctness-gated via the `known_lemmas`
   view = stage `review|mature`.)
2. **Audio-less phrases never enter the loop.** `selectBatch` admits a phrase only if it has an
   audio envelope; only **5 of 276** phrases have audio. So 271 phrases can never lock/unlock/chime —
   the feature is effectively dormant.

## Decisions (locked with founder)

- **#1 Correctness gate:** a word counts toward unlocking a phrase only when answered correctly.
- **#2 Pass audio-less phrases** through the loop now (audio comes later), using the "written form +
  silent play" approach (as done for words).
- Audio-less phrases route to **`phrase/hear`** (exposure card), NOT `phrase/meaning`.
- **Known caveat, accepted:** `phrase/meaning` (idiom comprehension MC) renders from `item.choices`,
  but phrases never get distractor `choices` built — so `phrase/meaning` is non-functional for all
  phrases today. Restoring it needs a phrase-distractor mechanism = **separate follow-up, out of
  scope here.** This change deliberately routes audio-less phrases to `phrase/hear` to avoid it.

## Design

### #1 Correctness gate — `src/session/sessionController.ts`

In `submit`, gate the overlay add on a correct answer:
```ts
// before:  if (item && item.type === 'word') learned.current.add(item.id);
// after:
if (item && item.type === 'word' && result.correct === true) learned.current.add(item.id);
```
Rationale (verified): intro/learn cards emit `{ spoke:false }` with NO `correct` field → never count
(exposure ≠ learned); recall cards (`word/hear`, `word/say`, `word/pic-review`) emit
`correct: !missed` and (for `word/hear`/`pic-review`) only complete on a correct pick — so a word
counts exactly when quizzed right. Phrases are unaffected (the overlay only ever adds `type==='word'`).

### #2 Audio-less phrases

**`src/session/selectBatch.ts`** — remove the phrase audio gate (the block
`if (candidate.kind === 'phrase' && !candidate.hasAudioEnvelope) continue;`). Keep the i+1 gate and
the anchor-recalled gate. (The pairs audio gate elsewhere is unchanged — drills genuinely need audio.)

**`src/session/renderFor.ts`** — in the phrase block, route audio-less phrases to the exposure card
instead of the (choice-less, broken) meaning card:
```ts
// before:  if (!hasAudio) return 'phrase/meaning';
// after:
if (!hasAudio) return 'phrase/hear';
```
So an audio-less phrase is always `phrase/hear` (it can't reach `phrase/sayit` production, which
needs audio to compare — correct). Audio-bearing phrases are unchanged.

**`src/screens/PhraseHear.tsx`** — confirm it renders and its mount auto-play is a clean no-op when
`item.audio` is absent. It already shows the written phrase (`PhraseLine`) and optional-chains
`item.audio?.envelope`; the mount effect calls `playClip()` → `onPlay('native')`. Guard so that with
no native clip nothing throws (the play orb is present but silent). No `choices` needed (exposure card).

### End-to-end (audio-less phrase)
in batch (anchor recalled, ≤1 unknown component) → `phrase/locked` → learn the component **correctly**
→ requeue → `phrase/unlock` (chime) → `phrase/hear` (written phrase, silent orb, Continue) → recurring
`phrase/hear` reviews.

## Out of scope (YAGNI)
- Phrase distractor `choices` / restoring `phrase/meaning` (separate follow-up).
- Generating phrase TTS audio (content effort; silent play is the placeholder).
- Changing the i+1 tolerance, anchor-recall rule, or `known_lemmas` stage definition.

## Testing
- **sessionController:** a word submitted with `correct:false` does NOT enter the known overlay (a
  phrase depending on it stays locked); with `correct:true` it does (phrase can unlock). Adapt to the
  existing hook test harness.
- **selectBatch:** an audio-less phrase candidate (anchor recalled, components known) is now admitted
  (was skipped). Update any existing test asserting audio-less phrases are excluded.
- **renderFor:** audio-less phrase → `phrase/hear` (update the existing audio-less-phrase →
  `phrase/meaning` expectation); audio phrase routing unchanged.
- **PhraseHear:** renders with `item.audio` undefined without crashing; the play orb press / mount
  auto-play does not throw.
