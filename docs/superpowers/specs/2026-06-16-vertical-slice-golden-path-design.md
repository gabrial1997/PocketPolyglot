# Vertical Slice — "Golden Path" Design

**Date:** 2026-06-16
**Repo:** `pocketpolyglot-app` (the Expo/RN app). Content data lives one level up in `../words/`.
**Status:** Approved in brainstorming; ready for an implementation plan.
**Audience:** This spec is written to be executed by **cleared-context subagents** — it is
self-contained. Read `CLAUDE.md`, `docs/BACKEND_INTEGRATION.md` (§2–4), `docs/WIRING_MAP.md` §3,
and `handover/drill_cards_handoff/` (one level up: `../handover/...`) before implementing.

## Goal

Get **one of every card type rendering from real seeded Supabase content**, plus the full phrase
**lock → unlock** flow and the two **unique-character drill** cards, **polished in light + dark**.
This proves the entire **content → card → SRS** loop end-to-end before we scale to the full 1,000
words. It is a depth-first vertical slice, not breadth.

## Curriculum model (the pedagogy this slice must embody)

1. **i+1 phrase unlock.** A phrase unlocks when all its component lemmas are known except at most
   one new word. Already a locked product decision; this slice implements the gating that was missing.
2. **Frontloaded "unique characters."** The genuinely hard Latvian sounds (see the sound inventory)
   are introduced **first** via a new-card **ordering bias** (NOT a hard gate) — so a beginner meets a
   sound before words leaning on it appear, and never hits an "impossible," souls-like word. As they're
   mastered, SRS pushes them to the back. *Decision 2026-06-16.*
3. **Pronunciation pressure ramps in later.** Early in the loop, the say/record step is
   **zero-pressure**: record yourself and **compare to the native speaker** — no scoring, no pass/fail.
   GOP-scored pronunciation pressure is a **later** phase (Phase 1), out of scope here. The slice's record
   step is self-compare only (recorder stays stubbed). *Decision 2026-06-16.*
4. **Only hard sounds get a card.** We do NOT drill the whole alphabet — sounds that map cleanly to
   English are absorbed from hearing words. See `docs/latvian-sound-inventory.md` (new, this spec).

## In scope (this slice) vs deferred

**In scope:** the golden content set; the seed pipeline for it (OpenAI TTS now); the two drill cards
from the founder handoff (incl. the new `diphthong` kind + `GlideTrack`); phrase lock/unlock gating;
runtime distractor fetching; image rendering un-stub (placeholder); real audio envelope; the new-card
ordering bias (drills first); light/dark polish; the sound-inventory doc; end-to-end verification.

**Deferred (noted, not built here):** full per-card content for all 1,000; image-sourcing strategy for
~300 concrete words; CSV→Supabase bulk importer; the ElevenLabs/native voice decision + full-corpus
audio + Elizabete QA; real mic recording + GOP scoring (Phase 1); FSRS-at-scale testing; onboarding /
empty states; offline/error handling; analytics. The slice de-risks all of these.

## Decisions locked in brainstorming (2026-06-16)

- Golden content = **hand-authored** ~8 lemmas + 3 phrases + 2 drills (not the full pipeline yet).
- Slice audio = **OpenAI TTS now** (native + slow + envelope), clearly `draft`, swappable later.
- Concrete-word images = **placeholder** for the slice (no image pipeline yet).
- Record/compare steps = **recorder stays stubbed** (self-compare only; no GOP).
- Sounds taught via the **two drill cards** from `../handover/drill_cards_handoff/` — no alphabet primer.
- Frontloading = **ordering bias**, not a hard prerequisite gate.

## The sound cards (port verbatim from the founder handoff)

Source of truth: `../handover/drill_cards_handoff/` — `README.md`, `screens-drill.jsx`, `kit.jsx`
(its tokens/primitives are already in the app as `src/theme/tokens.ts` + `Waveform/PlayOrb/MicOrb/
SpeedChip/Screen`). "Everything visual is decided" — port the visuals exactly; build only the
data/behavior plumbing behind the card boundary.

