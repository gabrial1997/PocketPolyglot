# Card Polish & Bug-Fix Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five device-walk defects on the SRS card flow: overlapping audio on repeated play taps, clipped diacritics on the drill glyph, a missing green confirmation + transition when a correct answer is picked, a hard-to-see exit affordance with no exit transition, and a phrase unlock that never fires during a natural seeded walk.

**Architecture:** All fixes respect the pure-card boundary (CLAUDE.md): cards stay data-in / events-out and own only ephemeral UI state; service and host changes live outside cards. The audio fix is in the injected `ExpoAudioService`. The unlock fix is seed-data + a deterministic sort in the SRS service — no control-flow change.

**Tech Stack:** Expo / React Native (TypeScript strict, `noUncheckedIndexedAccess`), Jest + @testing-library/react-native, Supabase, expo-audio, ts-fsrs.

## Global Constraints

- **Cards are pure:** data-in / events-out. A card never imports a service, never fetches, never schedules. Transitions/animations belong in the card's own ephemeral UI layer or the host — never reach into services. (CLAUDE.md)
- **Wrong MC answers do NOT advance:** chosen wrong option reddens, correct answer is NEVER revealed/highlighted, copy is "Not quite — give it another try.", the first-try miss is remembered for SRS. This rule is untouched by this plan — do not weaken it.
- **Correct pick → green + advance.** This plan ADDS the currently-missing green confirmation.
- **NOT gamified.** Calm/restrained. The only celebratory beat is the single phrase-unlock soft chime. No confetti/streaks/XP. Transitions must be subtle, not playful.
- **Respect reduced-motion:** any new animation must settle to its end-state instantly when `AccessibilityInfo.isReduceMotionEnabled()` is true — reuse the pattern in `src/components/GlideViewport.tsx`.
- **Progress = coverage, never points.** No copy changes that introduce points/time claims. Never the literal word "quiet" in user copy. No time claims.
- **TypeScript strict, no `any`** in card/controller contracts.
- **Keep CI green:** `npm run lint`, `npx tsc --noEmit`, `npm test` all pass on every commit.
- **TDD:** failing test first for every behavioral change.

---

### Task 1: Gate audio so rapid play taps cannot stack voices

**Problem:** Tapping a card's play orb repeatedly speaks the word several times on top of itself. Root cause is an async race in `ExpoAudioService.play`: each tap calls `void audio.play(url)` (fire-and-forget). Two rapid calls both pass `await this.stop()` before either assigns `this.player`, so `createAudioPlayer` runs twice and two players sound concurrently.

**Files:**
- Modify: `src/services/device/ExpoAudioService.ts`
- Test: `src/services/device/ExpoAudioService.test.ts` (create if absent)

**Interfaces:**
- Consumes: `expo-audio` `createAudioPlayer`, `setAudioModeAsync`.
- Produces: unchanged public `AudioService` surface (`play`, `stop`, `isPlaying`).

- [ ] **Step 1: Write the failing test.** Mock `expo-audio` so `createAudioPlayer` returns a fake player recording `play()`/`remove()` calls and lets you control timing. Assert: when `play(urlA)` and `play(urlB)` are invoked back-to-back without awaiting (simulating two rapid taps), exactly ONE player ends up active (`isPlaying() === true`) and at most one fake player has `play()` called without a following `remove()` — i.e. no two concurrent live players. Add a second test: a single `play()` then `stop()` leaves `isPlaying() === false` and removes the player.

- [ ] **Step 2: Run it to confirm it fails** (`npm test -- ExpoAudioService`). Expected: two live players / race detected.

- [ ] **Step 3: Implement a generation-token guard.** Add a private monotonic `private gen = 0`. At the top of `play`, capture `const myGen = ++this.gen;` and synchronously tear down any existing player BEFORE the first `await` (move the teardown out of the awaited `stop()` so a later call sees a cleared `this.player` immediately). After each `await` in `play`, bail out if `this.gen !== myGen` (a newer tap superseded this one) — removing any player this call created. Net effect: latest tap wins, never two live players. Keep `shouldCorrectPitch`/rate behavior intact. `stop()` must also bump `this.gen` so an in-flight `play` is cancelled.

