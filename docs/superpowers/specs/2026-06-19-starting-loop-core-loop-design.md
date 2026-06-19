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
  1  phrase/locked   "UPCOMING PHRASE" — phrase shown DIMMED "Labdien, es esmu ___."
                     + "N words to go — learn <lemma>" (counts down as words are learned)
  2  word/*          labdien
  3  word/*          es
  4  word/*          esmu
  5  phrase/unlock   its OWN card: "PHRASE UNLOCKED · you know all its words now" + the Latvian
                     phrase + its ENGLISH meaning ("Hello, I am ___.") + chime
  6  phrase/hear     audio card: SAYS the phrase, then REPEATS it; play + waveform + "Show meaning"
                     + Continue ("first review tomorrow")   [waveform stays the existing one; the
                      live amplitude-reactive version is the separate #22 spec]
LOOP 2  — same shape with Kā tev iet? (kā · tev · iet)

(say-it is NOT in the first session — the phrase is HEARD first and matures into say-it
 over later reviews, per the card's "hear first · say it as it matures" rule.)
```

Source of truth for these stages: the founder's phrase-card mockup (`03 · Phrase card`,
Screenshot 2026-06-19).

## Design

### 1. Unlock mechanism — two focused `sessionController` changes

**A. Optimistic in-session known-set overlay.** Add an in-memory `Set<string>` of lemma ids
learned during this session. When a `word/*` card completes, add its `item.target`'s lemma id to
the overlay. `decideKind` is evaluated against `known.all() ∪ overlay`. This is what makes
"learn a word" change the lock state without a network round-trip.

**B. Re-surface the phrase via a working queue.** The controller holds a mutable working queue
(seeded from `getDueBatch`). Phrase resolution per encounter:

- **locked** (any component word still unknown — `unknownCount > 0`; see gate note below): render
  `phrase/locked` (dimmed phrase + "N words to go"); on Continue (`advance`), re-queue the phrase
  immediately **after its last component word** present in the remaining queue; record `seenLocked`.
- **all words known + seenLocked + not yet revealed**: render `phrase/unlock` (its own card —
  shows the Latvian phrase **and its English meaning**, "you know all its words now", + the chime);
  on the gate advance, re-queue the phrase **next**; mark revealed.
- **all words known + revealed** (or never locked): render `phrase/hear` (first SRS exposure — an
  audio card that **says the phrase, then repeats it** + Continue). Say-it is NOT forced here; it
  surfaces in later sessions as the phrase matures, via the normal `renderFor` maturity rule.

So a gated phrase is encountered up to three times on first introduction — locked → unlock → hear —
each reusing the existing single-purpose card; say-it comes later. "Loops twice" = the two phrases,
each running this shape.

**This is the GENERAL phrase flow, not onboarding-only.** Every phrase is introduced this way:
locked goal → learn its words → unlock reveal (+ chime, EN meaning) → hear (say + repeat). After
that first hear, the phrase is just a normal FSRS item — it schedules, matures, and surfaces as
hear/say-it on its own cadence with no special casing. The starting loop is simply the first two
phrases to flow through this universal path; nothing about the mechanism is specific to onboarding.

**Gate note (reconciliation).** The mockup subtitle is "Unlocks when its words are known" and the
unlock card reads "you know all its words now" — i.e. unlock requires **0 unknown** component
words. The current `phraseGate.lockState` uses `unknownCount > 1` (the i+1 "one new word allowed"
rule), which would surface the phrase while one word is still new. For the starting loop we adopt
the mockup's **all-words-known** gate. The plan resolves this by making the unlock threshold strict
(`unknownCount > 0` ⇒ still locked); whether to keep i+1 as a separate "within reach" signal for
showing the upcoming teaser is noted as an open item, not built here.

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
(`content-pipeline/seed-golden-slice.mjs`). The seeder also uploads the unlock chime to
`content-audio/sfx/unlock-chime.wav`; the plan verifies the vendored
`content-pipeline/assets/unlock-chime.wav` is byte-identical (sha256) to the Claude Design
project's `assets/unlock-chime.wav` and pulls the design copy if they differ. (Current vendored
chime: real 44.1 kHz mono WAV, sha256 `1f7f126b…`.)

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

Per the founder's mockup (supersedes the earlier "masked dots" sketch): `phrase/locked` shows the
real Latvian phrase **dimmed/greyed** ("Labdien, es esmu ___." in faint ink) with a **"N words to
go — learn <lemma>"** line and an "it appears here as '<inflected form>'" hint. As each component
word is learned the count decrements; the phrase is never masked into dots — it's simply dim until
unlock. `PhraseLine` already supports this via its `dim` prop (+ `highlight` for the inflected
form).

## Acceptance (walk on device)

1. New deck → first card is `phrase/locked` for "Labdien, es esmu ___." (dimmed phrase + "3 words
   to go").
2. Learn labdien, es, esmu (the locked count decrements if revisited) → the phrase re-appears as
   `phrase/unlock` (reveal + chime, its own card) → then `phrase/hear` (first listening, Continue →
   "first review tomorrow"). Say-it does NOT appear in this first session.
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