| Card | CardKind | Contrast | Stage machine | New work |
|------|----------|----------|---------------|----------|
| **DrillScreen** | `drill` (exists) | **L vs Ļ** (palatalization) | `listen → chosen → say → done` | refine existing `src/screens/DrillScreen.tsx` to match the mockup |
| **DiphthongDrillScreen** | **`diphthong`** (NEW) | **ie** glide (*lieta* vs *lēta*) | `meet → contrast → say → done` | new screen + new **`GlideTrack`** primitive (dotted quadratic arc + 2 vowel nodes + a dot that travels the arc while audio plays) |

The `diphthong` card prepends a **"meet the glide"** step (`ie` is one continuous movement to *feel*,
not two sounds to pick between). Both share the hear → discriminate → say loop and schedule through
the same pipeline. Linguistics note (from the handoff): the L/Ļ and ie/ē words + `pron` strings are
`draft` pending Elizabete.

### Contract extension

Extend the pair/drill ReviewItem (`src/types/reviewItem.ts`) and mappers with the handoff's `DrillItem`
fields, notably the diphthong-only `glide?: { combo: string; from: string; to: string }` (e.g.
`{ combo: 'ie', from: 'i', to: 'e' }`). Register `'diphthong'` in `src/types/cardKind.ts` and the
`CARD_REGISTRY` (`src/navigation/registry.ts`). Route it in `src/session/renderFor.ts`: a `pair` item
**with** a `glide` field → `diphthong`; **without** → `drill`.

## New doc: `docs/latvian-sound-inventory.md`

A **curated** coverage matrix — only sounds hard for English speakers — mapping each tricky
grapheme/combo → its `contrast_type` → a representative minimal pair. Drives which contrasts get a
drill card so coverage is systematic, not ad hoc.

- **Produce-hard (palatalization, no English equivalent):** `ļ ķ ģ ņ` → `contrast_type` palatalization.
- **Length-hard (phonemic, invisible to English ears):** `ā ē ī ū` vs short → `vowel_length`
  (e.g. *pile*/*pīle*, *kazas*/*kāzas*).
- **Read-hard (easy sound, non-obvious grapheme):** `ie` (diphthong) → `diphthong`; `dz`/`dž`
  (single affricates) → `affricate`; `o` ([uo] in native words).
