# PocketPolyglot — Handover v0.1.1 (2026-06-22)

**Read this first.** Kickoff for the next session. Supersedes `handoverv0.1.0.md` (still valid for
anything not restated here). Two parallel tracks below can run in **separate git worktrees**
(`superpowers:using-git-worktrees`) — **Track A: audio/animation sync** and **Track B: Settings tab**.
A third track (**C: 146-image scale-up**) is mechanical and unblocked.

> **Subagent caveat:** last sessions, subagent *dispatch* was blocked by the Anthropic credit-gate
> bug ("Usage credits required for 1M context"). Do **not** tell the user to buy credits. If dispatch
> still fails, execute the plans **inline** (`superpowers:executing-plans`). Worktrees work either way.

---

## ✅ Done this session — picture cards (SVG illustrations)

The image card already existed (`WordPicReview` + `CardImage`); this session **fed it real art**.

- **`src/screens/CardImage.tsx`** — now renders SVG. `.svg` urls go through `react-native-svg`'s
  `<SvgUri>` (RN `<Image>` can't draw SVG on-device); raster urls keep `<Image>`; missing/`'placeholder'`
  still draws the letter tile. Dark mode swaps `imageUrlDark`. `preserveAspectRatio="xMidYMid slice"`
  ≈ `resizeMode="cover"`. **TDD: `CardImage.test.tsx` 4/4 green; typecheck + lint clean.**
- **`content-pipeline/seed-images.mjs`** — uploads SVGs from `content-pipeline/assets/images/` to the
  public `content-images` Storage bucket (`golden/<file>.svg`, `image/svg+xml`) and sets `lemmas.media`
  `{imageUrl, imageUrlDark?}`. Currently seeds **6** golden-slice nouns (see `MAP`).
- **Seeded + verified live:** māja→house(+night), kafija→coffee(+night), suns→dog, ūdens→water,
  galds→table, grāmata→book. URLs return `200 image/svg+xml`; `lemmas.media` populated 6/6.
- **`content-pipeline/assets/images/`** — the **full catalog** is now on disk (214 files: 199 SVG +
  12 PNG + audio; 49 `-night` variants). Track C uses these.

**⚠️ Temporary demo state (revert when done):** to let the user *see* image cards now, the test
account's `review_state.due_at` for `māja`/`kafija`/`suns` was forced to now. After the user runs the
session FSRS pushes them out again — it's a one-shot. Not a code change; nothing to clean in git.

**Uncommitted** on `feat/frontend-visual-sync`: `CardImage.tsx` (M), `CardImage.test.tsx`,
`seed-images.mjs`, `content-pipeline/assets/images/` (untracked). Commit before/with the next work.

---

## 🐞 Track A — audio + animation sync (the 5 bugs)

**One root cause for bugs 1/2/3/5 + the speed-sync requirement:** `ExpoAudioService`
(`src/services/device/ExpoAudioService.ts`) already has real playback control — synchronous
prior-player teardown with a monotonic `gen` guard (the "multiple voices" fix, with a test),
`playbackStatusUpdate`/`didJustFinish`, and pitch-corrected `setPlaybackRate`. **But the cards never
see any of it.** `usePlayClip` (`src/components/usePlayClip.ts`) drives the soundbar with a **blind
timer**: `clipMs = envelope.length × FRAME_MS (30) + TAIL`, computed **at 1× only**. So real position,
end-of-clip, latency, and rate are all invisible to the UI.

The fix is one coherent piece: **bridge real playback status/position across the AudioService boundary
into the cards** (the deferred integration described in `soundbar.md`), then:

1. **Bug 2 — waveform desync:** drive `LiveWaveform` (`src/components/`) from real playback position,
   not the timer. The bar then tracks the actual sound.
2. **Bug 5 + user's speed-sync rule — animations must match voice rate:** every playback-driven
   animation (`clipMs`, the waveform, any glide tied to audio) must scale by `1/rate`. At 0.7× the bar
   must run ~1.43× longer. Today `clipMs` ignores `rate` entirely → slow voice, early bar.
3. **Bug 3 — no pause / replay stacking:** make the `PlayOrb` a true **play/pause toggle** — call
   `AudioService.stop()` (it exists) when playing; reflect real `playing` state. Then **verify on-device**
   the service teardown actually prevents overlap (service looks correct; user still reports stacking —
   confirm the card path calls `service.play()` and that teardown lands before the next play's first await).
4. **Bug 1 — latency:** `createAudioPlayer({uri})` loads the remote MP3 on every play → first-play lag.
   Consider preloading the current/next clip or reusing players. Confirm on-device.

**Files:** `ExpoAudioService.ts` (+ its test), `usePlayClip.ts`, `LiveWaveform`/`Waveform` in
`src/components/`, `SpeedChip.tsx`, the `onPlay`/`onPlayCompare` wiring in the card screens, and the
`AudioService` interface (`src/services/index.ts` / `BACKEND_INTEGRATION.md §5`). `soundbar.md`
(repo root + app) is the design guide for amplitude-synced playback. **Use
`superpowers:systematic-debugging`** — several of these need on-device repro (web preview can't fully
prove audio timing). Do bug 2/5 (position+rate bridge) first; 3 and 1 build on the same status bridge.

### Bug 4 — freeze, Continue unresponsive (separate)
Sometimes the session hangs and the **Continue** CTA can't be pressed. Likely the glide/transition
state machine getting stuck — history: `src/navigation/StartingLoop.test.tsx` ("phrase cards play on
a loop" / stale mounted `GlideViewport` node). May be aggravated by overlapping audio promises that
never resolve. **Investigate** `SessionHost` / `GlideViewport` (`src/navigation/`) + whether an audio
`play()` promise can hang the advance. Needs a device repro to capture the stuck state. No fix until
root cause is found (systematic-debugging Iron Law).

---

## ⚙️ Track B — Settings tab

Spec: **`docs/superpowers/specs/2026-06-22-settings-tab-design.md`** — now aligned to the real mockup
**`screens-settings.jsx`** in the design project (`ceff4014-…`; fetch via `DesignSync get_file`). It's a
5-screen router (Menu · Profile · Appearance · Subscription · Logout sheet). Functional staging is in the
spec: **theme/profile-display/sign-out = real v1**; **notifications/profile-editing = visual shell**;
**Subscription/payments = post-MVP** (CLAUDE.md scope — build a visual shell or omit; no real IAP).
**Binding gap:** the mockup omits the GDPR `rec_consent` surface CLAUDE.md requires — add it under
Profile › Security. Three open scope questions for the user are listed at the end of the spec.

---

## 🖼️ Track C — scale images to the full 146 (mechanical, unblocked)

Assets are on disk (`content-pipeline/assets/images/`). The authoritative **lemma → file + day/night**
mapping is the design project's **`PocketPolyglot Illustration Assets.html`** (`PAIRS` = 44 day/night,
`NEUT` = 103 neutral; re-fetch via `DesignSync get_file`). Recipe:

1. Extend `MAP` in `seed-images.mjs` from `PAIRS`/`NEUT` (pairs get `dark: <file>-night.svg`; neutral
   light-only). Make missing-file handling **skip+warn** rather than throw, so partial sets still run.
2. `node content-pipeline/seed-images.mjs` → uploads + seeds `lemmas.media` for every lemma that has
   a matching row.
3. **Durability fix (do this too):** a full `seed-golden-slice` re-run wipes `media` (it skips the
   `"placeholder"` sentinel). Fold the image step into the main seeder, OR have `golden-slice.json`
   reference image files the seeder uploads — so re-seeding keeps the art. Decide + implement.
4. Only the matching ~dozen golden lemmas will seed until the deck grows; that's expected.

---

## Suggested order
Commit the picture-card work → **Track A** (audio is gating "before adding the rest of the words",
per the user) → **Track B** (Settings, once Claude Design is imported) → **Track C** (146 scale-up).
Tracks B and C are independent of A and can run in parallel worktrees.
