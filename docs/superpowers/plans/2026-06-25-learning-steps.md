# Learning Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interleave new-word introduction with immediate recognition quizzing within a session (introduce 3 → quiz those 3 → repeat), and make every word quizzable — including audio-less ones — via the `word/hear` recognition card showing the written word + a (possibly silent) play button.

**Architecture:** A pure `expandLearningSteps(batch, groupSize)` transforms the session batch into interleaved learn→quiz steps using a `retest` copy of each new word. `renderFor` routes `retest` words (and audio-less word reviews) to the `word/hear` recognition MC instead of the intro/learn card. `WordHear` gains the written target word so it's answerable without audio. The session controller applies the transform to its batch; no DB changes.

**Tech Stack:** Expo / React Native (TypeScript), Jest + React Native Testing Library.

## Global Constraints

- **TypeScript everywhere; no `any`** in session/card code (CLAUDE.md).
- **Cards are pure (data-in/events-out)** — `WordHear` receives `item` + callbacks; it must not import services.
- **Pacing constants live in `src/session/pacing.ts`** — no inline literals in the loop.
- **`LEARNING_STEP_GROUP_SIZE = 3`** — introduce 3, then quiz those 3.
- **Day-one cap unchanged** (`DAY_ONE_NEW_CAP = 20`).
- **Audio is optional/non-blocking** (`hasAudio = !!item.audio?.envelope`). The recognition card must render and be tappable with NO audio (silent play, no crash).
- **Production (`word/say`) still requires audio** (it compares against native audio) — audio-less words never route to `word/say`.
- **Wrong-answer-no-advance** behavior in `WordHear` stays exactly as-is.
- **Keep CI green:** `npm run lint && npm run typecheck && npm test` all pass (baseline 607 tests). Run the FULL suite before each commit (filtered runs have masked breakages before).

---

### Task 1: `expandLearningSteps` pure transform (+ `retest` field, group-size constant)

**Files:**
- Create: `src/session/learningSteps.ts`
- Test: `src/session/learningSteps.test.ts`
- Modify: `src/types/reviewItem.ts` (add optional `retest?: boolean`)
- Modify: `src/session/pacing.ts` (add `LEARNING_STEP_GROUP_SIZE`)

**Interfaces:**
- Produces: `expandLearningSteps(batch: ReviewItem[], groupSize: number): ReviewItem[]` and `LEARNING_STEP_GROUP_SIZE` (= 3). Retest copies are `{ ...item, retest: true }`.

- [ ] **Step 1: Add the `retest` field to `ReviewItem`**

In `src/types/reviewItem.ts`, inside `interface ReviewItem`, after the `reps: number;` line (line 51) add:

```ts
  // In-session learning steps: a `retest` copy of a just-introduced new word. renderFor routes
  // retest words to the recognition quiz (word/hear) instead of the intro card. Derived/in-memory
  // only — never persisted.
  retest?: boolean;
```

- [ ] **Step 2: Add the group-size constant**

In `src/session/pacing.ts`, after the `DAY_ONE_NEW_CAP` block (line 7) add:

```ts
/** Learning steps: introduce this many new words, then immediately quiz those same words. */
export const LEARNING_STEP_GROUP_SIZE = 3 as const;
```

- [ ] **Step 3: Write the failing test**

Create `src/session/learningSteps.test.ts`:

```ts
import { expandLearningSteps } from './learningSteps';
import type { ReviewItem } from '../types/reviewItem';

function word(id: string, stage: ReviewItem['stage'] = 'new'): ReviewItem {
  return {
    id, type: 'word', stage, reps: 0, target: id, gloss: id,
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
  };
}
function phrase(id: string): ReviewItem {
  return {
    id, type: 'phrase', stage: 'new', reps: 0, target: id, gloss: id,
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
  };
}

describe('expandLearningSteps', () => {
  it('groups 3 new words: 3 intros then 3 retest quizzes, same ids', () => {
    const out = expandLearningSteps([word('a'), word('b'), word('c')], 3);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    expect(out.slice(0, 3).every((i) => !i.retest)).toBe(true);
    expect(out.slice(3).every((i) => i.retest === true)).toBe(true);
  });

  it('handles a remainder group smaller than groupSize', () => {
    const out = expandLearningSteps([word('a'), word('b'), word('c'), word('d'), word('e')], 3);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'd', 'e', 'd', 'e']);
    // The retest copies (positions 3-5 and 8-9) carry retest:true.
    expect(out[3]!.retest).toBe(true);
    expect(out[8]!.retest).toBe(true);
  });

  it('preserves the original item fields on the retest copy', () => {
    const w = word('a');
    const out = expandLearningSteps([w], 3);
    expect(out[1]).toMatchObject({ id: 'a', type: 'word', target: 'a', retest: true });
  });

  it('passes non-new words through unchanged (already quizzes)', () => {
    const review = word('r', 'review');
    const out = expandLearningSteps([review], 3);
    expect(out).toEqual([review]); // no retest copy
  });

  it('passes phrases through unchanged and only groups the new-word runs', () => {
    const out = expandLearningSteps([word('a'), phrase('p'), word('b')], 3);
    expect(out.map((i) => i.id)).toEqual(['a', 'a', 'p', 'b', 'b']);
    expect(out[1]!.retest).toBe(true); // a's quiz
    expect(out[2]!.type).toBe('phrase'); // phrase untouched, no quiz copy
    expect(out[4]!.retest).toBe(true); // b's quiz
  });

  it('returns [] for an empty batch', () => {
    expect(expandLearningSteps([], 3)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx jest learningSteps`