- **Excluded (map to English — absorb from hearing):** `č`=ch, `š`=sh, `ž`=zh, `c`=ts, `j`=y, regular
  consonants/short vowels. **Borderline/optional:** trilled `r` (list, don't drill yet).
- The slice ships the first two rows (`L/Ļ` palatalization, `ie` diphthong); the matrix lists the rest
  (vowel length, dz) for the next content batch.

## Golden content set (hand-authored; `latvian-linguist` drafts all fields, `draft` for Elizabete)

Seed enough items + **engineered `review_state` rows** so one card of every kind appears in the deck.
A single word can't show two stage-variants at once, so a few extra items exist purely to surface a
variant. Seed ~4–5 lemmas per `word_class` so distractor pools have candidates.

**Lemmas** (`lemmas` table — lemma, gloss_en, pron, word_class, freq_band, native_url, slow_url,
envelope, media/mnemonic/examples per class, qa_status='draft'):
- concrete: **māja** (house), **kafija** (coffee), **suns** (dog), + 1–2 fillers for distractors
- abstract: **brīvs** (free, + mnemonic), **labs** (good), + 1–2 fillers
- function: **lūdzu** (please, + 2 examples w/ audio), **viens** (one), + 1–2 fillers

**Phrases** (`phrases` + `phrase_components` with `is_new`):
- **"Lūdzu."** (components: lūdzu) — `phrase/hear`
- **"Labs suns."** (components: labs, suns) — `phrase/meaning`
- **"Vienu kafiju, lūdzu."** (components: viens [known], **kafija [the new/locked one]**, lūdzu
  [known]) — the **lock → unlock** demo and `phrase/sayit`

**Drills** (`minimal_pairs` + the new `glide`):
- **ļoti** (L vs Ļ: ļoti/lācis, correct Ļ, pron "LYO-tee") — `drill`
- **lieta** (ie: lieta/lēta, correct lieta, glide ie:i→e, pron "LYEH-ta") — `diphthong`

### Card-coverage matrix (guide; exact reps finalized in the plan)

| CardKind | Surfaced by | review_state |
|----------|-------------|--------------|
| word/learn-concrete | kafija | new |
| word/pic-review | māja | review (has image) |
| word/learn-abstract | brīvs | new |
| word/hear | labs | review, reps<3 |
| word/learn-function | lūdzu | new |
| word/say | viens | review, reps≥3 |
| phrase/hear | "Lūdzu." | new |
| phrase/meaning | "Labs suns." | learning, reps<2 |
| phrase/locked → unlock | "Vienu kafiju, lūdzu." | gated on kafija (starts unknown → learn → unlocks) |
| phrase/sayit | "Vienu kafiju, lūdzu." | review, reps≥2 (after unlock) |
| drill | ļoti | learning |
| diphthong | lieta | learning |
| pron | any word | fallback stage |

## Code work (the engineering gaps)

1. **Phrase gating** — `src/session/sessionController.ts`: for a `phrase` item, fetch its
   `phrase_components`, cross-check `KnownWordsStore`; emit `phrase/locked` if >1 unknown, `phrase/unlock`
   at the unlock moment (was locked, now ≤1 unknown), else fall through to `renderFor`. Pure helper +
   unit tests.
2. **Runtime distractors** — `src/services/supabase/SupabaseSrsService.ts` `getDueBatch`: for each word
   card, call the existing `get_distractors` RPC (same `word_class` + nearby `freq_band`, exclude target)
   and inject `choices` into the ReviewItem (`mappers.ts`). word/hear → gloss choices; word/say → word choices.
3. **Diphthong card + GlideTrack** — new `src/screens/DiphthongDrillScreen.tsx` + `src/components/GlideTrack.tsx`
   ported from `screens-drill.jsx`; refine `DrillScreen.tsx` to the mockup; register kind + route.
4. **Images + envelope un-stub** — un-stub the image render in `WordLearnConcrete.tsx` / `WordPicReview.tsx`
   (placeholder-aware: show a themed placeholder block when `media.imageUrl` is the placeholder), and wire
   `LiveWaveform` to the seeded RMS envelope.
5. **New-card ordering bias** — the batch builder introduces unique-character `drill`/`diphthong` items
   ahead of other new items (then by `utility_rank`). For the slice, encode via the engineered
   `review_state` order; document the rule for the real scheduler.
6. **Light/dark polish** — audit every card screen against tokens; no hard-coded colors; verify both themes.

## Seed pipeline

Extend `content-pipeline/` with a **golden-slice seed**: a hand-authored manifest (the content above) →
OpenAI TTS (native + slow + RMS envelope, already in `tts.mjs`) → upload to the `content-audio` bucket →
insert `lemmas / phrases / phrase_components / minimal_pairs` + the **distractor candidates** + the
engineered **`review_state`** rows + the test user's **`known_lemmas`** so the lock→unlock demo works.
One idempotent command. Needs `OPENAI_API_KEY` (in `../.env`) and `SUPABASE_SERVICE_ROLE_KEY`.

## Verification (definition of done)

- Sign in (test account `test@pocketpolyglot.dev`), start a session, and **step through one of every
  card kind** in the matrix above — in **light AND dark**.
- Confirm **"Vienu kafiju, lūdzu." is locked**, then learning **kafija unlocks it** (with the chime).
- Confirm the **drill** (L/Ļ) and **diphthong** (ie, with the GlideTrack glide animation) cards match the
  mockup frames in `../handover/drill_cards_handoff/Drill Cards Preview.html`.
- Reviewed via the chrome-devtools web loop (`run-and-view-app` skill) **and** on a phone.
- `npx tsc --noEmit`, `npx eslint .`, and `npx jest` all green (update snapshots intentionally; add unit
  tests for the gating + distractor + renderFor changes).

## Honesty / guardrails

- All seeded content is `qa_status='draft'` — **Elizabete native sign-off** before anything is `locked`
  (esp. the L/Ļ + ie/ē words and `pron` strings).
- Audio is OpenAI-draft and **swappable** when the ElevenLabs/native decision lands.
- No gamification; no time claims; progress = coverage. (Locked constraints in `CLAUDE.md`.)
- Recorder stubbed; **no pronunciation scoring** in this slice (Phase 1).

## Subagent execution notes

- Work happens entirely in `pocketpolyglot-app/`. The drill handoff and word data are one level up
  (`../handover/...`, `../words/...`) — read-only references.
- Keep cards pure (data-in/events-out); never import services into a card (`CLAUDE.md` boundary).
- Port the drill visuals **verbatim**; do not redesign. The data/behavior plumbing is the work.
- Keep CardKind + stage strings stable (analytics/deep-link routes).
