# Handoff: PocketPolyglot — Audio-First Vocabulary Learning

> **Wiring this up?** Read `BACKEND_INTEGRATION.md` for the data/event contract, then
> `WIRING_MAP.md` for the exact one-to-one map from each contract to the real code
> (component ↔ file ↔ trigger prop ↔ sample data to replace) plus React-Native port notes.

## Overview
PocketPolyglot is a mobile (iOS-style, 402×874) language-learning app built around one
pedagogical arc — the **core loop**:

> **Audio in → Meaning in → Meaning out → Audio out**

A learner hears the word, understands its meaning, produces the meaning from a cue, then
speaks the word aloud. Every testing card in the app is a concrete realization of this loop.
The product is a spaced-repetition (SRS) trainer over the ~1,000 most common Latvian words,
plus phrase cards, minimal-pair perception drills, pronunciation comparison, and an AI podcast.

## About the Design Files
The files in this bundle are **design references created in HTML/React (via Babel in the
browser)** — prototypes showing intended look and behavior. **They are not production code to
ship directly.** Your task is to **recreate these designs in the target codebase's
environment** (React Native, Swift/SwiftUI, Flutter, a production React web app, etc.) using
that environment's established patterns, component library, navigation, and state tooling.
If no environment exists yet, choose the most appropriate framework for a mobile-first audio
app and implement the designs there.

The prototypes are intentionally **modular** — each card is an isolated, presentational
component driven by props and emitting events through callbacks (see
`BACKEND_INTEGRATION.md`). Preserve that boundary when you port them.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, motion, and interaction states are all
intentional. Recreate the UI faithfully using your codebase's primitives. The exact tokens are
in the **Design Tokens** section below and in `kit.jsx`.

---

## The Card Registry (this is the "label map")
All cards are registered in `app.jsx` → `PP_SCREENS`. Each entry has a stable `id`, a display
`num`, and (where the card has multiple states) a list of `variants` with stable `k` keys.
**Use `id` + variant `k` as the canonical identifier for each screen when wiring the backend.**

| # | id | Card | Variants (`k`) | Core-loop role |
|---|----|------|----------------|----------------|
| 01 | `home` | Home / daily session | — | Session entry; SRS batch summary |
| 02 | `word` | Word card | `learn-concrete`, `learn-abstract`, `learn-function`, `pic-review`, `hear`, `say` | The full loop for single words |
| 03 | `phrase` | Phrase card | `locked`, `unlock`, `hear`, `meaning`, `sayit` | Loop for multi-word phrases; unlocks when component words are known |
| 04 | `drill` | Minimal-pair drill | — | Perception (L vs Ļ) → say it back |
| 05 | `pron` | Pronunciation | — | Record → compare waveform & pitch |
| 06 | `pod` | AI podcast | — | Generated listening from known words |
| 07 | `prog` | Progress | — | Coverage of the 1,000 core words |

In the prototype each variant is rendered by a router component that switches on a `state`
prop (e.g. `WordFlowScreen` dispatches `pic-review` → `WordPicReviewScreen`). In production you
may keep that router or expose each variant as its own route/screen — but keep the `id`+`k`
identifiers stable so analytics, SRS scheduling, and deep links line up.

---

## Screens / Views

### 01 · Home (`home` → `HomeScreen`)
- **Purpose:** Start the daily session; show what's due.
- **Layout:** Full-height column. Greeting + streak header, a primary "Start session" CTA,
  a due-items summary (new vs. review counts), bottom `TabBar`.
- **Backend needs:** due-card counts, streak, today's batch.

### 02 · Word card (`word`) — the canonical core-loop card
A single word moves through stages over its SRS lifetime:

1. **Learn (first exposure)** — teaching, not testing. Everything shown. Three templates by
   word type (the `learn-*` variants):
   - `learn-concrete` (`WordLearnScreen kind="concrete"`): picturable noun (`māja`). **Image
     anchor** (day/night house illustration), word, gloss, pronunciation, waveform + play.
   - `learn-abstract` (`kind="abstract"`): abstract word (`brīvs`). Sound-alike **mnemonic**
     card ("sounds like *brew*") + one example phrase.
   - `learn-function` (`kind="function"`): grammatical word (`uz`). Meaning conveyed through
     **three tiny example sentences**, each independently playable.
   - All end with "First review tomorrow" → schedules the first SRS review.