Expected: FAIL — cannot find module `./learningSteps`.

- [ ] **Step 5: Write the implementation**

Create `src/session/learningSteps.ts`:

```ts
// In-session "learning steps": interleave new-word INTRODUCTION with immediate RECOGNITION
// quizzing. For each run of consecutive new words, present them in groups of `groupSize`, then
// append a retest copy of each word in the group (renderFor routes retest words to word/hear).
// Pure — no clock, no services. Non-new and non-word items pass through unchanged (they are
// already their own tests / have their own flow, e.g. due reviews and phrase gating).
import type { ReviewItem } from '../types/reviewItem';

function isNewWord(item: ReviewItem): boolean {
  return item.type === 'word' && item.stage === 'new';
}

export function expandLearningSteps(batch: ReviewItem[], groupSize: number): ReviewItem[] {
  const out: ReviewItem[] = [];
  let i = 0;
  while (i < batch.length) {
    const item = batch[i]!;
    if (!isNewWord(item)) {
      out.push(item);
      i++;
      continue;
    }
    // Gather the next group of up to `groupSize` consecutive new words.
    const group: ReviewItem[] = [];
    while (i < batch.length && isNewWord(batch[i]!) && group.length < groupSize) {
      group.push(batch[i]!);
      i++;
    }
    for (const w of group) out.push(w); // intros first
    for (const w of group) out.push({ ...w, retest: true }); // then quiz each
  }
  return out;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest learningSteps`
Expected: PASS (6 tests).

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck` → PASS.

```bash
git add src/session/learningSteps.ts src/session/learningSteps.test.ts src/types/reviewItem.ts src/session/pacing.ts
git commit -m "feat(loop): expandLearningSteps — interleave new-word intro with in-session retest

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `renderFor` routes retest + audio-less words to the recognition quiz

**Files:**
- Modify: `src/session/renderFor.ts:26-42`
- Test: `src/session/renderFor.test.ts` (add cases; UPDATE existing audio-less-word expectations)

**Interfaces:**
- Consumes: `ReviewItem.retest` (Task 1).
- Produces: routing — a `retest` word → `word/hear` (or `word/pic-review` if it has an image); an audio-less word review → `word/hear`; an audio word at production rung → `word/say`; a genuine new word (no retest) → `word/learn-*`.

- [ ] **Step 1: Write the failing tests**