- [ ] **Step 4: Run the test to verify it passes**, plus `npx tsc --noEmit` and `npm run lint`.

- [ ] **Step 5: Commit** (`fix(audio): gate ExpoAudioService against concurrent play (no stacked voices)`).

---

### Task 2: Fix clipped diacritics on the drill glyph

**Problem:** On the consonant/diphthong drill, the option words `lācis` / `ļoti` render with the macron over `ā` sliced off (reads like "lacɪs"). Cause: `styles.glyph` in `DrillScreen.tsx` sets `fontSize: 64` with `lineHeight: 64` — line-height equal to font-size leaves no headroom above the cap, so top diacritics (macron on ā/ī/ū) clip. `adjustsFontSizeToFit` only fits width, not height.

**Files:**
- Modify: `src/screens/DrillScreen.tsx` (the `glyph` style, ~line 193)
- Also audit (modify only if they clip macrons): `src/components/cardChrome.tsx` (`WordHero` and any large serif headline style with `lineHeight === fontSize`)
- Test: `src/screens/DrillScreen.test.tsx` (extend)

**Interfaces:** none changed (style-only).

- [ ] **Step 1: Write/extend a failing test** asserting the drill glyph `Text` style has `lineHeight` strictly greater than `fontSize` (guards the regression). If a render assertion is impractical, assert against the resolved style object of the rendered glyph node for the seeded `lācis`/`ļoti` pair.

- [ ] **Step 2: Run to confirm it fails.**

- [ ] **Step 3: Fix the style.** In `styles.glyph` raise `lineHeight` to give macron headroom (e.g. `lineHeight: 78` for `fontSize: 64`, ~1.2×) and add a small `paddingTop` if needed so the macron is never cropped by the line box. Audit `WordHero` and other large serif glyphs (the māja/ā case) and apply the same `lineHeight > fontSize` rule wherever a macron could clip; do not restyle anything that is already safe.

- [ ] **Step 4: Run the test + full suite + `tsc` + `lint`.** Snapshot updates from the style change are expected — review them.

- [ ] **Step 5: Commit** (`fix(drill): give serif glyph macron headroom (no clipped ā/ī/ū)`).

---

### Task 3: Green confirmation + stage transition when a correct answer is picked

**Problem:** On the full-loop cards (`WordSay`, `WordPicReview`), picking the correct option jumps instantly to the speak stage with no green confirmation and no transition — violating the locked "Correct pick → green + advance" rule and feeling jarring. (The wrong-answer rule must stay exactly as is.)

**Files:**
- Modify: `src/screens/useLoopStage.ts` (add a brief confirm beat + expose the confirmed value)
- Create: `src/components/StageFade.tsx` (reduced-motion-gated crossfade wrapper)
- Modify: `src/screens/WordSay.tsx`, `src/screens/WordPicReview.tsx` (render green on the confirmed choice; wrap stage bodies in `StageFade`)
- Test: `src/screens/useLoopStage.test.ts` (create/extend), `src/screens/WordSay.test.tsx`, `src/screens/WordPicReview.test.tsx`, `src/components/StageFade.test.tsx`

**Interfaces:**
- `useLoopStage` adds `rightValue: string | null` (the correct option to render green during the confirm beat) and keeps `stage`, `wrongValue`, `missed`, `pick`, `retry`, `beginRec`, `finishRec`, `reset`. `pick(value, correct)` on a correct answer sets `rightValue`, holds `stage === 'choose'` for `CONFIRM_MS`, THEN advances to `'speak'`.
- `StageFade` props: `{ stageKey: string; children: React.ReactNode }` — crossfades when `stageKey` changes; instant when reduced-motion is on.

- [ ] **Step 1 (useLoopStage): write failing tests** with fake timers: (a) on a correct `pick`, `rightValue` is set immediately and `stage` is still `'choose'`; after advancing `CONFIRM_MS` the stage becomes `'speak'`. (b) a wrong `pick` is UNCHANGED — `wrongValue` set, `missed` true, stage stays `'choose'`, never sets `rightValue`, and the correct answer is never exposed. (c) `reset` clears `rightValue` and cancels a pending advance timer (no post-unmount/stage flip).

