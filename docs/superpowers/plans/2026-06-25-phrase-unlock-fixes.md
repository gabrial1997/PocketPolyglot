# Phrase Unlock Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make phrase unlock gate on getting component words *right* (not mere exposure), and let audio-less phrases flow through the loop (locked → unlock + chime → `phrase/hear`) so the feature isn't dormant.

**Architecture:** Three small, independent changes to the session core: (1) the in-session "known" overlay only counts correct answers; (2) `PhraseHear` is safe with no audio; (3) the batch selector admits audio-less phrases and `renderFor` routes them to the audio-optional `phrase/hear` (not the choice-less `phrase/meaning`).

**Tech Stack:** Expo / React Native (TypeScript), Jest + React Native Testing Library.

## Global Constraints

- **TypeScript everywhere; no `any`.** Cards stay pure (data-in/events-out; no service imports).
- **Audio is optional/non-blocking** (`hasAudio = !!item.audio?.envelope`); audio-less cards render the written form + a silent play orb, no crash.
- **`phrase/sayit` (production) still requires audio** — audio-less phrases must NOT reach it (they only ever route to `phrase/hear`).
- **`phrase/meaning` is intentionally NOT used for audio-less phrases** — it renders from `item.choices`, which phrases never get; restoring it is a separate follow-up, OUT OF SCOPE here.
- **Keep CI green:** run the FULL `npm test` (baseline 621 passing), `npm run typecheck`, `npm run lint` before each commit.
- **Do not change** the i+1 tolerance, anchor-recall rule, or the `known_lemmas` stage definition.

---

### Task 1: Correctness gate on the in-session known overlay

**Files:**
- Modify: `src/session/sessionController.ts` (the `submit` callback, ~line 98-100)
- Test: `src/session/sessionController.test.tsx`

**Interfaces:**
- Produces: a word is added to `learned.current` only when `item.type === 'word' && result.correct === true`.

- [ ] **Step 1: Write the failing test**

Add to `src/session/sessionController.test.tsx`, adapting to the file's existing hook harness (how it renders `useSession` with a fake `ServiceBundle` and reads `result.current`). Use **`stage: 'review'`** component words so `expandLearningSteps` leaves them unexpanded (it only doubles `stage:'new'` words). The fake `getDueBatch` returns a component word followed by a phrase whose `componentLemmaIds` is that word:

```ts
it('a WRONG answer on a component word does NOT unlock its phrase (correctness-gated)', async () => {
  const wordA = { id: 'a', type: 'word' as const, stage: 'review' as const, reps: 1, target: 'a', gloss: 'a',
    wordClass: 'concrete' as const, receptiveReps: 1, productiveReps: 0, translationVisibility: 'auto' as const };
  const phraseP = { id: 'p', type: 'phrase' as const, stage: 'new' as const, reps: 0, target: 'p', gloss: 'p',
    componentLemmaIds: ['a'], receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' as const };
  const services = makeFakeServices({ getDueBatch: async () => [wordA, phraseP] }); // file's helper; known.all() empty
  const { result } = renderHook(() => useSession(), { wrapper: withServices(services) });
  await waitFor(() => expect(result.current.loading).toBe(false));
  // First item is wordA → submit it WRONG.
  await act(async () => { await result.current.submit({ itemId: 'a', cardKind: 'word/hear', correct: false, spoke: false }); });
  // Phrase 'a' is still unknown (wrong answer didn't count) → phrase stays locked.
  expect(result.current.current?.kind).toBe('phrase/locked');
});

it('a CORRECT answer on a component word lets its phrase unlock', async () => {
  // identical setup …
  await act(async () => { await result.current.submit({ itemId: 'a', cardKind: 'word/hear', correct: true, spoke: false }); });
  expect(result.current.current?.kind).not.toBe('phrase/locked');
});
```