2. **`pic-review` (`WordPicReviewScreen`)** — the next time a *picture* word returns, run the
   FULL loop: **picture + audio in** (image is the meaning cue, tap-to-hear) → **meaning out**
   (2×2 multiple choice of words: `māja` / `maize` / `jūra` / `mašīna`) → on correct pick,
   **audio out** ("Now say it" → mic record → native-vs-you waveform compare). The picture
   shrinks to a thumbnail once past the pick so the word becomes the hero.
3. **`hear` (`WordCardScreen`)** — recognition review: hear the word → pick the meaning.
4. **`say` (`WordSayScreen`)** — production review (inverse): the **meaning** is the cue →
   pick the correct word → say it out loud → compare.

   > **Stage progression rule:** `learn-*` is shown once when a word is introduced. Picture
   > words then alternate into `pic-review`; non-picture words use `hear` then `say` as they
   > mature. A missed multiple-choice pick shortens the next interval (shown in-card as
   > "brings it back in 2 days" vs. "5–6 days").

### 03 · Phrase card (`phrase` → `PhraseScreen`)
- `locked` — phrase visible but greyed with a subtle hint; unlocks only when its component
  words are all "known."
- `unlock` — one restrained reveal animation + soft chime, then auto-continues.
- `hear` — first exposure: hear the phrase, reveal meaning.
- `meaning` — multiple-choice meaning check (idioms only, where literal ≠ actual).
- `sayit` — mature review: cue → record → compare → self-rate (good / again).

### 04 · Minimal-pair drill (`drill` → `DrillScreen`)
Perception training. Hear a sound → pick which of a confusable pair it was (L vs Ļ) → **say it
back** (mic) to close the loop → next pair.

### 05 · Pronunciation (`pron` → `PronounceScreen`)
Play native model → record yourself → compare waveforms and pitch contour side by side.

### 06 · AI podcast (`pod` → `PodcastScreen`)
Audio player for a generated mini-episode built only from words the learner knows; transcript
toggle.

### 07 · Progress (`prog` → `ProgressScreen`)
Coverage visualization of the 1,000 most-common words (known 615 / 1000 in the mock).

---

## Interactions & Behavior
- **Audio playback:** `PlayOrb` (kit). Tapping toggles a `playing` state and animates a
  `Waveform`. A `SpeedChip` offers slow/normal playback (`speed` 0.5–1).
- **Recording:** `MicOrb` (kit) toggles a `rec` state with concentric voice rings; tapping
  again stops and advances to a compare/result stage.
- **Compare:** result stages render two `Waveform` rows (Native vs You) and a "Play
  back-to-back" button that plays one then the other.
- **Multiple choice:** disabled after first pick; correct option turns green with a check,
  wrong pick turns carmine, others fade. A one-line explanation appears below.
- **Motion:** entrance animations gate on `[data-deck-active]` + reduced-motion; the unlock
  chime uses WebAudio (`ppChime`). Keep durations short; no infinite loops on content.

## State Management (per-card, local in the prototype)
Each card holds only **ephemeral UI state** locally (current stage, which option is picked,
whether audio is playing, playback speed). All **durable** state — what's due, SRS intervals,
known-word set, recording blobs, scores — must come from / go to the backend. The cards are
written so this swap is clean: see the per-card data + event contracts in
`BACKEND_INTEGRATION.md`.

Common local state machines:
- `WordPicReviewScreen`: `stage: 'choose' → 'speak' → 'rec' → 'result'`, plus `choice`.
- `WordSayScreen`: `stage: 'choose' → 'speak' → 'rec' → 'result'`.
- `DrillScreen`: `picked`, then `say: 'idle' → 'rec' → 'done'`.
- `PhraseSayIt`: `stage: 'cue' → 'rec' → 'compare'`, plus `rated: 'good' | 'again'`.

---

## Design Tokens
Source of truth: `kit.jsx` (`ppTheme`, `PP_ACCENTS`, `ppHeadFont`).

### Color — accent presets (`PP_ACCENTS`, light / dark primary)
| Name | Light | Dark |
|------|-------|------|
| nordic (default) | `#2C5E8C` | `#6EA8DA` |
| steel | `#3A6B7E` | `#74B6C6` |
| ink | `#26456A` | `#7FA8D6` |
| carmine | `#9E2B3A` | `#E0748A` |

