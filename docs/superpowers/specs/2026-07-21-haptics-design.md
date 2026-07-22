# Haptic Feedback — Design

**Date:** 2026-07-21
**Status:** Approved (brainstormed with founder; approach + vocabulary confirmed)

## Goal

Add tactile confirmation to the core learning loop on iOS. Haptics are **confirmation, not
celebration** — they must fit the locked "calm, premium, NOT gamified" constraint. Scope is
three moment groups the founder selected:

1. **Answer feedback** — correct / wrong multiple-choice picks (words, phrases, drills).
2. **Phrase unlock** — a success haptic synced with the unlock chime (the one celebratory beat).
3. **Recording start/stop** — mic state confirmation on speak cards.

Explicitly **out of scope**: general UI touches (primary buttons, tab switches, theme toggle),
and any `Heavy` impact style anywhere.

## Approach (chosen: theme-tier provider + shared-component fire points)

Haptics are a presentational/UI-tier concern, same tier as `useTheme` — cards may call the hook
directly. This honors the card boundary's spirit (cards stay data-in/events-out; no data
services touched) without threading new callback props through every MC card. Two alternatives
were rejected: a plain utility module (sidesteps the app's context patterns, awkward toggle
hydration/testing) and a `ServiceBundle` extension (heavy prop churn for a UI nicety;
`useTheme` precedent already establishes direct consumption of UI concerns).

## Components

### 1. Core module — `src/haptics/`

Modeled on `src/theme/ThemeProvider.tsx`:

- **`HapticsProvider`** owns one piece of state: `enabled` (default **true**). Hydrated once
  from AsyncStorage on launch, persisted on change — same guarded best-effort pattern as the
  theme `MODE_KEY` (a missing/not-ready storage never throws).
- **`useHaptics()`** returns semantic triggers plus the toggle:
  `{ correct, wrong, unlock, recStart, recStop, enabled, setEnabled }`.
- Every trigger is fire-and-forget, wrapped in try/catch, and a **no-op when disabled or on
  web** (expo-haptics is iOS/Android only; the web preview must not warn or crash).
- New dependency: **`expo-haptics`** (installed via `npx expo install expo-haptics` so the
  version matches SDK 54). The only new package.

### 2. Haptic vocabulary

| Moment | expo-haptics call | Feel |
|---|---|---|
| Correct pick | `impactAsync(ImpactFeedbackStyle.Light)` | quiet tick — confirmation, not celebration |
| Wrong pick (+ Try again) | `notificationAsync(NotificationFeedbackType.Error)` | firm "not quite" buzz |
| Phrase unlock (with chime) | `notificationAsync(NotificationFeedbackType.Success)` | the one celebratory beat, synced with the chime |
| Record start | `impactAsync(ImpactFeedbackStyle.Medium)` | clear "mic is live" |
| Record stop | `impactAsync(ImpactFeedbackStyle.Light)` | soft release |

No `Heavy`, no `Warning`, nothing on idle presses.

### 3. Fire points (five call sites; zero per-card churn for MC words/phrases)

- **`ChoiceButton`** and **`GridChoiceButton`** (`cardChrome.tsx`): a tiny shared
  `useChoiceHaptic(state)` hook fires `correct`/`wrong` on the `state`-prop **transition**
  into `'correct'`/`'wrong'` (fires exactly once per transition, never on re-render). This
  covers WordHear, WordSay, WordPicReview, and PhraseMeaning with no per-card edits.
- **`DrillScreen`** + **`DiphthongDrillScreen`**: these render their own `Pressable` glyph
  cards and know correctness at press time — call `correct()`/`wrong()` inside their existing
  `choose()` handlers.
- **`MicOrb`**: `recStart` on press when idle, `recStop` on press when recording (keyed off
  the `rec` prop at press time).
- **`cardWiring.ts` `onUnlocked`**: fire `unlock()` beside the existing chime
  `audio.play(UNLOCK_CHIME_URL)`. The trigger function is passed into the wiring from the
  controller layer (the wiring is not a hook), keeping the unlock card itself pure. The
  haptic fires regardless of whether the chime URL resolves — the tactile beat must not
  depend on the audio env var.

### 4. Settings

One row in the existing Settings preferences group: `SettRow` (title "Haptic feedback") with a
trailing `SettSwitch` wired to `enabled`/`setEnabled` from `useHaptics()`. On by default.

## Data flow

`HapticsProvider` (app root, alongside `ThemeProvider`) → `useHaptics()` in the five fire
points and the Settings row. AsyncStorage is the only persistence; no backend, no schema, no
migration.

## Error handling

- expo-haptics calls rejected/thrown (simulator, web, older devices) are swallowed —
  haptics must never surface an error or affect flow.
- AsyncStorage hydrate/persist failures fall back to `enabled = true` in-memory.

## Testing

Jest-mock `expo-haptics` (module mock in test setup or per-suite). Assert:

- Provider: defaults on, hydrates persisted value, persists on toggle.
- `useChoiceHaptic` / `ChoiceButton`: fires exactly once on transition to `correct` and to
  `wrong`; no fire on `idle`/`faded` or on re-render with an unchanged state.
- Drill screens: `wrong()` on a wrong pick, `correct()` on a correct pick.
- `MicOrb`: `recStart` when pressed idle, `recStop` when pressed recording.
- Wiring: `onUnlocked` fires `unlock()` (with and without a chime URL).
- Everything is a no-op when `enabled` is false.

Existing suites must stay green (`lint`, `typecheck`, `test`, `build`).

## On-device verification

Haptics cannot be felt in the web preview or simulator — final feel check happens on a real
iPhone via `npm run phone` (Expo Go supports expo-haptics).