> Adapt `makeFakeServices` / `withServices` / `renderHook` to the actual helpers in the file. The behavioral assertions (wrong → still `phrase/locked`; right → not locked) are the contract.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest sessionController -t "component word"`
Expected: FAIL — today the wrong answer still adds `a` to `learned`, so the phrase already shows not-locked.

- [ ] **Step 3: Implement the gate**

In `src/session/sessionController.ts`, in `submit`, change the overlay add (currently around line 98):

```ts
// before:
// if (item && item.type === 'word') learned.current.add(item.id);
// after:
// Only a word answered CORRECTLY counts toward unlocking phrases — the intro/learn cards emit no
// `correct` (exposure ≠ learned); recall cards emit correct:!missed. Exposure alone must not unlock.
if (item && item.type === 'word' && result.correct === true) learned.current.add(item.id);
```

- [ ] **Step 4: Run the test + full suite**

Run: `npx jest sessionController` → PASS.
Run: `npm test` → PASS (watch StartingLoop / onboarding integration suites — they drive real component-word → phrase unlock; if any used the learn/intro card to "learn" a component, it must now use a correct recall answer. Update those to submit a correct recall result where they relied on exposure).
Run: `npm run typecheck && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/sessionController.ts src/session/sessionController.test.tsx <any integration test you updated>
git commit -m "fix(loop): phrase unlock counts a component word only when answered correctly

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `PhraseHear` is safe with no audio

**Files:**
- Modify: `src/screens/PhraseHear.tsx` (the mount auto-play effect)
- Test: `src/screens/PhraseHear.test.tsx`

**Interfaces:**
- Produces: `PhraseHear` renders with `item.audio` undefined and its mount auto-play is a no-op (no throw). Consumed by Task 3 (audio-less phrases route here).

- [ ] **Step 1: Write the failing test**

Add to `src/screens/PhraseHear.test.tsx` (follow its `renderCard`/fixture pattern; the fixture likely has audio — override it off):

```ts
it('renders with no audio and the mount auto-play does not throw', () => {
  expect(() => renderCard({ audio: undefined })).not.toThrow();
  const u = renderCard({ audio: undefined });
  // The written phrase still renders (exposure card needs no audio).
  expect(u.getByText(u.props.item?.target ?? 'labrīt')).toBeTruthy();
});
```

> If the fixture's `onPlay` would be invoked by the mount auto-play and the harness throws when audio is absent, this test fails until Step 3 guards it. Adapt the fixture accessor to the file's helpers.

- [ ] **Step 2: Run to verify it fails (or confirm already-safe)**

