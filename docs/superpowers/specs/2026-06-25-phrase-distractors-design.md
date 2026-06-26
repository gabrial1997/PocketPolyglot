# Phrase recognition quiz — distractors for all phrases

**Date:** 2026-06-25
**Status:** Approved (brainstorming) — pending spec review
**Branch:** `feat/phrase-distractors` (off `main` @ `ca91a58`).

## Problem

`phrase/meaning` (a "pick the English meaning" MC) renders from `item.choices`, but phrases never get
distractor `choices` built — so the card is dead for all phrases. It's also routed only to idioms,
of which there are just **3 of 276**. So phrases today are only ever *shown* (`phrase/hear` exposure)
or *produced* (`phrase/sayit`), never quizzed on meaning.

## Decision (locked with founder)

Give **all** phrases a meaning-recognition quiz: build phrase distractors and route the recognition
step of every phrase to `phrase/meaning`. Distractors should be **more confusable** (prefer phrases
sharing a component word), not purely random.

## Design

### 1. Distractor source — `get_phrase_distractors(target uuid, n int default 3)` (SQL)

Mirrors `get_distractors` (lemmas) but for phrases. Returns `n` *other* phrases; the quiz uses their
`gloss_en` as the wrong meaning options. Ranking ("closest available", most-confusable first):
1. Prefer phrases that **share ≥1 component lemma** with the target (via `phrase_components`) — more
   contextually confusable — ordered by shared-component count desc.
2. Fill remaining slots with other phrases (random).
Exclude the target; require a non-empty `gloss_en`; avoid duplicate glosses; `limit n`. Applied live
to project `necfghfotwykjsykccsa` as a migration, verified via MCP.

### 2. Build phrase `choices` in `getDueBatch` — `src/services/supabase/SupabaseSrsService.ts`

For phrase items (the branch that currently only attaches `componentLemmaIds`), also build choices —
exactly as the lemma branch does: call `rpc('get_phrase_distractors', { target: row.id, n: 3 })`,
then `item.choices = shuffle([{ value: row.id, gloss: row.gloss_en, correct: true }, ...distractors
.map(d => ({ value: d.id, gloss: d.gloss_en, correct: false }))])`. Reuse the same Fisher–Yates
shuffle the lemma branch uses (extract a tiny shared helper if cleaner). Graceful: on RPC error,
leave choices undefined (card degrades), same as lemmas.

### 3. Routing — `src/session/renderFor.ts` (phrase block)

Give phrases the same arc as words (`is_idiom` no longer drives routing — only card framing):
```ts
if (item.type === 'phrase') {
  if (item.stage === 'new') return 'phrase/hear';                    // first exposure (audio-optional)
  if (hasAudio && computeRung(item.receptiveReps ?? 0, item.productiveReps ?? 0) === 'production')
    return 'phrase/sayit';                                            // production (needs audio)
  return 'phrase/meaning';                                            // recognition meaning-quiz
}
```
`phrase/meaning` is audio-optional (renders the written phrase + silent orb) and now has choices.
`phrase/sayit` stays audio-gated. (This supersedes the audio-less→`phrase/hear`-for-all-stages routing
from the prior branch: now only the `new` first-exposure is `phrase/hear`; recognition is the quiz.)

### 4. `PhraseMeaning` card — generalize beyond idioms — `src/screens/PhraseMeaning.tsx`

Today it hard-labels "NEW PHRASE · IDIOM" and always reveals a literal word-for-word note. Change:
- Eyebrow: neutral (e.g. **"Which meaning?"**); show the **"· IDIOM"** tag only when `item.isIdiom`.
- On solve: show the literal `LiteralNote` only when `item.literal` is present (idioms); for plain
  phrases just show the usage note / no literal note.
- Keep wrong-answer-no-advance, the choices list, and audio-optional rendering (silent orb when no
  clip; the mount must not auto-play/crash without audio — it already only `onPreload`s, but verify).
- `item.isIdiom` / `item.literal` are already on `ReviewItem` and passed to the card.

### Resulting phrase loop
`new → phrase/hear` (hear/see) → recognition reviews → `phrase/meaning` (pick the meaning) →
production (audio) → `phrase/sayit`. Mirrors the word loop (learn → hear-quiz → say).

## Out of scope (YAGNI)
- Smarter distractor selection beyond shared-component + random (e.g. semantic embeddings).
- Generating phrase TTS audio (silent orb is the placeholder).
- Expanding the `is_idiom` flag (content/QA task).

## Testing
- `get_phrase_distractors` (verified live via MCP): returns `n` distinct other phrases, prefers
  shared-component phrases first.
- Service: a phrase item gets `item.choices` of length `n+1` with exactly one correct (the target's
  gloss) and the distractor glosses present (set-equality, order-independent since shuffled);
  RPC-error path leaves choices undefined.
- `renderFor`: phrase `new` → `phrase/hear`; phrase recognition (review, non-production) →
  `phrase/meaning`; phrase production (review + audio + production rung) → `phrase/sayit`. Update the
  prior `audio-less phrase → phrase/hear` expectations that now apply only to `stage:'new'`.
- `PhraseMeaning`: renders a non-idiom (no "IDIOM" tag, no literal note) and an idiom (tag + literal
  note); renders audio-less without crashing; wrong-answer-no-advance preserved.
