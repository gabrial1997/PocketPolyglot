# Starting Loop + Core-Loop Correctness — Design

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review → implementation plan

## Goal

Build the app's **starting loop**: a new learner's first session teaches the words to
introduce themselves and to ask how someone is doing, with each phrase **locked → learned →
unlocked** in front of them. It is simultaneously (a) onboarding and (b) the live proof that the
core loop — the i+1 phrase-unlock sequence and honest SRS recording — actually works.

## Background (grounded in current code)

- **Unlock never fires live.** `phraseGate.lockState` (pure i+1) and `decideKind` (returns
  `phrase/locked`, and `phrase/unlock` when a previously-`seenLocked` phrase becomes available)
  are correct. But `sessionController` only refreshes the known-word set on batch load
  (`known.refresh()` in `reload`), never mid-session, and each item appears once — so a phrase
  shown locked never re-appears unlocked within a session. (`src/session/sessionController.ts`,
  `src/session/decideKind.ts`, `src/session/phraseGate.ts`.)
- **No new-card ordering.** `SupabaseSrsService.getDueBatch` applies no `ORDER BY`; new items
  surface arbitrarily though `lemmas.freq_rank`/`freq_band` exist.
- **SRS already records misses — needs verification.** `cardResultToRating` maps
  `correct:false → Rating.Again` and `submit` writes both `review_state` and `review_log`. Cards
  carry a sticky first-try `missed` and complete with `correct:!missed`. No automated test pins
  this for `SupabaseSrsService`.
- **Current seed has none of this content** — only "Labs suns.", "Lūdzu.", "Vienu kafiju, lūdzu."

## The starting-loop content

Two loops, six words, two phrases. (Native sign-off by Elizabete is a follow-up, not a blocker.)

| Loop | Phrase (target) | Meaning | Component words |
|------|-----------------|---------|-----------------|
| 1 | `Labdien, es esmu ___.` | Hello, I am ___. | labdien (hello), es (I), esmu (am) |
| 2 | `Kā tev iet?` | How are you? | kā (how), tev (you·dat), iet (go) |

## The session sequence (acceptance target)

```
LOOP 1
  1  phrase/locked   "Labdien, es esmu ___."   masked: "·····, ·· ···· ___" + meaning + "Learn 3 words"
  2  word/*          labdien
  3  word/*          es
  4  word/*          esmu
  5  phrase/unlock   reveal "Labdien, es esmu ___." + chime
  6  phrase/sayit    produce it
LOOP 2  — same shape with Kā tev iet? (kā · tev · iet)
```

## Design

### 1. Unlock mechanism — two focused `sessionController` changes

**A. Optimistic in-session known-set overlay.** Add an in-memory `Set<string>` of lemma ids
learned during this session. When a `word/*` card completes, add its `item.target`'s lemma id to
the overlay. `decideKind` is evaluated against `known.all() ∪ overlay`. This is what makes
"learn a word" change the lock state without a network round-trip.

**B. Re-surface the phrase via a working queue.** The controller holds a mutable working queue
(seeded from `getDueBatch`). Phrase resolution per encounter:

- **locked** (`unknownCount > 1`): render `phrase/locked`; on Continue (`advance`), re-queue the
  phrase immediately **after its last component word** present in the remaining queue; record
  `seenLocked`.
- **available + seenLocked + not yet revealed**: render `phrase/unlock` (reveal + chime); on the
  gate advance, re-queue the phrase **next** (production); mark revealed.
- **available + revealed** (or never locked): render `phrase/sayit` (SRS production).

So a gated phrase is encountered up to three times — locked → unlock → say-it — each reusing the
existing single-purpose card. "Loops twice" = the two phrases, each running this shape.

*Chosen over* a hardcoded onboarding script or per-card server re-fetch of the known-set, because
it uses the **real generic loop** (so walking it genuinely validates the core loop) and works for
all future content, not just onboarding. Trade-off: the controller gains a small amount of queue
state; mitigated by keeping the queue logic pure and unit-testable (it already has
`sessionController.test.tsx`).

### 2. Sequencing (scoped)

Add a deterministic `ORDER BY` to `getDueBatch` so new items surface in curriculum order. Lemmas
carry `freq_rank`; the starting-loop items are seeded at the front of that order so loop 1 then
loop 2 are contiguous. (Full frequency + unique-sound front-loading is its own later spec — here
we only add the ORDER BY and seed these eight items first.) No special "onboarding mode" flag:
the starting loop is simply the front of the curriculum; once learned it schedules normally and
the free-practice fallback covers an emptied deck.

### 3. Content seeding

A seed step inserts the 2 phrases + 6 lemmas with glosses, `pron`, OpenAI-TTS `native_url`
(+ slow) and amplitude `envelope`, wires `phrase_components` (so the i+1 gate sees them, marking
the in-phrase new word `is_new`), and creates `review_state` rows as `new` for the target test
user(s). Ordered so the batch is `[P1, labdien, es, esmu, P2, kā, tev, iet]` before the working
queue re-surfaces the phrases. Reuses the existing TTS + envelope pipeline
(`content-pipeline/seed-golden-slice.mjs`).

### 4. SRS records misses (verification + lock-in)

Verify end-to-end and add the missing automated coverage:
- `cardResultToRating`: `correct:false` and `selfRating:'again'` → `Rating.Again`; a first-try
  miss later corrected still completes with `correct:false` (sticky `missed`).
- `submit` persists the lapse to **both** `review_state` (lapse count up, stability down, due
  pulled in) and `review_log` (`correct:false` row).
- Audit every graded kind — drill, diphthong, word/hear, word/say, word/pic-review,
  phrase/sayit(`again`) — confirming each carries the miss into `onComplete`. Fix any that drop it.
- Add a `SupabaseSrsService`/mapper unit test pinning the Again path (lapse → both tables).

### 5. Locked teaser presentation

`phrase/locked` shows: the **English meaning** ("Hello, I am ___."), a **masked shape** of the
Latvian (`·····, ·· ···· ___`), and a "Learn N words to unlock it" line. The Latvian itself is the
reward, revealed only at unlock. Matches the existing PhraseLocked mockup.

## Acceptance (walk on device)

1. New deck → first card is `phrase/locked` for "Labdien, es esmu ___." (masked + meaning).
2. Learn labdien, es, esmu → the phrase re-appears as `phrase/unlock` (reveal + chime) → then
   `phrase/sayit`.
3. Same for "Kā tev iet?" (kā, tev, iet).
4. Exit-to-home (already shipped) works from any card.
5. A deliberately-missed graded card records a lapse: a `review_log` row with `correct:false`
   and the `review_state` lapse/stability updated. (Verified by query.)

## Out of scope (separate specs)

- Live amplitude waveform reacting to playback (#22).
- Image cards / image-asset seeding (#25).
- Full frequency + unique-sound curriculum ordering beyond the starting loop (#26).

## Open items

- Native sign-off (Elizabete) on the two phrases + six glosses/pron.
- Word-card *kind* for each function word on first exposure (learn-function vs hear) — settle in
  the plan against the existing `renderFor` rules; default to first-exposure `word/learn-*`.