- [ ] **Step 2: Run to confirm they fail.**

- [ ] **Step 3 (useLoopStage): implement.** Add `const CONFIRM_MS = 420;`. Add `rightValue` state. In `pick`, correct branch: `setRightValue(value); setPicked(value);` then `setTimeout(() => setStage('speak'), CONFIRM_MS)` stored in a ref and cleared on `reset`/unmount. Wrong branch unchanged. Export `rightValue`.

- [ ] **Step 4 (StageFade): write a failing test** that it renders children, and that changing `stageKey` mounts new children (a behavior/opacity assertion with fake timers); when reduce-motion is enabled it swaps instantly. Reuse the `AccessibilityInfo.isReduceMotionEnabled()` ref pattern from `GlideViewport.tsx`.

- [ ] **Step 5 (StageFade): implement** a small `Animated.View` opacity crossfade (~180–220ms) keyed on `stageKey`, reduced-motion gated to an instant swap. Keep it dependency-free (RN `Animated` only).

- [ ] **Step 6 (cards): write failing tests** for `WordSay` and `WordPicReview`: after a correct pick the chosen option shows the `'correct'` (green) visual state and the speak stage ("Now say it") appears only after `CONFIRM_MS` (fake timers). The existing wrong-answer tests must still pass unchanged (no advance, no reveal, "Not quite — give it another try.").

- [ ] **Step 7 (cards): implement.** Pass `state={c.value === m.rightValue ? 'correct' : c.value === m.wrongValue ? 'wrong' : 'idle'}` to `ChoiceButton`/`GridChoiceButton` (both already support a `'correct'` state — see `PhraseMeaning.tsx`). Wrap each card's per-stage body in `<StageFade stageKey={m.stage}>`. Do not move any logic into services; this is ephemeral UI only.

- [ ] **Step 8: Run all four test files + full suite + `tsc` + `lint`.** Update snapshots intentionally.

- [ ] **Step 9: Commit** (`feat(cards): green confirm + stage crossfade on correct answer`).

---

### Task 4: Make the exit X visible and add an exit transition

**Problem:** The exit-to-home "X" (top-left, in `SessionTop`) is easy to miss — icon is `T.sub` (~60% opacity) on a 6%-white chip — and pressing it cuts to home with no transition.

**Files:**
- Modify: `src/components/cardChrome.tsx` (`SessionTop` render + `chrome.stClose` style, ~lines 246–294)
- Modify: `src/navigation/index.tsx` (the `SessionHost` exit path / where `onExit` fires, ~lines 135–161) — add a brief fade-out on exit
- Test: `src/navigation/SessionHost.test.tsx` (extend: X press still calls exit; visibility/style assertion)

**Interfaces:** `SessionTop` keeps its `{ step, total, onClose }` contract; only styling + an optional exit-fade wrapper at the host change.

- [ ] **Step 1: Write failing tests.** (a) The close control renders with a higher-contrast icon color (assert the icon color is `T.ink`, not `T.sub`) and a more visible chip background (assert the bumped opacity value). (b) Pressing the close control still invokes the exit callback exactly once.

- [ ] **Step 2: Run to confirm they fail.**

- [ ] **Step 3: Implement visibility bump.** In `SessionTop`: icon `color={T.ink}` (from `T.sub`); `stClose` background to `T.dark ? 'rgba(255,255,255,0.12)' : 'rgba(26,39,51,0.10)'`; optionally a hairline border for definition. Keep size/position; keep `accessibilityLabel`.

- [ ] **Step 4: Implement exit transition.** At the host (`SessionHost` in `navigation/index.tsx`), wrap the session view in an `Animated.View` and, on `onExit`, run a short fade-out (~200ms, reduced-motion gated to instant) before navigating home, so the exit isn't an abrupt cut. Cards are untouched.

- [ ] **Step 5: Run the test file + full suite + `tsc` + `lint`.**

- [ ] **Step 6: Commit** (`fix(session): visible exit X + exit fade transition`).

---

### Task 5: Make the phrase unlock fire during a natural seeded walk (seed + deterministic order)

