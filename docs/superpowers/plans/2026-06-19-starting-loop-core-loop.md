# Starting Loop + Core-Loop Correctness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phrase unlock loop fire live (locked → learn words → unlock reveal → hear), seed the two starting-loop phrases that exercise it, and lock in that the SRS records misses.

**Architecture:** Phrases are introduced by a generic loop driven entirely by `sessionController`: an in-session "learned" overlay makes learning a word change lock state immediately, and a mutable working queue re-surfaces a locked phrase after its component words so it resolves locked → unlock → hear. Gate cards (`phrase/locked`, `phrase/unlock`) never post to FSRS and the unlock is shown once. Content + new-card order are data (seed + a `getDueBatch` `ORDER BY`).

**Tech Stack:** Expo / React Native (TypeScript), Supabase (Postgres), Jest + @testing-library/react-native, FSRS (`ts-fsrs`), Node seeder (`content-pipeline/`), OpenAI TTS.

## Global Constraints

- Cards are pure (data-in / events-out): never import a service, never fetch, render only from `item` + props. (`CLAUDE.md`)
- `phrase/locked` and `phrase/unlock` are **gate cards**: they call `onAdvance`/`onUnlocked`, produce **no `CardResult`**, and **never** reach `srs.submit` (no FSRS). The unlock reveal is seen **once** per phrase.
- Wrong answers do **not** advance; honest first-try `correct: !missed`. Never reveal the correct answer. Copy: "Not quite — give it another try."
- No time claims in copy ("10 minutes", etc.). Calm, not gamified; the unlock chime is the only celebratory beat.
- The two starting phrases, verbatim: `Labdien, es esmu ___.` (Hello, I am ___.) and `Kā tev iet?` (How are you?). Native (Elizabete) sign-off is a follow-up, not a blocker.
- Gate green on every commit: `npx tsc --noEmit && npx eslint . && npx jest`.
- Card `id`+`k` (CardKind) strings stay stable.

## File map

- `src/session/phraseGate.ts` — change unlock threshold to all-words-known (Task 1).
- `src/session/decideKind.ts` — add `revealed` set; unlock-once → else hear (Task 2).
- `src/session/requeue.ts` — **new** pure helpers for the working queue (Task 3).
- `src/session/sessionController.ts` — learned overlay + working queue + re-queue (Task 3).
- `src/screens/PhraseUnlock.tsx` — show English meaning (Task 4).
- `src/screens/PhraseHear.tsx` — say-then-repeat playback (Task 5).
- `src/services/supabase/SupabaseSrsService.ts` — `ORDER BY` in `getDueBatch` (Task 6).
- `content-pipeline/golden-slice.json` + `content-pipeline/seed-golden-slice.mjs` — seed the 8 items + ordered due_at + chime hash check (Task 7).
- `src/services/supabase/mappers.test.ts` (+ audit) — pin the lapse path (Task 8).

---

### Task 1: Strict phrase gate (unlock only when all words known)

**Files:**
- Modify: `src/session/phraseGate.ts`
- Test: `src/session/phraseGate.test.ts`

**Interfaces:**
- Produces: `lockState(componentLemmaIds: string[], known: ReadonlySet<string>): { locked: boolean; unknownCount: number }` — now `locked === (unknownCount > 0)`.

- [ ] **Step 1: Update the failing tests** in `src/session/phraseGate.test.ts` — a phrase with exactly one unknown component is now LOCKED (was available under i+1).

```ts
import { lockState } from './phraseGate';

const known = new Set(['a', 'b']);

it('is locked while ANY component word is unknown (all-words-known gate)', () => {
  expect(lockState(['a', 'b', 'c'], known)).toEqual({ locked: true, unknownCount: 1 });
  expect(lockState(['a', 'c', 'd'], known)).toEqual({ locked: true, unknownCount: 2 });
});

it('is available only when every component word is known', () => {
  expect(lockState(['a', 'b'], known)).toEqual({ locked: false, unknownCount: 0 });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx jest src/session/phraseGate.test.ts`
Expected: FAIL — current code returns `locked:false` for one unknown (`unknownCount:1`).

- [ ] **Step 3: Implement** — change the threshold and the comment in `src/session/phraseGate.ts`:

```ts
// Pure phrase-gate logic. A phrase is AVAILABLE only when ALL its component lemmas are known
// ("Unlocks when its words are known" — the mockup). LOCKED while any component is still unknown.
// The controller turns a locked→available transition into the one-time 'phrase/unlock' reveal.
export interface LockState {
  locked: boolean;
  unknownCount: number;
}

export function lockState(componentLemmaIds: string[], known: ReadonlySet<string>): LockState {
  const unknownCount = componentLemmaIds.filter((id) => !known.has(id)).length;
  return { locked: unknownCount > 0, unknownCount };
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `npx jest src/session/phraseGate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/phraseGate.ts src/session/phraseGate.test.ts
git commit -m "feat(gate): phrase unlocks only when ALL component words known"
```

---

### Task 2: `decideKind` — show unlock once, then hear

**Files:**
- Modify: `src/session/decideKind.ts`
- Test: `src/session/decideKind.test.ts`

**Interfaces:**
- Consumes: `lockState` (Task 1).
- Produces: `decideKind(item, known, seenLocked, revealed): { kind: CardKind; nowUnlocked: boolean }` — new 4th param `revealed: ReadonlySet<string>` (phrase ids whose unlock reveal has been shown). `nowUnlocked` is true only on the single unlock render.

- [ ] **Step 1: Write/extend the failing test** in `src/session/decideKind.test.ts`:

```ts
import { decideKind } from './decideKind';
import type { ReviewItem } from '../types/reviewItem';

const phrase = (overrides: Partial<ReviewItem> = {}): ReviewItem => ({
  id: 'p1', type: 'phrase', stage: 'new', reps: 0,
  target: 'Labdien, es esmu ___.', gloss: 'Hello, I am ___.',
  audio: { nativeUrl: 'p1.mp3' }, componentLemmaIds: ['labdien', 'es', 'esmu'],
  ...overrides,
});
const empty = new Set<string>();

it('locked while any word unknown', () => {
  const k = new Set(['labdien']);
  expect(decideKind(phrase(), k, empty, empty).kind).toBe('phrase/locked');
});

it('reveals unlock ONCE when all words known and it was seen locked', () => {
  const k = new Set(['labdien', 'es', 'esmu']);
  const seen = new Set(['p1']);
  const r = decideKind(phrase(), k, seen, empty);
  expect(r.kind).toBe('phrase/unlock');
  expect(r.nowUnlocked).toBe(true);
});