### Color — theme (light → dark)
| Token | Light | Dark |
|-------|-------|------|
| bg | `#F4F2ED` | `#0E1318` |
| surface | `#FFFFFF` | `#171E27` |
| surface2 | `#FBFAF6` | `#1F2934` |
| sunken | `#ECEAE3` | `#0A0E12` |
| ink (text) | `#1A2733` | `#EAF1F8` |
| sub | `rgba(26,39,51,.58)` | `rgba(234,241,248,.60)` |
| faint | `rgba(26,39,51,.34)` | `rgba(234,241,248,.34)` |
| onPrimary | `#FFFFFF` | `#0B1117` |
| good | `#2E7D5B` | `#5DBE96` |
| goodSoft | `rgba(46,125,91,.10)` | `rgba(93,190,150,.16)` |
| error/carmine (record) | `#C0485A` | `#C0485A` |
| shadow | `0 1px 2px rgba(26,39,51,.06)` | `0 1px 2px rgba(0,0,0,.5)` |

`primarySoft` = primary @ 10% (light) / 18% (dark); `primaryFaint` ≈ 5.5% / 10%.

### Typography
- **Headline / target-language word:** Spectral (serif), weight 500. Alternatives exposed as a
  tweak: Newsreader (serif), SF Pro (sans). `ppHeadFont(t)`.
- **UI / English / labels:** `-apple-system, "SF Pro Text", system-ui, sans-serif` (`PP_UI`).
- **Word hero:** ~48–56px, letter-spacing −0.8. **Pronunciation:** ~13–15px, faint.
  **Eyebrow labels:** 11–12px, weight 600–700, letter-spacing 1.2–1.4, uppercase.

### Spacing / radius / sizing
- Device frame: 402×874, corner radius 48.
- Card radii: images 24, choice buttons 16, surfaces 18–20, pills/chips 99.
- Primary CTA button: full-width, height 56, radius 18.
- Choice buttons: min-height 52, radius 16, 1.5px border.
- **Hit targets ≥ 44px.** PlayOrb sizes 34–66; MicOrb 72.

---

## Assets
- `assets/house.svg` / `assets/house.png` — daytime flat illustration of a house (concrete-noun
  learn card + picture review). Nordic palette: blue roof `#2C5E8C`, carmine door `#9E2B3A`,
  cream ground.
- `assets/house-night.svg` / `assets/house-night.png` — dark-mode night variant: cool-blue
  scene, crescent moon, stars, warm lamplit windows. Auto-swapped when the card is in dark mode
  (`T.dark`).
- In production, the picture-word image should come from the word's data record
  (`media.imageUrl` + an optional `media.imageUrlDark`), not be hard-coded.
- Icons are inline SVG in `kit.jsx` (`Icon` component): `check`, `mic`, `speaker`, `chevR`,
  `close`, speed glyphs. Replace with your icon set, matching stroke width ~1.8–2.4.

## Files in this bundle
- `PocketPolyglot.html` — entry; loads React + Babel and all the JSX modules below.
- `app.jsx` — **card registry (`PP_SCREENS`)**, canvas layout, tweaks panel.
- `kit.jsx` — design system: theme tokens, `PlayOrb`, `MicOrb`, `Waveform`, `SpeedChip`,
  `Icon`, `Screen`, `SessionTop`, `TabBar`, accents, fonts.
- `screens-learn.jsx` — `WordLearnScreen` (3 templates) + `WordPicReviewScreen`.
- `screens-a.jsx` — `HomeScreen`, `WordCardScreen` (hear), `WordSayScreen` (say), `DrillScreen`,
  `WordFlowScreen` router.
- `screens-phrase.jsx` — phrase card stages.
- `screens-b.jsx` — `PronounceScreen`, `PodcastScreen`, `ProgressScreen`.
- `ios-frame.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx`, `image-slot.js` — scaffolding for
  the design canvas only; **not needed in production** (your app provides device chrome/nav).
- `assets/` — illustrations listed above.
- `BACKEND_INTEGRATION.md` — **read this next**: per-card data + event contracts and the
  recommended modular boundary for wiring the backend.

> A developer who wasn't in this conversation should be able to implement the app from this
> README plus `BACKEND_INTEGRATION.md` and the referenced source files.