Add to `src/session/renderFor.test.ts` (follow the file's existing fixture style; a minimal `ReviewItem` needs `id,type,stage,reps,target,gloss,receptiveReps,productiveReps,translationVisibility`). Add:

```ts
describe('renderFor — learning-step retest + audio-optional recognition', () => {
  const base = {
    reps: 0, target: 'vārds', gloss: 'word',
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' as const,
  };

  it('a retest new word (no audio) routes to word/hear, not a learn card', () => {
    const item = { ...base, id: 'a', type: 'word' as const, stage: 'new' as const, wordClass: 'concrete' as const, retest: true };
    expect(renderFor(item)).toBe('word/hear');
  });

  it('a retest word with an image routes to word/pic-review', () => {
    const item = { ...base, id: 'a', type: 'word' as const, stage: 'new' as const, retest: true, media: { imageUrl: 'x.png' } };
    expect(renderFor(item)).toBe('word/pic-review');
  });

  it('an audio-less word REVIEW routes to word/hear (quizzable without audio)', () => {
    const item = { ...base, id: 'a', type: 'word' as const, stage: 'review' as const, wordClass: 'concrete' as const };
    expect(renderFor(item)).toBe('word/hear');
  });

  it('an audio word at production rung routes to word/say', () => {
    const item = {
      ...base, id: 'a', type: 'word' as const, stage: 'review' as const,
      audio: { envelope: [0.5] }, receptiveReps: 3, productiveReps: 6,
    };
    expect(renderFor(item)).toBe('word/say');
  });

  it('a genuine new word (no retest) still routes to its learn card', () => {
    const item = { ...base, id: 'a', type: 'word' as const, stage: 'new' as const, wordClass: 'concrete' as const };
    expect(renderFor(item)).toBe('word/learn-concrete');
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx jest renderFor -t "learning-step"`
Expected: FAIL (retest word currently routes to `word/learn-concrete`; audio-less review currently routes to a learn card).

- [ ] **Step 3: Implement the routing change**

In `src/session/renderFor.ts`, change the new-word guard (lines 26-30) to exclude retests, and replace the word-review block (lines 33-42) to drop the audio-less→learn fallback and gate `word/say` on audio:

```ts
  // New words: first exposure → the learn template chosen by word class.
  // A `retest` copy is NOT a first exposure — it falls through to the recognition quiz below.
  if (item.stage === 'new' && item.type === 'word' && !item.retest) {
    if (item.wordClass === 'concrete') return 'word/learn-concrete';
    if (item.wordClass === 'abstract') return 'word/learn-abstract';
    if (item.wordClass === 'function') return 'word/learn-function';
  }

  // Word reviews + retests. Recognition (word/hear) is audio-OPTIONAL — it shows the written
  // word, so audio-less words are still quizzable (the play button is silent until audio exists).
  if (item.type === 'word') {
    if (item.media?.imageUrl) return 'word/pic-review'; // full loop on picturable words
    // Production (word/say) compares the learner against native audio, so it requires audio.
    if (hasAudio && computeRung(item.receptiveReps ?? 0, item.productiveReps ?? 0) === 'production') {
      return 'word/say';
    }
    return 'word/hear';
  }
```

- [ ] **Step 4: Update existing tests that asserted the OLD audio-less→learn behavior**

Run `npx jest renderFor` and inspect failures. Any existing case asserting that an **audio-less word review** routes to `word/learn-*` is now intentionally `word/hear` — update those expectations to `'word/hear'`. (Do NOT change new-word intro expectations — those still route to learn.) If an existing test name encodes the old behavior, rename it to describe the new one. Then run the FULL suite and fix any integration suites (e.g. `decideKind`, `sessionController`, `StartingLoop`) that assumed audio-less words show a learn card.

- [ ] **Step 5: Run renderFor tests + full suite**

Run: `npx jest renderFor` → PASS.
Run: `npm test` → PASS (whole suite green).
Run: `npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/session/renderFor.ts src/session/renderFor.test.ts
git commit -m "feat(loop): renderFor routes retest + audio-less words to recognition quiz

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `WordHear` shows the written word + renders without audio

**Files:**
- Modify: `src/screens/WordHear.tsx`
- Test: `src/screens/WordHear.test.tsx`

**Interfaces:**
- Consumes: routing from Task 2 (audio-less + retest words now arrive at `WordHear`).
- Produces: a recognition card that displays `item.target` and renders/operates with `item.audio` absent.

- [ ] **Step 1: Write the failing tests**

Add to `src/screens/WordHear.test.tsx` (follow the file's existing `renderCard`/fixture pattern):

```ts
it('shows the written target word (so it is answerable without audio)', () => {
  const u = renderCard(); // fixture has target e.g. "kabinets"
  expect(u.getByText(u.props.item?.target ?? 'kabinets')).toBeTruthy();
});

it('renders without item.audio and tapping the orb does not throw', () => {
  const u = renderCard({ audio: undefined });
  // The written word + choices still render.
  expect(u.getByText('kabinets')).toBeTruthy();
  // Orb is present and tappable; with no audio it must not crash.
  const orb = u.getByLabelText(/play|listen/i);
  expect(() => fireEvent.press(orb)).not.toThrow();
});
```

> Adapt the fixture accessor to the file's helpers: ensure the test fixture's `target` is a known string (e.g. `'kabinets'`) and that `renderCard({ audio: undefined })` overrides audio. If the orb has no accessibilityLabel, add one in Step 3 (`accessibilityLabel="Play"`) and query by it.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest WordHear`
Expected: FAIL — the target word is not currently rendered.

- [ ] **Step 3: Implement — render the written word, keep audio optional**

In `src/screens/WordHear.tsx`, render `item.target` prominently. After the `<Eyebrow>` line (≈ line 68) and before the waveform `<View style={styles.wave}>`, add a headword:

```tsx
        <Text style={[styles.headword, { color: T.ink }]}>{item.target}</Text>
```

Add to the `StyleSheet.create` block:

```ts
  headword: { fontFamily: fonts.headline, fontSize: 30, fontWeight: '600', textAlign: 'center', marginTop: 6 },
```

Add the imports the new code needs if missing: `Text` (from `react-native` — already imported), and `fonts` from `../theme/tokens` (add `import { fonts } from '../theme/tokens';` if not present). Ensure the `PlayOrb` has `accessibilityLabel="Play"` if the test queries it by label.

The card already optional-chains audio (`usePlayClip(item.audio?.envelope)`, `LiveWaveform envelope={item.audio?.envelope}`), so it renders with no audio. Verify the orb's `replay()` path does not throw when `item.audio` is undefined (the `onPlay('native', speed)` callback resolves to a no-op when there is no native url). If pressing the orb throws in the test, guard `replay` so it is a no-op when `!item.audio?.nativeUrl` and there is no envelope.

- [ ] **Step 4: Run WordHear tests + full suite**

Run: `npx jest WordHear` → PASS.
Run: `npm test` → PASS (snapshot for WordHear will change — update it with `npx jest WordHear -u` and eyeball the diff: it should only add the headword text).
Run: `npm run lint && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WordHear.tsx src/screens/WordHear.test.tsx
git commit -m "feat(loop): WordHear shows the written word; works without audio (silent play)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire `expandLearningSteps` into the session controller

**Files:**
- Modify: `src/session/sessionController.ts:54-64` (the `reload` callback)
- Test: `src/session/sessionController.test.tsx` (add an interleaving case)

**Interfaces:**
- Consumes: `expandLearningSteps` + `LEARNING_STEP_GROUP_SIZE` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to `src/session/sessionController.test.tsx` a case that drives the hook with a fake `srs` returning new words and asserts the queue is interleaved. Follow the file's existing harness for rendering `useSession` with a fake `ServiceBundle`. The assertion: with a `getDueBatch` of 4 new words, `total` becomes 8 (4 intros + 4 retests), and stepping through yields learn kinds for the first 3 then a `word/hear` for the retest of the first group. Minimal shape:

```ts
it('interleaves new-word intros with in-session retest quizzes', async () => {
  const newWords = ['a', 'b', 'c', 'd'].map((id) => ({
    id, type: 'word' as const, stage: 'new' as const, reps: 0, target: id, gloss: id,
    wordClass: 'concrete' as const, receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' as const,
  }));
  const services = makeFakeServices({ getDueBatch: async () => newWords }); // use the file's fake-services helper
  const { result } = renderHook(() => useSession(), { wrapper: withServices(services) });
  await waitFor(() => expect(result.current.loading).toBe(false));
  // 4 new words -> 4 intros + 4 retests, grouped 3 then 1.
  expect(result.current.total).toBe(8);
});
```

> Use the test file's existing helpers for building fake services and the provider wrapper (match how the other tests in this file render `useSession`). If the file has no `renderHook` harness, assert via the same mechanism the existing tests use to read `total`/kinds.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest sessionController -t "interleaves"`
Expected: FAIL — `total` is 4 (no expansion yet).

- [ ] **Step 3: Implement the wiring**

In `src/session/sessionController.ts`, add the import near the top (after line 7):

```ts
import { expandLearningSteps } from './learningSteps';
import { LEARNING_STEP_GROUP_SIZE } from './pacing';
```

In `reload` (lines 57-58), expand the batch before queueing:

```ts
    const items = await srs.getDueBatch();
    setQueue(expandLearningSteps(items, LEARNING_STEP_GROUP_SIZE));
```

- [ ] **Step 4: Run the test + full suite**

Run: `npx jest sessionController` → PASS.
Run: `npm test` → PASS (whole suite green).
Run: `npm run lint && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/sessionController.ts src/session/sessionController.test.tsx
git commit -m "feat(loop): session controller interleaves intro + retest via expandLearningSteps

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Recognition card works without audio (shows written word + silent play) → Task 3. ✓
- renderFor: retest → quiz, audio-less → word/hear, production needs audio, genuine-new → learn → Task 2. ✓
- Pure interleaving transform (groups of 3, remainder, non-word/non-new pass-through) → Task 1. ✓
- `retest` field, `LEARNING_STEP_GROUP_SIZE` → Task 1. ✓
- Controller wiring → Task 4. ✓
- Out-of-scope (TTS, phrase interleaving, Anki gaps, cap changes) → not built. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The two "adapt to the file's existing helpers" notes (Task 3 fixture accessor, Task 4 fake-services harness) point at concrete existing patterns rather than leaving logic unspecified.

**Type consistency:** `expandLearningSteps(batch, groupSize)` and `LEARNING_STEP_GROUP_SIZE` identical across Tasks 1 & 4. `retest?: boolean` on `ReviewItem` used consistently in Tasks 1, 2. renderFor return strings (`word/hear`, `word/pic-review`, `word/say`, `word/learn-*`) match `ReviewCardKind`. `hasAudio` / `computeRung` already exist in renderFor.