Run: `npx jest PhraseHear -t "no audio"`
Expected: FAIL if the mount auto-play throws with no clip. (If it already passes, the card is already safe — keep the test as a regression guard and skip Step 3's code change, noting that in the report.)

- [ ] **Step 3: Guard the mount auto-play**

In `src/screens/PhraseHear.tsx`, change the mount effect so it only auto-plays when there is actually a clip:

```tsx
  useEffect(() => {
    onPreload?.('native'); // warm the clip so the auto-play starts without a load stall
    // Only auto-play when the phrase actually has audio — audio-less phrases show the written form
    // with a silent play orb (tapping it is likewise a no-op until audio exists).
    if (item.audio?.nativeUrl || item.audio?.envelope) playClip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: Run the test + full suite**

Run: `npx jest PhraseHear` → PASS (existing play-once test still green — it uses a fixture WITH audio, so auto-play still fires once).
Run: `npm test` → PASS.
Run: `npm run typecheck && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/PhraseHear.tsx src/screens/PhraseHear.test.tsx
git commit -m "fix(loop): PhraseHear renders safely with no audio (silent play orb)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Admit audio-less phrases + route them to `phrase/hear`

**Files:**
- Modify: `src/session/selectBatch.ts` (remove the phrase audio gate, ~line 188-192)
- Modify: `src/session/renderFor.ts` (phrase block: audio-less → `phrase/hear`)
- Test: `src/session/selectBatch.test.ts`, `src/session/renderFor.test.ts`

**Interfaces:**
- Consumes: `PhraseHear` audio-safety (Task 2).
- Produces: audio-less phrases are admitted by `selectBatch` and route to `phrase/hear`.

- [ ] **Step 1: Write the failing tests**

In `src/session/renderFor.test.ts`, add (and UPDATE any existing case asserting an audio-less phrase routes to `phrase/meaning` — that expectation flips to `phrase/hear`):

```ts
it('an audio-less phrase routes to phrase/hear (not the choice-less phrase/meaning)', () => {
  const item = { id: 'p', type: 'phrase' as const, stage: 'new' as const, reps: 0, target: 'labrīt', gloss: 'good morning',
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' as const };
  expect(renderFor(item)).toBe('phrase/hear');
});
```

In `src/session/selectBatch.test.ts`, add a case (follow the file's existing `Candidate`/`SelectContext` fixture builders) where an audio-less phrase with its anchor recalled and components known is now ADMITTED:

```ts
it('admits an audio-less phrase whose anchor is recalled and components are known', () => {
  // Build a phrase candidate with hasAudioEnvelope:false, componentLemmaIds:['a'], anchorLemmaId:'a';
  // ctx.knownLemmaIds has 'a', ctx.recalledLemmaIds has 'a'. Assert the phrase id appears in the order.
  // (Use the file's existing helpers; mirror an existing "admits a phrase" test but flip hasAudioEnvelope to false.)
});
```

> Fill the selectBatch test body from the file's existing phrase-admission test (there is almost certainly one that builds a phrase Candidate + SelectContext); copy it and set `hasAudioEnvelope: false`, asserting the phrase is still admitted.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest renderFor -t "audio-less phrase"` and `npx jest selectBatch -t "audio-less phrase"`
Expected: FAIL — renderFor returns `phrase/meaning`; selectBatch drops the phrase at the audio gate.

- [ ] **Step 3a: Remove the phrase audio gate in `selectBatch.ts`**

Delete the phrase audio gate block (around line 188-192):

```ts
    // ------------------------------------------------------------------
    // Gate (a): Audio gate (phrases only — words always eligible)
    // ------------------------------------------------------------------
    if (candidate.kind === 'phrase' && !candidate.hasAudioEnvelope) {
      continue;
    }
```

Leave the i+1 gate (b) and the anchor-recalled check intact. Do NOT touch the pairs audio gate later in the file (`if (!candidate.hasAudioEnvelope) continue;` inside the pairs loop) — drills genuinely need audio.

- [ ] **Step 3b: Route audio-less phrases to `phrase/hear` in `renderFor.ts`**

In the phrase block of `src/session/renderFor.ts`, change the audio-less branch:

```ts
  // Phrase reviews. (locked/unlock handled by the controller, not here.)
  if (item.type === 'phrase') {
    // Audio-less phrases use the exposure card (written phrase + silent orb). phrase/meaning is NOT
    // used — it renders from item.choices, which phrases don't have. (Restoring it = separate task.)
    if (!hasAudio) return 'phrase/hear';
    if (item.stage === 'new') return 'phrase/hear'; // first exposure
    if (item.isIdiom) return 'phrase/meaning';
    return computeRung(item.receptiveReps ?? 0, item.productiveReps ?? 0) === 'production'
      ? 'phrase/sayit'
      : 'phrase/hear';
  }
```

- [ ] **Step 4: Run tests + full suite**

Run: `npx jest renderFor selectBatch` → PASS (update any other existing audio-less-phrase expectation that broke).
Run: `npm test` → PASS (whole suite green; watch StartingLoop / decideKind / sessionController suites that exercise phrase flow).
Run: `npm run typecheck && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/selectBatch.ts src/session/renderFor.ts src/session/selectBatch.test.ts src/session/renderFor.test.ts
git commit -m "feat(loop): admit audio-less phrases + route them to phrase/hear exposure

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- #1 correctness gate (`result.correct === true`) → Task 1. ✓
- #2 admit audio-less phrases (remove selectBatch gate) → Task 3a. ✓
- #2 route audio-less phrases to `phrase/hear` (not `phrase/meaning`) → Task 3b. ✓
- #2 `PhraseHear` audio-safe → Task 2. ✓
- `phrase/sayit` stays audio-gated → preserved (audio-less only ever returns `phrase/hear`). ✓
- `phrase/meaning` deferred / out of scope → not touched. ✓

**Placeholder scan:** No TBD/TODO. The two "adapt to the file's existing helpers" notes (Task 1 hook harness, Task 3 selectBatch fixture) point at concrete existing patterns and give the exact behavioral assertion + fixture deltas; not unspecified logic.

**Type consistency:** `result.correct === true` matches `CardResult.correct?: boolean`. `renderFor` returns `phrase/hear` (a valid `ReviewCardKind`). `hasAudio`/`computeRung` already exist in renderFor. `componentLemmaIds`/`anchorLemmaId`/`recalledLemmaIds`/`knownLemmaIds` are the existing selectBatch field names.