**Problem:** In the seeded golden-slice walk, the unlock phrase `ph-kafija` ("Vienu kafiju, lūdzu.", components `viens`[known], `kafija`[new], `ludzu`[new]) never produces the `phrase/unlock` reveal. Root cause (verified): `kafija`/`ludzu` carry no `seedState.order`, so their `due_at` is NULL and they scatter into an indeterminately-ordered tail with ~7 unrelated cards between the locked encounter and the re-queued phrase — a human walk never reaches it. The live unlock mechanism itself works; this is seed + ordering only.

**Files:**
- Modify: `content-pipeline/golden-slice.json` (add `order` to cluster `ph-kafija` + its unknown component(s); tighten `knownForTestUser`; refresh the stale `_note`)
- Modify: `src/services/supabase/SupabaseSrsService.ts` (`getDueBatch`: add a deterministic secondary sort so NULL-`due_at` new items have a stable, intended order)
- Test: `src/services/supabase/SupabaseSrsService.test.ts` (assert deterministic order), plus extend the session/starting-loop test if one asserts the unlock sequence
- Verify: re-run `content-pipeline/seed-golden-slice.mjs` against the live project — **PAUSE for user approval before running the live seeder** (it writes to the live DB; existing `kafija`/`ludzu` clips are already in `content-pipeline/out/` so no new TTS spend is expected — confirm before running).

**Interfaces:** `getDueBatch` return order becomes deterministic; `ReviewItem` shape unchanged.

- [ ] **Step 1: Write a failing test** for `getDueBatch` ordering: given rows where several `new` items share NULL `due_at`, the returned order is deterministic and follows the intended secondary key (e.g. a stable curriculum/order field or item id) — not Postgres-indeterminate.

- [ ] **Step 2: Run to confirm it fails.**

- [ ] **Step 3: Add the deterministic secondary sort** to `getDueBatch` after the existing `due_at asc nulls last` ordering (e.g. a secondary `.order(...)` on a stable key). Keep the primary `due_at` ordering intact.

- [ ] **Step 4: Adjust the seed** in `golden-slice.json` so the unlock fires within a natural walk: give `ph-kafija` and its unknown component(s) `seedState.order` values that cluster them (locked phrase encountered, then its last unknown component learned, then the phrase re-encountered) AND add one component (`kafija`) to `knownForTestUser` so only ONE word must be learned in-session — the unlock then fires right after that word card. Replace the stale `_note` with an accurate description of the strict gate + live overlay + the intended ordering.

- [ ] **Step 5: Add/extend a session-level test** (e.g. `StartingLoop`/`SessionHost`) asserting that, for the test user, after learning the in-session component the re-queued `ph-kafija` yields a `phrase/unlock` kind before the queue ends. If the existing tests already cover the mechanism with a synthetic batch, add a focused assertion using the real seed-derived ordering.

- [ ] **Step 6: Run the changed test files + full suite + `tsc` + `lint`.**

- [ ] **Step 7: PAUSE — request user approval to re-run the live seeder.** On approval, run `node content-pipeline/seed-golden-slice.mjs`, confirm it reports success (rows/components, no unexpected TTS spend), and SQL-verify the batch order surfaces `ph-kafija` locked then unlockable.

- [ ] **Step 8: Commit** (`fix(seed): cluster unlock phrase components + deterministic batch order so unlock fires`).

---

## Self-Review

- **Coverage:** Task 1 = audio overlap; Task 2 = diacritic clip; Task 3 = green confirm + intra-card transition; Task 4 = exit X visibility + exit transition; Task 5 = unlock fires. All five device-walk items + the X-visibility bump covered.
- **Locked-rule safety:** Task 3 explicitly preserves the wrong-answer rule and only adds the green path; reduced-motion gating required on every new animation (Tasks 3, 4).
- **No placeholders:** each task names exact files, the root cause, and the concrete fix. Task 5's live-seeder run is gated on user approval (spend/live-DB).
- **Type consistency:** `rightValue` added to `useLoopStage` in Task 3 and consumed by both cards in the same task; `StageFade` interface defined where created.
