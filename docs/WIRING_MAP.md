# Wiring Map — Single Source for Porting & Backend Wiring (Expo / React Native)

**Read order:** `README.md` (what each screen is) → `BACKEND_INTEGRATION.md` (the data-in / events-out contract) → **this file** (the exact one-to-one map from each contract to the real code, plus the gotchas).

This document exists so wiring is *mechanical*. It answers, for every card: which `CardKind` string is it, which registry `id` + variant `k` does it correspond to, which **function** renders it, in **which file**, which **prop value** triggers it, and **what hard-coded content to delete**. Target stack is **Expo / React Native** (the project's settled tech direction).

> Everything below was verified against the source on 2026-06-14. Line numbers are anchors, not contracts — if a file is edited they drift, but the function names and prop values are stable.

---

## 1. Master map (the table to wire from)

| `CardKind` string | Registry `id` + `k` | Component function | File | What renders it | Hard-coded sample data to replace |
|---|---|---|---|---|---|
| `word/learn-concrete` | `word` + `learn-concrete` | `WordLearnScreen` (`kind="concrete"`) | `screens-learn.jsx` | `WordFlowScreen state="learn-concrete"` → renders `WordLearnScreen kind="concrete"` | `PP_LEARN.concrete` (`screens-learn.jsx:8`) — `māja`/house; image `assets/house.svg` |
| `word/learn-abstract` | `word` + `learn-abstract` | `WordLearnScreen` (`kind="abstract"`) | `screens-learn.jsx` | `WordFlowScreen state="learn-abstract"` | `PP_LEARN.abstract` (`screens-learn.jsx:8`) — `brīvs`, mnemonic “brew” (hard-coded at `:100`) |
| `word/learn-function` | `word` + `learn-function` | `WordLearnScreen` (`kind="function"`) | `screens-learn.jsx` | `WordFlowScreen state="learn-function"` | `PP_LEARN_EXAMPLES` (`screens-learn.jsx:23`) — `uz` example sentences |
| `word/pic-review` | `word` + `pic-review` | `WordPicReviewScreen` | `screens-learn.jsx` | `WordFlowScreen state="pic-review"` | `correct='māja'` + 2×2 choices (`screens-learn.jsx:157–162`); image `assets/house.svg` |
| `word/hear` | `word` + `hear` | `WordCardScreen` | `screens-a.jsx` | `WordFlowScreen` **default fall-through** (no/other `state`) | `correct='labrīt'` + choices (`screens-a.jsx:389–392`) |
| `word/recall` | *(none — not a registry screen)* | `WordCardScreen`, same as `word/hear` | `screens-a.jsx` | `renderFor()` **never returns this kind** — a recall-probe item renders through the normal `word/hear` path; the controller rewrites `CardResult.cardKind` to `'word/recall'` in `submit()` before posting, so `SupabaseSrsService` logs it (no `review_state`/FSRS write) instead of grading it | — (no separate content; same `item` as the `word/hear` card it renders as) |
| `word/say` | `word` + `say` | `WordSayScreen` | `screens-a.jsx` | `WordFlowScreen state="say"` | `labrīt` + choices (`screens-a.jsx` around `:389`) |
| `phrase/locked` | `phrase` + `locked` | `PhraseLocked` | `screens-phrase.jsx` | `PhraseScreen state="locked"` | `PP_PHRASES` (`screens-phrase.jsx:7`) |
| `phrase/unlock` | `phrase` + `unlock` | `PhraseUnlock` | `screens-phrase.jsx` | `PhraseScreen state="unlock"` | `PP_PHRASES` |
| `phrase/hear` | `phrase` + `hear` | `PhraseHear` | `screens-phrase.jsx` | `PhraseScreen` default fall-through | `PP_PHRASES` |
| `phrase/meaning` | `phrase` + `meaning` | `PhraseMeaning` | `screens-phrase.jsx` | `PhraseScreen state="meaning"` | `PP_PHRASES` |
| `phrase/sayit` | `phrase` + `sayit` | `PhraseSayIt` | `screens-phrase.jsx` | `PhraseScreen state="sayit"` (also `"review"`) | `PP_PHRASES` |
| `drill` | `drill` | `DrillScreen` | `screens-a.jsx` | direct (`Comp: DrillScreen`) | inline L/Ļ pair data |
| `diphthong` | `diphthong` | `DiphthongDrillScreen` | `src/screens/DiphthongDrillScreen.tsx` | direct (`renderFor()`: a `pair` item **with audio** whose `glide` field is set — the gliding ie combination; a pair without `glide` routes to `drill`) | — (built directly in RN, data-driven from `item.pair` + `item.glide`; no prototype screen) |
| `pron` | `pron` | `PronounceScreen` | `screens-b.jsx` | direct — **not yet reachable in the production loop (Phase 1)**: `renderFor()` never returns `pron` today; it activates with GOP scoring | inline native-audio sample |

**Non-batch screens** (not SRS review items — see §3): `home` → `HomeScreen` (`screens-a.jsx`), `pod` → `PodcastScreen` (`screens-b.jsx`), `prog` → `ProgressScreen` (`screens-b.jsx`).

The registry these map to lives in `app.jsx` → `PP_SCREENS`. Keep `id` + `k` stable: they're your analytics events and deep-link routes.

---

## 2. The gotchas that will otherwise cost you an hour

**`state` → `kind` rename on learn cards.** `WordFlowScreen` receives `state="learn-concrete"` but renders `<WordLearnScreen kind="concrete" />` — it strips the `learn-` prefix (`state.slice(6)`). So in production, your `renderFor()` returns `word/learn-concrete`, but the component you mount takes `kind="concrete"`. Don't pass the full `learn-*` string to `WordLearnScreen`.

**`WordFlowScreen` routes by fall-through, not a switch.** Order matters: `pic-review` → `learn-*` (prefix match) → `say` → **else `WordCardScreen` (hear)**. There is no explicit `state="hear"` branch; `hear` is the default. If you split each variant into its own RN route/screen (recommended in RN navigation), you can drop `WordFlowScreen` entirely and mount the leaf components directly — just preserve the `id`+`k` identifiers.

**`word/recall` is logged-only, not a screen.** Don't add a registry entry or route for it. It
exists solely as a `review_log.card_kind` / `CardResult.cardKind` value (earned-phrase gating,
`BACKEND_INTEGRATION.md` §4): the card the learner sees is an ordinary `word/hear` — `renderFor()`
returns `'word/hear'` for a probe item too — and only the outgoing result gets relabeled.

**`phrase/sayit` has an alias.** `PhraseScreen` treats both `state="sayit"` and `state="review"` as the say-it stage. Use `sayit` as canonical; treat `review` as a legacy alias.

**`PhraseLine` is a sub-component, not a screen.** `screens-phrase.jsx` also defines `PhraseLine` (a shared phrase-rendering primitive). It's not in the registry — don't wire it as a card; it's used *inside* the phrase screens.

**The canvas scaffolding is not app code.** `ios-frame.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx`, `image-slot.js`, and `app.jsx` itself exist only to render the design canvas in a browser. In the RN app, your navigator provides device chrome and routing — port only `kit.jsx` and the `screens-*.jsx` content.

---

## 3. Two screen tiers — wire them differently

The prototype renders all seven as equal artboards. For wiring they split into two kinds, and conflating them is the most likely architecture mistake:

**Tier A — SRS review cards** (driven by `SessionController` + `renderFor()`, per `BACKEND_INTEGRATION.md`): `word/*`, `phrase/*`, `drill`, `diphthong`, `pron`. These receive a `ReviewItem` and emit a `CardResult`. They are the only screens in the daily-batch loop. (`pron` is registered but not yet reachable — see §1.)

**Tier B — standalone screens** (their own data source, **not** in `renderFor()`, **not** `ReviewItem`/`CardResult`):

| Screen | Data it needs | Suggested service |
|---|---|---|
| `home` | due-card counts (new vs review), streak, today's batch summary | `SrsService.getDueBatch()` summary + `ProfileService` for streak |
| `pod` (podcast) | a generated episode (audio URL + transcript) built from the known-word set | `PodcastService.getEpisode()` |
| `prog` (progress) | coverage of the 1,000 core words: corpus size + the known words' frequency ranks (hero %, band bars, and the dot grid all derive from the ranks) | `ProgressService.getCoverage()` → `{ total, knownRanks }` (spec 2026-07-06) |

`BACKEND_INTEGRATION.md` §2–4 intentionally covers only Tier A. That's why `home`, `pod`, and `prog` don't appear in the `CardKind` union — they aren't cards. Wire them as ordinary screens with the data above; they don't post `CardResult`.

---

## 4. Per-card signature: before → after

Every card today is `function X({ T, t })` (plus `state`/`kind` on the routers). Productionizing = keep `T`/`t`, add `item` + callbacks, delete the sample constant. Concrete example for the core-loop card:

```jsx
// BEFORE (prototype) — screens-learn.jsx
function WordPicReviewScreen({ T, t }) {
  const correct = 'māja';
  const choices = [ {lv:'māja',en:'house'}, {lv:'maize',en:'bread'}, ... ]; // hard-coded
  // ...renders house.svg, owns stage/choice/playing locally
}

// AFTER (Expo / React Native)
function WordPicReviewScreen({
  T, t, item,                       // item: ReviewItem (target, gloss, audio, media, choices)
  onPlay,                           // (which: 'native'|'slow') => void
  onAnswer,                         // (value: string, correct: boolean) => void
  onRecordStart, onRecordStop,      // onRecordStop(blob)
  onPlayCompare,                    // ('native'|'you') => void
  onComplete,                       // (result: CardResult) => void
}) {
  // still owns ONLY: stage ('choose'|'speak'|'rec'|'result'), choice, playing, speed
  // image  = T.dark ? item.media.imageUrlDark : item.media.imageUrl
  // correct = item.choices.find(c => c.correct).value
}
```

The full callback list per `CardKind` is in `BACKEND_INTEGRATION.md` §4 — this file just shows the shape of the swap so it reads the same in every card. The local UI-state machines (`choose → speak → rec → result`, etc.) stay exactly as the prototype has them; you only replace *content* and add *events*.

---

## 5. RN-specific port notes (kit.jsx → React Native)

The mockups are React **DOM** (`<div>`, inline CSS, browser SVG). The token *values* port verbatim; the primitives need RN equivalents:

| Prototype (web) | React Native equivalent | Note |
|---|---|---|
| `ppTheme(dark, t)` color/spacing tokens | same object, used in `StyleSheet` / a theme context | **Port this first** — `kit.jsx` token values transfer unchanged (README → Design Tokens). |
| `<div style={{...}}>` | `<View style={...}>` | inline objects → `StyleSheet.create`; flex defaults differ (`flexDirection` is `column` by default in RN). |
| text in a `<div>` / `<span>` | `<Text>` | RN requires all text inside `<Text>`. |
| `boxShadow` token | `shadowColor/Offset/Opacity/Radius` (iOS) + `elevation` (Android) | the single CSS shadow string maps to multiple props. |
| inline `<svg>` `Icon`, `Waveform` | `react-native-svg` (or `@shopify/react-native-skia` for the animated waveform) | keep stroke widths ~1.8–2.4; `Waveform` bars/line/dots all redrawable in svg/skia. |
| web fonts via `<link>` (Spectral, Newsreader) | `expo-font` + `useFonts` | load Spectral 500 for headlines; UI font → system (`San Francisco` is the iOS default). |
| `ppChime` (WebAudio) | Expo audio API | small one-shot sound asset. |
| `PlayOrb` taps → audio | inject `AudioService` (wrap Expo's audio playback API) via context | card calls `onPlay`; service plays. Don't `import` audio in the card. |
| `MicOrb` taps → record | inject `RecorderService` (wrap Expo's audio recording API + mic permission) | card calls `onRecordStart/Stop`; service returns the blob/URI. |
| `[data-deck-active]` + reduced-motion gating | `react-native-reanimated` + `AccessibilityInfo.isReduceMotionEnabled` | keep entrance durations short, no infinite content loops. |

> Note: Expo's audio modules have been evolving (the older `expo-av` is being superseded by `expo-audio` / `expo-video`). Pick the current recommended Expo audio package at build time; the `AudioService` / `RecorderService` wrapper boundary in `BACKEND_INTEGRATION.md` §5 means the choice stays isolated to one file.

---

## 6. Recommended wiring order (RN)

This refines the checklist in `BACKEND_INTEGRATION.md` §6 for React Native specifically:

1. **Design system from `kit.jsx`.** Port `ppTheme` tokens into a theme context; build `View`-based `PlayOrb`, `MicOrb`, `Waveform`, `SpeedChip`, choice button, CTA. Get light + dark switching working before any screen.
2. **Types + controller.** Define `ReviewItem` / `CardResult` (TS) and the `SessionController` hook with `renderFor()` exactly as §2 of BACKEND_INTEGRATION — but have it return an RN route/screen, not a router component.
3. **Core loop first.** Port `word/pic-review` end-to-end (picture+audio in → pick → say → result → `SrsService.submit`). This exercises every service and proves the boundary. Use the §1 row to find the file, the §4 signature to wire it, and the §1 “sample data to replace” column to know what to delete.
4. **Remaining Tier A cards**, one `CardKind` at a time, top of the §1 table down.
5. **Tier B screens** (`home`, `pod`, `prog`) with their own services (§3) — no `CardResult`.
6. **Lock the `id`+`k` strings** as analytics events / deep-link routes.

When all of Tier A renders from `item` props with no hard-coded `māja`/`labrīt`/`PP_PHRASES`/`PP_LEARN` left, the port is done.