it('after the unlock is revealed, resolves to the review kind (hear for a new phrase)', () => {
  const k = new Set(['labdien', 'es', 'esmu']);
  const seen = new Set(['p1']);
  const revealed = new Set(['p1']);
  expect(decideKind(phrase(), k, seen, revealed).kind).toBe('phrase/hear');
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx jest src/session/decideKind.test.ts`
Expected: FAIL — `decideKind` takes 3 args; the "after revealed" case still returns `phrase/unlock`.

- [ ] **Step 3: Implement** `src/session/decideKind.ts`:

```ts
import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';
import { renderFor } from './renderFor';
import { lockState } from './phraseGate';

export function decideKind(
  item: ReviewItem,
  known: ReadonlySet<string>,
  seenLocked: ReadonlySet<string>,
  revealed: ReadonlySet<string>,
): { kind: CardKind; nowUnlocked: boolean } {
  if (item.type === 'phrase' && item.componentLemmaIds) {
    const { locked } = lockState(item.componentLemmaIds, known);
    if (locked) return { kind: 'phrase/locked', nowUnlocked: false };
    // One-time reveal: only if it was seen locked AND we have not shown the reveal yet.
    if (seenLocked.has(item.id) && !revealed.has(item.id)) {
      return { kind: 'phrase/unlock', nowUnlocked: true };
    }
  }
  return { kind: renderFor(item), nowUnlocked: false };
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `npx jest src/session/decideKind.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/decideKind.ts src/session/decideKind.test.ts
git commit -m "feat(session): decideKind reveals phrase/unlock once, then hear"
```

---

### Task 3: `sessionController` — live unlock (learned overlay + working queue)

**Files:**
- Create: `src/session/requeue.ts`
- Create: `src/session/requeue.test.ts`
- Modify: `src/session/sessionController.ts`
- Test: `src/session/sessionController.test.tsx`

**Interfaces:**
- Consumes: `decideKind` (4-arg, Task 2).
- Produces: `requeuePhraseAfterComponents(queue, fromPos, phrase): ReviewItem[]`, `requeueNext(queue, fromPos, phrase): ReviewItem[]`, and `lockHint(queue: ReviewItem[], phrase: ReviewItem, known: ReadonlySet<string>): { lockRemaining: number; lockLemma?: string }` — all pure. `useSession()` keeps its `SessionState` shape (`sessionController.ts:11-30`), now driven by a mutable working queue; when it renders a locked phrase it merges `lockHint(...)` onto `current.item` so the card shows "N words to go — learn X".

- [ ] **Step 1: Write failing tests for the pure helpers** in `src/session/requeue.test.ts`:

```ts
import { requeuePhraseAfterComponents, requeueNext } from './requeue';
import type { ReviewItem } from '../types/reviewItem';

const word = (id: string): ReviewItem => ({ id, type: 'word', stage: 'new', reps: 0, target: id, gloss: id, audio: { nativeUrl: `${id}.mp3` } });
const phrase: ReviewItem = { id: 'p1', type: 'phrase', stage: 'new', reps: 0, target: 'P', gloss: 'P', audio: { nativeUrl: 'p.mp3' }, componentLemmaIds: ['labdien', 'es', 'esmu'] };

it('re-queues a phrase right after the last of its component words ahead', () => {
  const q = [phrase, word('labdien'), word('es'), word('esmu'), word('ka')];
  // from pos 0 (the locked phrase), insert after 'esmu' (index 3)
  const out = requeuePhraseAfterComponents(q, 0, phrase);
  expect(out.map((i) => i.id)).toEqual(['p1', 'labdien', 'es', 'esmu', 'p1', 'ka']);
});

it('re-queues immediately next when no component words remain ahead', () => {
  const q = [phrase, word('ka')];
  const out = requeueNext(q, 0, phrase);
  expect(out.map((i) => i.id)).toEqual(['p1', 'p1', 'ka']);
});

it('lockHint reports words-remaining and the next word to learn (its lemma text from the queue)', () => {
  const q = [phrase, word('labdien'), word('es'), word('esmu')];
  expect(lockHint(q, phrase, new Set(['labdien']))).toEqual({ lockRemaining: 2, lockLemma: 'es' });
  expect(lockHint(q, phrase, new Set())).toEqual({ lockRemaining: 3, lockLemma: 'labdien' });
});
```

(Add `lockHint` to the import in this test file.)

- [ ] **Step 2: Run, expect failure**

Run: `npx jest src/session/requeue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/session/requeue.ts`:

```ts
import type { ReviewItem } from '../types/reviewItem';

/** Insert `phrase` right after the LAST of its component words that appears after `fromPos`.
 *  If none appear ahead, append to the end. Returns a new array (pure). */
export function requeuePhraseAfterComponents(
  queue: ReviewItem[],
  fromPos: number,
  phrase: ReviewItem,
): ReviewItem[] {
  const ids = new Set(phrase.componentLemmaIds ?? []);
  let lastCompIdx = -1;
  for (let i = fromPos + 1; i < queue.length; i++) {
    if (ids.has(queue[i].id)) lastCompIdx = i;
  }
  const insertAt = lastCompIdx === -1 ? queue.length : lastCompIdx + 1;
  return [...queue.slice(0, insertAt), phrase, ...queue.slice(insertAt)];
}

/** Insert `phrase` as the very next item after `fromPos`. Returns a new array (pure). */
export function requeueNext(queue: ReviewItem[], fromPos: number, phrase: ReviewItem): ReviewItem[] {
  const at = fromPos + 1;
  return [...queue.slice(0, at), phrase, ...queue.slice(at)];
}

/** Lock-card hint: how many component words remain unknown, and the lemma TEXT of the next one to
 *  learn (looked up from the word item already in the queue). Pure — drives the "N words to go —
 *  learn X" copy on phrase/locked. */
export function lockHint(
  queue: ReviewItem[],
  phrase: ReviewItem,
  known: ReadonlySet<string>,
): { lockRemaining: number; lockLemma?: string } {
  const unknownIds = (phrase.componentLemmaIds ?? []).filter((id) => !known.has(id));
  const nextId = unknownIds[0];
  const lockLemma = nextId ? queue.find((i) => i.id === nextId)?.target : undefined;
  return { lockRemaining: unknownIds.length, lockLemma };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx jest src/session/requeue.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing controller integration test** — extend `src/session/sessionController.test.tsx` with a starting-loop walk. Use the existing test's service-fake pattern (it already builds a fake `srs`/`known`). Batch = `[P1, labdien, es, esmu]`, known starts empty.

```ts
it('runs the live unlock loop: locked -> learn words -> unlock once -> hear', async () => {
  const labdien = word('labdien'), es = word('es'), esmu = word('esmu');
  const p1: ReviewItem = {
    id: 'p1', type: 'phrase', stage: 'new', reps: 0, target: 'Labdien, es esmu ___.',
    gloss: 'Hello, I am ___.', audio: { nativeUrl: 'p1.mp3' },
    componentLemmaIds: ['labdien', 'es', 'esmu'],
  };
  const { result } = renderSession([p1, labdien, es, esmu], /* known */ []);

  await waitFor(() => expect(result.current.current?.kind).toBe('phrase/locked'));
  act(() => result.current.advance());                 // gate, re-queues p1 after esmu
  // learn the three words (submit each)
  for (const w of ['labdien', 'es', 'esmu']) {
    await waitFor(() => expect(result.current.current?.item.id).toBe(w));
    await act(async () => { await result.current.submit({ itemId: w, cardKind: 'word/learn-function', spoke: false }); });
  }
  await waitFor(() => expect(result.current.current?.kind).toBe('phrase/unlock')); // reveal once
  act(() => result.current.advance());                 // gate, re-queues p1 next as hear
  await waitFor(() => expect(result.current.current?.kind).toBe('phrase/hear'));
});
```

(If the suite has no `renderSession`/`renderHook` helper, add a thin `renderHook(useSession, { wrapper })` matching the existing provider setup in that file; `word(id)` is the same factory as Task 3 Step 1.)

- [ ] **Step 6: Run, expect failure**

Run: `npx jest src/session/sessionController.test.tsx`
Expected: FAIL — unlock never appears (known-set not updated; phrase not re-queued).

- [ ] **Step 7: Implement the controller** `src/session/sessionController.ts`. Replace the `batch`/`index`/`item` core with a working queue + overlay + revealed set; keep the `SessionState` shape:

```ts
export function useSession(): SessionState {
  const { srs, known } = useServices();
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastReviewLabel, setLastReviewLabel] = useState<string | null>(null);
  const seenLocked = useRef<Set<string>>(new Set());
  const revealed = useRef<Set<string>>(new Set());
  const learned = useRef<Set<string>>(new Set()); // optimistic in-session known overlay (lemma ids)

  const reload = useCallback(async () => {
    setLoading(true);
    await known.refresh();
    const items = await srs.getDueBatch();
    setQueue(items);
    setPos(0);
    seenLocked.current = new Set();
    revealed.current = new Set();
    learned.current = new Set();
    setLoading(false);
  }, [srs, known]);

  useEffect(() => { void reload(); }, [reload]);

  const item = queue[pos];

  const knownUnion = useMemo(
    () => new Set<string>([...known.all(), ...learned.current]),
    // recompute when the item changes (after each advance/submit) — learned mutates between renders
    [item, known],
  );

  const decided = useMemo(
    () => (item ? decideKind(item, knownUnion, seenLocked.current, revealed.current) : null),
    [item, knownUnion],
  );
  const kind = decided?.kind ?? null;

  // Record locked phrases AFTER render (keep the memo pure).
  useEffect(() => {
    if (item && kind === 'phrase/locked') seenLocked.current.add(item.id);
    if (item && kind === 'phrase/unlock') revealed.current.add(item.id);
  }, [item, kind]);

  const submit = useCallback(
    async (result: CardResult) => {
      // A learned word immediately changes lock state for later phrases (optimistic overlay).
      if (item && item.type === 'word') learned.current.add(item.id);
      const { nextReviewLabel } = await srs.submit(result);
      setLastReviewLabel(nextReviewLabel);
      setPos((p) => p + 1);
    },
    [srs, item],
  );

  // Gate advance (locked/unlock): NO srs.submit. Re-queue the phrase so it re-surfaces.
  const advance = useCallback(() => {
    if (item && item.type === 'phrase' && kind === 'phrase/locked') {
      setQueue((q) => requeuePhraseAfterComponents(q, pos, item));
    } else if (item && item.type === 'phrase' && kind === 'phrase/unlock') {
      setQueue((q) => requeueNext(q, pos, item)); // re-surface immediately as hear
    }
    setPos((p) => p + 1);
  }, [item, kind, pos]);

  const done = !loading && pos >= queue.length;

  // On the locked card, enrich the item with the live "N words to go — learn X" hint.
  const current = item && kind
    ? { item: kind === 'phrase/locked' ? { ...item, ...lockHint(queue, item, knownUnion) } : item, kind }
    : null;

  return {
    loading, done,
    current,
    step: Math.min(pos + 1, queue.length || 1),
    total: queue.length,
    lastReviewLabel, submit, advance, reload,
  };
}
```

Add the import: `import { requeuePhraseAfterComponents, requeueNext, lockHint } from './requeue';`. (Note `decideKind` now takes 4 args.) The `lockRemaining`/`lockLemma` fields are already optional on `ReviewItem` (added in installment 2) and consumed by `PhraseLocked.tsx`.

- [ ] **Step 8: Run the controller + full session tests, expect pass**

Run: `npx jest src/session/`
Expected: PASS. If `SessionHost.test.tsx` references `decideKind`/old batch internals, update call sites only (no behavior change).

- [ ] **Step 9: Commit**

```bash
git add src/session/requeue.ts src/session/requeue.test.ts src/session/sessionController.ts src/session/sessionController.test.tsx
git commit -m "feat(session): live phrase unlock via learned overlay + working queue"
```

---

### Task 4: PhraseUnlock shows the English meaning

**Files:**
- Modify: `src/screens/PhraseUnlock.tsx`
- Test: `src/screens/PhraseUnlock.test.tsx`

**Interfaces:**
- Consumes: `PhraseGateProps` (`item`, `onUnlocked`). No contract change.

- [ ] **Step 1: Add the failing test** in `src/screens/PhraseUnlock.test.tsx`:

```ts
it('shows the English meaning on the reveal', () => {
  const u = renderUnlock({ gloss: 'Hello, I am ___.' });
  expect(u.getByText('Hello, I am ___.')).toBeTruthy();
});
```

(Use the file's existing render helper / fixture; add `gloss` to the fixture item.)

- [ ] **Step 2: Run, expect failure**

Run: `npx jest src/screens/PhraseUnlock.test.tsx`
Expected: FAIL — meaning not rendered.

- [ ] **Step 3: Implement** — in `src/screens/PhraseUnlock.tsx`, render `item.gloss` under the phrase (inside the `rise` group, after the `PhraseLine`), above "You know all its words now.":

```tsx
<Animated.View style={[{ marginTop: 16 }, riseStyle]}>
  <PhraseLine phrase={item.target} highlight={(item as { newForm?: string }).newForm} size={32} />
</Animated.View>
<Animated.Text style={[styles.meaning, { color: T.sub }, riseStyle]}>{item.gloss}</Animated.Text>
<Animated.Text style={[styles.sub, { color: T.faint }, riseStyle]}>You know all its words now.</Animated.Text>
```

Add to the StyleSheet: `meaning: { fontSize: 16, marginTop: 10, textAlign: 'center' },` and change `sub` color usage to `T.faint` (the "you know all its words" line demotes below the meaning).

- [ ] **Step 4: Run, expect pass; refresh snapshot**

Run: `npx jest src/screens/PhraseUnlock.test.tsx -u`
Expected: PASS (snapshot updated).

- [ ] **Step 5: Commit**

```bash
git add src/screens/PhraseUnlock.tsx src/screens/PhraseUnlock.test.tsx src/screens/__snapshots__/PhraseUnlock.test.tsx.snap
git commit -m "feat(phrase/unlock): show the English meaning on the reveal"
```

---

### Task 5: PhraseHear says the phrase, then repeats it

**Files:**
- Modify: `src/screens/PhraseHear.tsx`
- Test: `src/screens/PhraseHear.test.tsx`

**Interfaces:**
- Consumes: `BaseCardProps` (`item`, `onPlay`, `onComplete`). No contract change. `onPlay('native')` is the play trigger.

- [ ] **Step 1: Add the failing test** in `src/screens/PhraseHear.test.tsx` — on mount the card auto-plays the phrase once, then repeats it once (two `onPlay('native')` calls), using fake timers:

```ts
it('says the phrase then repeats it on first show', () => {
  jest.useFakeTimers();
  const u = renderHear();
  expect(u.props.onPlay).toHaveBeenCalledWith('native');     // says it
  act(() => { jest.advanceTimersByTime(REPEAT_DELAY_MS + 50); });
  expect(u.props.onPlay).toHaveBeenCalledTimes(2);           // repeats it
  jest.useRealTimers();
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx jest src/screens/PhraseHear.test.tsx`
Expected: FAIL — only plays on tap, no auto-play/repeat.

- [ ] **Step 3: Implement** — in `src/screens/PhraseHear.tsx`, export `REPEAT_DELAY_MS` and auto-play once on mount, then schedule one repeat after the clip length. Reuse the existing `playClip` + envelope-length timing:

```tsx
export const REPEAT_DELAY_MS = 700; // gap after the first clip before the repeat

// inside the component, after playClip is defined:
useEffect(() => {
  playClip(); // say it
  const ms = (env && env.length ? env.length * FRAME_MS + TAIL_MS : FALLBACK_MS) + REPEAT_DELAY_MS;
  const t = setTimeout(() => playClip(), ms); // repeat it once
  return () => clearTimeout(t);
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

(Keep the manual `PlayOrb` tap working — it already calls `playClip`.)

- [ ] **Step 4: Run, expect pass**

Run: `npx jest src/screens/PhraseHear.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/PhraseHear.tsx src/screens/PhraseHear.test.tsx
git commit -m "feat(phrase/hear): say the phrase then repeat it on first exposure"
```

---

### Task 6: Deterministic new-card order in `getDueBatch`

**Files:**
- Modify: `src/services/supabase/SupabaseSrsService.ts:59-64`

**Interfaces:**
- Consumes: nothing new. Produces: the due query ordered by `due_at` ascending (nulls last), so seeded `due_at` offsets define curriculum order. (Full freq/unique-sound ordering is the separate #26 spec.)

- [ ] **Step 1: Add `.order` to the due query** in `getDueBatch`:

```ts
const { data: states, error } = await this.client
  .from('review_state')
  .select('*')
  .eq('user_id', this.userId)
  .or(`due_at.lte.${nowIso},stage.eq.new`)
  .order('due_at', { ascending: true, nullsFirst: false });
```

- [ ] **Step 2: Typecheck + run the service-adjacent tests**

Run: `npx tsc --noEmit && npx jest src/services/supabase/`
Expected: PASS (no test asserts order today; this is additive).

- [ ] **Step 3: Commit**

```bash
git add src/services/supabase/SupabaseSrsService.ts
git commit -m "feat(srs): order due batch by due_at so seeded order is curriculum order"
```

---

### Task 7: Seed the starting-loop content (+ ordering + chime check)

**Files:**
- Modify: `content-pipeline/golden-slice.json`
- Modify: `content-pipeline/seed-golden-slice.mjs`

**Interfaces:**
- Consumes: the seeder's existing lemma/phrase/component/review_state insert path. Produces: 8 new rows (6 lemmas, 2 phrases) with TTS audio + envelopes, `phrase_components`, and `review_state(stage:'new')` with staggered `due_at` so order is `[P1, labdien, es, esmu, P2, kā, tev, iet]`.

- [ ] **Step 1: Add the items to `content-pipeline/golden-slice.json`.** Append lemmas:

```json
{ "slug": "labdien", "lemma": "labdien", "gloss": "hello", "wordClass": "function", "pron": "LAHB-dyen", "seedState": { "stage": "new", "reps": 0, "order": 2 } },
{ "slug": "es",      "lemma": "es",      "gloss": "I",     "wordClass": "function", "pron": "ess",        "seedState": { "stage": "new", "reps": 0, "order": 3 } },
{ "slug": "esmu",    "lemma": "esmu",    "gloss": "am",    "wordClass": "function", "pron": "ES-moo",     "seedState": { "stage": "new", "reps": 0, "order": 4 } },
{ "slug": "ka",      "lemma": "kā",      "gloss": "how",   "wordClass": "function", "pron": "kah",        "seedState": { "stage": "new", "reps": 0, "order": 7 } },
{ "slug": "tev",     "lemma": "tev",     "gloss": "you",   "wordClass": "function", "pron": "tev",        "seedState": { "stage": "new", "reps": 0, "order": 8 } },
{ "slug": "iet",     "lemma": "iet",     "gloss": "to go", "wordClass": "function", "pron": "ee-ET",      "seedState": { "stage": "new", "reps": 0, "order": 9 } }
```

Append phrases:

```json
{ "slug": "ph-intro",   "target": "Labdien, es esmu ___.", "gloss": "Hello, I am ___.", "components": ["labdien","es","esmu"], "seedState": { "stage": "new", "reps": 0, "order": 1 } },
{ "slug": "ph-howareyou","target": "Kā tev iet?",          "gloss": "How are you?",     "components": ["ka","tev","iet"],     "seedState": { "stage": "new", "reps": 0, "order": 6 } }
```

(Leave `knownForTestUser` as-is: none of the six new lemmas are in it, so both phrases start fully locked.)

- [ ] **Step 2: Map `seedState.order` → staggered `due_at` in the seeder.** Where the seeder builds each `review_state` row, set `due_at` from `order` so `ORDER BY due_at` (Task 6) yields the sequence. Find the review_state insert (search `review_state` in `seed-golden-slice.mjs`) and set, for rows that have an `order`:

```js
// Deterministic curriculum order for the starting loop: earlier `order` => earlier due_at.
const base = new Date('2026-06-01T00:00:00Z').getTime();
const dueAt = seedState.order != null
  ? new Date(base + seedState.order * 60_000).toISOString()
  : null; // unordered items keep null due_at (sort last)
// include due_at in the review_state row object
```

- [ ] **Step 3: Verify the chime is the design asset.** Add a guard near the chime upload (search `unlock-chime`) — compute the local sha256 and log it; if a `content-pipeline/assets/unlock-chime.expected.sha256` file exists, assert equality:

```js
import crypto from 'node:crypto';
const chimeBuf = fs.readFileSync('content-pipeline/assets/unlock-chime.wav');
const sha = crypto.createHash('sha256').update(chimeBuf).digest('hex');
console.log(`  unlock-chime.wav sha256 = ${sha}`);
// current design asset: 1f7f126b3f5d47e134249f7c195b592975e406cec1756541bc8ec309c5dc14fb
```

(If it ever differs from the recorded hash, pull `front-end-sync`'s / the design project's `assets/unlock-chime.wav` and re-vendor.)

- [ ] **Step 4: Syntax-check the seeder + manifest (no spend)**

Run: `node --check content-pipeline/seed-golden-slice.mjs && node -e "JSON.parse(require('fs').readFileSync('content-pipeline/golden-slice.json'))"`
Expected: no output (valid).

- [ ] **Step 5: Run the seeder live** (needs `OPENAI_API_KEY`; `.env` at repo parent):

Run: `node content-pipeline/seed-golden-slice.mjs`
Expected: logs inserting 6 new lemmas + 2 phrases + components + review_state; chime sha matches.

- [ ] **Step 6: Verify the seed via SQL** (Supabase MCP / `execute_sql`):

```sql
select p.target, string_agg(l.lemma, ', ' order by pc.position) as words
from phrases p join phrase_components pc on pc.phrase_id=p.id join lemmas l on l.id=pc.lemma_id
where p.target in ('Labdien, es esmu ___.', 'Kā tev iet?') group by p.target;
```
Expected: intro → labdien, es, esmu; how-are-you → kā, tev, iet.

- [ ] **Step 7: Commit**

```bash
git add content-pipeline/golden-slice.json content-pipeline/seed-golden-slice.mjs
git commit -m "feat(seed): starting-loop content (2 phrases + 6 words) + ordered due_at + chime hash check"
```

---

### Task 8: Pin that the SRS records misses (lapses)

**Files:**
- Modify: `src/services/supabase/mappers.test.ts`
- Audit (read-only, fix only if broken): each graded card's `onComplete`.

**Interfaces:**
- Consumes: `cardResultToRating(result): Rating`, `schedule(prior, rating, now)` from `mappers.ts`.

- [ ] **Step 1: Add the failing/locking tests** in `src/services/supabase/mappers.test.ts`:

```ts
import { cardResultToRating, schedule } from './mappers';
import { Rating } from 'ts-fsrs';

it('a first-try miss maps to Rating.Again', () => {
  expect(cardResultToRating({ itemId: 'x', cardKind: 'drill', correct: false, spoke: true })).toBe(Rating.Again);
});
it("phrase/sayit self-rating 'again' maps to Rating.Again", () => {
  expect(cardResultToRating({ itemId: 'x', cardKind: 'phrase/sayit', spoke: true, selfRating: 'again' })).toBe(Rating.Again);
});
it('Again increments lapses / shortens the interval vs a fresh Good', () => {
  const now = new Date('2026-06-19T00:00:00Z');
  const again = schedule({ reps: 3, stage: 'review' }, Rating.Again, now);
  const good = schedule({ reps: 3, stage: 'review' }, Rating.Good, now);
  expect(again.due.getTime()).toBeLessThan(good.due.getTime());
});
```

- [ ] **Step 2: Run, expect pass or a real failure**

Run: `npx jest src/services/supabase/mappers.test.ts`
Expected: PASS (confirms the mapping already records misses). If any assertion FAILS, fix `cardResultToRating`/`schedule` so a miss → `Again` and shortens the interval, then re-run.

- [ ] **Step 3: Audit graded cards carry the miss.** Grep and read each completion: `grep -rn "onComplete(" src/screens`. Confirm every graded kind passes `correct: !missed` (or `selfRating`) — `drill`, `diphthong`, `word/hear`, `word/say`, `word/pic-review`, `phrase/sayit`. Learn/`phrase/hear` are exposure-only (`spoke:false`, no `correct`) and correctly map to `Good`. If a graded card hardcodes `correct:true`, fix it to use the sticky `missed`.

- [ ] **Step 4: Commit**

```bash
git add src/services/supabase/mappers.test.ts
git commit -m "test(srs): pin that a miss records Rating.Again (lapse) in scheduling"
```

---

### Task 9: Acceptance — walk the starting loop + verify lapse logging

**Files:** none (verification).

- [ ] **Step 1: Reset the test deck so the starting loop is due** (Supabase `execute_sql`):

```sql
update review_state rs set due_at = now() - interval '1 minute'
from auth.users u
where u.id = rs.user_id and u.email = 'test@pocketpolyglot.dev' and rs.due_at > now();
```

- [ ] **Step 2: Phone walk** (`npm run phone`, sign in `test@pocketpolyglot.dev` / `Polyglot123!`), light + dark:
  - Begin session → `phrase/locked` "Labdien, es esmu ___." (dimmed + "3 words to go").
  - Learn labdien, es, esmu → `phrase/unlock` (reveal + chime + **English meaning**) → `phrase/hear` (**says then repeats**, "first review tomorrow").
  - Same for "Kā tev iet?".
  - Exit-to-home (close button) works mid-loop.

- [ ] **Step 3: Verify a miss is logged.** Deliberately miss a graded card (e.g. a drill) once, then complete it. Query:

```sql
select item_type, correct, created_at from review_log
join auth.users u on u.id = review_log.user_id
where u.email = 'test@pocketpolyglot.dev' order by created_at desc limit 5;
```
Expected: a row with `correct = false` for the missed item; its `review_state` lapse/`due_at` updated.

- [ ] **Step 4: Final gate**

Run: `npx tsc --noEmit && npx eslint . && npx jest`
Expected: all green.

---

## Notes for the implementer

- The `word(id)` factory and provider/render helpers referenced in Tasks 2–3 already exist in the respective test files (`decideKind.test.ts`, `sessionController.test.tsx`); reuse them rather than re-defining.
- `decideKind` gaining a 4th argument is a breaking call-site change — the ONLY caller is `sessionController.ts` (updated in Task 3) and the test. Grep `decideKind(` to be sure.
- Do not touch `cardWiring.ts`, `mappers.ts` `pairRowToReviewItem`, `GlideViewport`, or the card files beyond Tasks 4–5 — they carry v0.1.2 + installment-2 behavior.
- Out of scope (separate specs/tasks): live waveform on the word cards (#22 — PhraseHear already uses `LiveWaveform`), image cards (#25), full frequency/unique-sound ordering (#26).
