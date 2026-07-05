# Core-Loop Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new word/phrase runs teach → MC meaning → speak in its intro session; phrases unlock as building blocks (locked teaser only when one word away, that word in the same session); reviews rotate MC ↔ speak; dev-only skip-to-next-day + reset-progress controls.

**Architecture:** Extend the existing pure session modules (`learningSteps`, `renderFor`, `selectBatch`, `requeue`, `sessionController`) plus `SupabaseSrsService`. One new migration (reset RPC), one new dev clock module, a dev section on Settings. No schema changes to content/review tables, no card-boundary violations.

**Tech Stack:** Expo/React Native + TypeScript, Jest, Supabase (Postgres + RLS), AsyncStorage.

**Spec:** `docs/superpowers/specs/2026-07-05-core-loop-reset-design.md`

## Global Constraints

- Cards are pure: data-in / events-out. Cards never import services. `SessionController` is the only stateful piece.
- `CardKind` `id`+`k` strings are stable analytics keys — never rename them.
- Wrong answers do NOT advance; never reveal the correct MC option.
- No gamification, no time claims, no literal "quiet" in copy.
- All pacing numbers live in `src/session/pacing.ts` as named constants — no inline literals in loop code.
- TypeScript everywhere, no `any` in card/controller contracts.
- CI green on every commit: `npm run lint && npm run typecheck && npx jest`.
- Repo root for all paths below: `pocketpolyglot-app/`.
- Supabase project: `necfghfotwykjsykccsa`. Test accounts: `test@pocketpolyglot.dev`, `newuser@pocketpolyglot.dev` (password `Polyglot123!`).

---

### Task 1: `retest` step marker + intro-arc expansion in learning steps

The `retest` field becomes a step marker (`'mc' | 'speak'`) and `expandLearningSteps` emits the full arc: intros → MC retests → speak retests, for word groups AND fully-known new phrases. Picture words are excluded (their `word/pic-review` card already runs a full loop). Locked-phrase teasers between new words are emitted in place without splitting a word group.

**Files:**
- Modify: `src/types/reviewItem.ts:110-113` (the `retest` field)
- Modify: `src/session/learningSteps.ts` (whole file)
- Test: `src/session/learningSteps.test.ts`

**Interfaces:**
- Consumes: `ReviewItem` (existing shape).
- Produces: `ReviewItem.retest?: 'mc' | 'speak'` (was `boolean`) — Tasks 2 and 5 rely on this.
- Produces: `expandLearningSteps(batch: ReviewItem[], groupSize: number, knownLemmaIds?: ReadonlySet<string>): ReviewItem[]` — third param defaults to empty set (Task 5 passes the real known set).

- [ ] **Step 1: Update the `retest` field type**

In `src/types/reviewItem.ts` replace the `retest` declaration (bottom of `ReviewItem`):

```typescript
  // In-session learning steps: a copy of a just-introduced item re-presented as a quiz step.
  // 'mc' = the recognition/meaning MC step; 'speak' = the production (say-it) step.
  // renderFor routes by this marker. Derived/in-memory only — never persisted.
  retest?: 'mc' | 'speak';
```

- [ ] **Step 2: Write the failing tests**

Replace the word-arc tests in `src/session/learningSteps.test.ts` (keep the `word`/`phrase` fixture helpers; extend `phrase` to accept component ids and `word` to accept an image):

```typescript
import { expandLearningSteps } from './learningSteps';
import type { ReviewItem } from '../types/reviewItem';

function word(id: string, stage: ReviewItem['stage'] = 'new', imageUrl?: string): ReviewItem {
  return {
    id, type: 'word', stage, reps: 0, target: id, gloss: id,
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
    ...(imageUrl ? { media: { imageUrl } } : {}),
  };
}
function phrase(id: string, componentLemmaIds: string[] = []): ReviewItem {
  return {
    id, type: 'phrase', stage: 'new', reps: 0, target: id, gloss: id,
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
    componentLemmaIds,
  };
}

describe('expandLearningSteps', () => {
  it('expands 3 new words into intros, MC retests, then speak retests', () => {
    const out = expandLearningSteps([word('a'), word('b'), word('c')], 3);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual([
      'a:intro', 'b:intro', 'c:intro',
      'a:mc', 'b:mc', 'c:mc',
      'a:speak', 'b:speak', 'c:speak',
    ]);
  });

  it('handles a remainder group smaller than groupSize', () => {
    const out = expandLearningSteps([word('a'), word('b'), word('c'), word('d')], 3);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual([
      'a:intro', 'b:intro', 'c:intro', 'a:mc', 'b:mc', 'c:mc', 'a:speak', 'b:speak', 'c:speak',
      'd:intro', 'd:mc', 'd:speak',
    ]);
  });

  it('passes non-new words through unchanged (already quizzes)', () => {
    const out = expandLearningSteps([word('r', 'review')], 3);
    expect(out).toHaveLength(1);
    expect(out[0]!.retest).toBeUndefined();
  });

  it('passes picture words through single — pic-review is already a full loop', () => {
    const out = expandLearningSteps([word('img', 'new', 'https://x/img.png')], 3);
    expect(out).toHaveLength(1);
    expect(out[0]!.retest).toBeUndefined();
  });

  it('expands a fully-known new phrase into its own hear→mc→speak arc', () => {
    const known = new Set(['w1', 'w2']);
    const out = expandLearningSteps([phrase('p', ['w1', 'w2'])], 3, known);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual(['p:intro', 'p:mc', 'p:speak']);
  });

  it('passes a locked phrase (unknown component) through single', () => {
    const out = expandLearningSteps([phrase('p', ['w1'])], 3, new Set());
    expect(out).toHaveLength(1);
    expect(out[0]!.retest).toBeUndefined();
  });

  it('emits a locked teaser in place without splitting the word group around it', () => {
    // teaser p (unknown comp w2) sits between w1 and w2 — the word run stays one group
    const out = expandLearningSteps(
      [word('w1'), phrase('p', ['w2']), word('w2'), word('w3')],
      3,
      new Set(),
    );
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual([
      'w1:intro', 'p:intro',
      'w2:intro', 'w3:intro',
      'w1:mc', 'w2:mc', 'w3:mc',
      'w1:speak', 'w2:speak', 'w3:speak',
    ]);
  });
});
```

NOTE on the teaser test: the teaser is emitted the moment it is encountered, so it lands after `w1:intro` (already gathered intros flush after the group closes — the exact expected order above is what the implementation below produces; if your implementation flushes intros first and you get `['w1:intro','p:intro','w2:intro',...]` vs `['p:intro','w1:intro',...]` adjust the implementation, not the invariant: **the teaser must precede the intro of its unknown word and must not break the group of 3**).

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest src/session/learningSteps.test.ts`
Expected: FAIL (old two-step expansion, no third param).

- [ ] **Step 4: Implement**

Replace `src/session/learningSteps.ts`:

```typescript
// In-session "learning steps": interleave INTRODUCTION with immediate quizzing.
// Each run of consecutive new words is presented in groups of `groupSize`:
// intros first, then an MC (recognition) retest of each, then a speak (production)
// retest of each — the full teach → MC → speak arc within one session.
// Fully-known new phrases get the same arc as a single-item group. Locked-phrase
// teasers (a new phrase with an unknown component) are emitted in place and are
// transparent to word grouping — the unlock requeue path gives them their arc later.
// Picture words pass through single: word/pic-review already runs a full loop.
// Pure — no clock, no services.
import type { ReviewItem } from '../types/reviewItem';

function isGroupableNewWord(item: ReviewItem): boolean {
  return item.type === 'word' && item.stage === 'new' && !item.media?.imageUrl;
}

function isFullyKnownNewPhrase(item: ReviewItem, known: ReadonlySet<string>): boolean {
  return (
    item.type === 'phrase' &&
    item.stage === 'new' &&
    (item.componentLemmaIds ?? []).every((id) => known.has(id))
  );
}

function isLockedTeaser(item: ReviewItem, known: ReadonlySet<string>): boolean {
  return item.type === 'phrase' && item.stage === 'new' && !isFullyKnownNewPhrase(item, known);
}

export function expandLearningSteps(
  batch: ReviewItem[],
  groupSize: number,
  knownLemmaIds: ReadonlySet<string> = new Set<string>(),
): ReviewItem[] {
  const out: ReviewItem[] = [];
  let i = 0;
  while (i < batch.length) {
    const item = batch[i]!;
    if (isFullyKnownNewPhrase(item, knownLemmaIds)) {
      out.push(item, { ...item, retest: 'mc' }, { ...item, retest: 'speak' });
      i++;
      continue;
    }
    if (!isGroupableNewWord(item)) {
      out.push(item);
      i++;
      continue;
    }
    // Gather up to groupSize new words; locked teasers between them are emitted
    // in place (transparent) so a phrase+word unit doesn't split the word run.
    const group: ReviewItem[] = [];
    while (i < batch.length && group.length < groupSize) {
      const next = batch[i]!;
      if (isGroupableNewWord(next)) {
        group.push(next);
        i++;
        continue;
      }
      if (isLockedTeaser(next, knownLemmaIds)) {
        out.push(next);
        i++;
        continue;
      }
      break;
    }
    for (const w of group) out.push(w); // intros
    for (const w of group) out.push({ ...w, retest: 'mc' }); // MC meaning
    for (const w of group) out.push({ ...w, retest: 'speak' }); // speak it
  }
  return out;
}
```

NOTE: with this implementation the teaser test's expected order is `['w1:intro'…]`? No — trace it: `w1` starts a group (gathered, not yet flushed), `p` is pushed to `out` immediately, `w2`/`w3` gathered, then the group flushes AFTER `p`. So actual order is `['p:intro', 'w1:intro', 'w2:intro', 'w3:intro', …]`. **Update the test in Step 2 to this order** — the invariant holds (teaser precedes its word's intro; group of 3 intact).

- [ ] **Step 5: Fix compile references to the old boolean**

`src/session/sessionController.ts:61` calls `expandLearningSteps(items, LEARNING_STEP_GROUP_SIZE)` — still compiles (third param defaults). Check nothing else assigns `retest: true`:

Run: `grep -rn "retest" src --include="*.ts*" | grep -v test | grep -v "\.md"`
Expected remaining producers/consumers: `reviewItem.ts` (type), `learningSteps.ts` (this task), `renderFor.ts` (`!item.retest` — still correct with string values, updated properly in Task 2).

- [ ] **Step 6: Run tests + typecheck**

Run: `npx jest src/session/learningSteps.test.ts && npm run typecheck`
Expected: PASS. (renderFor tests may still pass — `!item.retest` is truthy-compatible.)

- [ ] **Step 7: Commit**

```bash
git add src/types/reviewItem.ts src/session/learningSteps.ts src/session/learningSteps.test.ts
git commit -m "feat(loop): teach→MC→speak arc in learning steps; retest becomes a step marker"
```

---

### Task 2: `renderFor` — retest routing + MC↔speak review rotation

Route `retest` markers to their cards, replace the unreachable production-ladder gate with parity rotation (even total reps → MC, odd → speak), and drop the audio requirement on `word/say` / `phrase/sayit` (audio-less items render with a silent orb; per the spec, audio-less content is treated identically).

**Files:**
- Modify: `src/session/renderFor.ts` (whole file)
- Test: `src/session/renderFor.test.ts`

**Interfaces:**
- Consumes: `ReviewItem.retest?: 'mc' | 'speak'` (Task 1), `item.receptiveReps`/`item.productiveReps` (existing C2 fields).
- Produces: `renderFor(item): ReviewCardKind` — same signature; routing changes only. `computeRung`/`ladder.ts` are NOT modified (translation visibility still uses them).

- [ ] **Step 1: Write the failing tests**

Add to `src/session/renderFor.test.ts` (keep existing fixture builders; add/extend as needed — fixtures need `receptiveReps`, `productiveReps`, `choices`):

```typescript
describe('renderFor — retest step routing', () => {
  it("routes a word retest:'mc' to word/hear", () => {
    expect(renderFor({ ...newWord, retest: 'mc' })).toBe('word/hear');
  });
  it("routes a word retest:'speak' to word/say even without audio", () => {
    const w = { ...newWord, retest: 'speak' as const, audio: undefined, choices: twoChoices };
    expect(renderFor(w)).toBe('word/say');
  });
  it("routes a phrase retest:'mc' to phrase/meaning when choices exist", () => {
    const p = { ...newPhrase, retest: 'mc' as const, choices: twoChoices };
    expect(renderFor(p)).toBe('phrase/meaning');
  });
  it("falls back to phrase/hear for retest:'mc' with <2 choices", () => {
    expect(renderFor({ ...newPhrase, retest: 'mc' as const, choices: [] })).toBe('phrase/hear');
  });
  it("routes a phrase retest:'speak' to phrase/sayit even without audio", () => {
    expect(renderFor({ ...newPhrase, retest: 'speak' as const, audio: undefined })).toBe('phrase/sayit');
  });
});

describe('renderFor — review rotation (MC ↔ speak by rep parity)', () => {
  it('even totalReps → word/hear', () => {
    const w = { ...dueWord, receptiveReps: 1, productiveReps: 1, choices: twoChoices };
    expect(renderFor(w)).toBe('word/hear');
  });
  it('odd totalReps → word/say (audio not required)', () => {
    const w = { ...dueWord, receptiveReps: 2, productiveReps: 1, audio: undefined, choices: twoChoices };
    expect(renderFor(w)).toBe('word/say');
  });
  it('odd totalReps but <2 choices → word/hear (word/say needs its choose stage)', () => {
    const w = { ...dueWord, receptiveReps: 2, productiveReps: 1, choices: [] };
    expect(renderFor(w)).toBe('word/hear');
  });
  it('picture words always word/pic-review regardless of parity', () => {
    const w = { ...dueWord, receptiveReps: 2, productiveReps: 1, media: { imageUrl: 'x' } };
    expect(renderFor(w)).toBe('word/pic-review');
  });
  it('even totalReps → phrase/meaning; odd → phrase/sayit', () => {
    const even = { ...duePhrase, receptiveReps: 2, productiveReps: 0, choices: twoChoices };
    const odd = { ...duePhrase, receptiveReps: 2, productiveReps: 1, choices: twoChoices };
    expect(renderFor(even)).toBe('phrase/meaning');
    expect(renderFor(odd)).toBe('phrase/sayit');
  });
});
```

Where `twoChoices = [{ value: 'a', correct: true }, { value: 'b', correct: false }]`, `newWord`/`dueWord`/`newPhrase`/`duePhrase` are fixtures with `stage: 'new'`/`'review'` respectively. Delete/replace the old tests asserting the `production`-rung gate (`productiveReps >= 6 → word/say`) and the `hasAudio` requirement on say cards.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/session/renderFor.test.ts`
Expected: FAIL on the new rotation/retest cases.

- [ ] **Step 3: Implement**

Replace the routing body of `src/session/renderFor.ts`:

```typescript
// renderFor(item) — maps a ReviewItem to the CardKind to mount.
// The `id`+`k` strings (= CardKind) are the stable analytics / deep-link keys.
//
// Routing (core-loop reset, 2026-07-05 spec):
//  - learn-* is shown once, only when stage === 'new' and no retest marker.
//  - retest:'mc' → the MC step (word/hear, phrase/meaning); retest:'speak' → the
//    production step (word/say, phrase/sayit). Say cards are audio-OPTIONAL (silent
//    orb until audio is backfilled) but need ≥2 choices for their choose stage.
//  - due reviews ROTATE modality by total-rep parity: even → MC, odd → speak.
//    (Replaces the old production-rung gate, which was circular/unreachable.)
//  - picture words always run word/pic-review (already a full loop).
//  - 'phrase/locked' / 'phrase/unlock' are decided by the controller, not here.
import type { ReviewItem } from '../types/reviewItem';
import type { ReviewCardKind } from '../types/cardKind';

function hasChoices(item: ReviewItem): boolean {
  return (item.choices?.length ?? 0) >= 2;
}

/** Even total reps → the MC/recognition step; odd → the speak/production step. */
function speakTurn(item: ReviewItem): boolean {
  return ((item.receptiveReps ?? 0) + (item.productiveReps ?? 0)) % 2 === 1;
}

export function renderFor(item: ReviewItem): ReviewCardKind {
  // New words: first exposure → the learn template chosen by word class.
  if (item.stage === 'new' && item.type === 'word' && !item.retest) {
    if (item.wordClass === 'concrete') return 'word/learn-concrete';
    if (item.wordClass === 'abstract') return 'word/learn-abstract';
    if (item.wordClass === 'function') return 'word/learn-function';
  }

  if (item.type === 'word') {
    if (item.media?.imageUrl) return 'word/pic-review'; // full loop on picturable words
    if (item.retest === 'speak') return hasChoices(item) ? 'word/say' : 'word/hear';
    if (item.retest === 'mc') return 'word/hear';
    // Due review: rotate MC ↔ speak. word/say needs choices for its choose stage.
    if (speakTurn(item) && hasChoices(item)) return 'word/say';
    return 'word/hear';
  }

  if (item.type === 'phrase') {
    if (item.retest === 'speak') return 'phrase/sayit';
    if (item.retest === 'mc') return hasChoices(item) ? 'phrase/meaning' : 'phrase/hear';
    if (item.stage === 'new') return 'phrase/hear'; // first exposure
    if (speakTurn(item)) return 'phrase/sayit';
    return hasChoices(item) ? 'phrase/meaning' : 'phrase/hear';
  }

  // Minimal-pair perception drill — a gliding combination (ie) gets the diphthong card.
  const hasAudio = !!item.audio?.envelope;
  if (item.type === 'pair' && hasAudio) return item.glide ? 'diphthong' : 'drill';
  // audio-less pair is never selected (Module B gates pairs on audio); defensive fallback.
  if (item.type === 'pair') return 'word/learn-concrete';

  return 'pron';
}
```

Remove the now-unused `computeRung` import.

- [ ] **Step 4: Run tests**

Run: `npx jest src/session/renderFor.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Check downstream suites that pinned old routing**

Run: `npx jest src/session src/screens 2>&1 | tail -20`
Expected: failures only in tests that pinned the production-rung behavior (e.g. `decideKind.test.ts`, `sessionController.test.tsx` fixtures with `productiveReps: 6` expecting `word/say`, or `useReviewCardHandlers` snapshots). Update those expectations to the parity rule (a fixture with `receptiveReps+productiveReps` odd + ≥2 choices → `word/say`). Do NOT change `ladder.test.ts` — `computeRung` is untouched.

- [ ] **Step 6: Commit**

```bash
git add src/session/renderFor.ts src/session/renderFor.test.ts src/session/decideKind.test.ts src/session/sessionController.test.tsx
git commit -m "feat(loop): route retest steps; rotate due reviews MC↔speak by rep parity"
```

---

### Task 3: `selectBatch` — building-block phrase admission + placement; pacing caps

Phrases stop competing with words on (incomparable) utility rank. Words are admitted first against `newAllowance`; phrases are admitted second under their own small cap, only when fully known (zero unknown components) or exactly one-away with that word admitted in this same batch. One-away phrases are placed as a contiguous unit **before** their word (locked teaser → word), fully-known phrases after all word units. `DAY_ONE_NEW_CAP` drops to 10.

**Files:**
- Modify: `src/session/pacing.ts`
- Modify: `src/session/selectBatch.ts` (steps 6–7)
- Test: `src/session/selectBatch.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `DueRef`, `SelectContext` (unchanged shapes).
- Produces: `selectBatch(input): SelectResult` — same signature. New pacing constant `PHRASE_INTRO_CAP = 2`. `DAY_ONE_NEW_CAP = 10`. **`newAllowance` now budgets words only; phrases ride under `PHRASE_INTRO_CAP` and do not consume word slots.** (Deviation from the original Module-B budget noted in the spec's intent: prevents phrase floods and matches "5 new words/day, phrases unlock as blocks".)

- [ ] **Step 1: Update pacing constants**

In `src/session/pacing.ts`:

```typescript
/** One-time first-day onboarding bolus: up to 10 new WORDS on day 1 (3 cards each under the
 *  teach→MC→speak arc ⇒ ~30-card first session). */
export const DAY_ONE_NEW_CAP = 10 as const;
```

and append:

```typescript
/** Max phrases admitted per batch (building-block unlocks). Phrases do NOT consume the
 *  new-word allowance — words are the budget unit; phrases enter as their blocks complete. */
export const PHRASE_INTRO_CAP = 2 as const;
```

- [ ] **Step 2: Write the failing tests**

Add to `src/session/selectBatch.test.ts` (reuse its existing `Candidate`/ctx builders):

```typescript
describe('selectBatch — building-block phrases', () => {
  const wordCand = (id: string, rank: number): Candidate => ({
    id, kind: 'word', utilityRank: rank, hasAudioEnvelope: false,
  });
  const phraseCand = (id: string, comps: string[], anchor: string, rank = 1): Candidate => ({
    id, kind: 'phrase', utilityRank: rank, hasAudioEnvelope: false,
    componentLemmaIds: comps, anchorLemmaId: anchor,
  });
  const ctx = (over: Partial<SelectContext> = {}): SelectContext => ({
    accountAgeDays: 5, introducedToday: 0, dueToday: 0, rollingRetention: undefined,
    knownLemmaIds: new Set(), recalledLemmaIds: new Set(), todaysSemanticFields: new Set(),
    ...over,
  });

  it('rejects a phrase whose final unknown word is NOT admitted this batch', () => {
    // w9 exists in the pool but is beyond the allowance (steady cap 5, ranks 1-5 fill it)
    const words = [1, 2, 3, 4, 5, 9].map((r) => wordCand(`w${r}`, r));
    const p = phraseCand('p', ['k1', 'w9'], 'k1');
    const res = selectBatch({ due: [], candidates: [...words, p], ctx: ctx({
      knownLemmaIds: new Set(['k1']), recalledLemmaIds: new Set(['k1']),
    }) });
    expect(res.admittedNew.map((c) => c.id)).not.toContain('p');
  });

  it('admits a one-away phrase and places it immediately BEFORE its word', () => {
    const words = [1, 2, 3].map((r) => wordCand(`w${r}`, r));
    const p = phraseCand('p', ['k1', 'w2'], 'k1');
    const res = selectBatch({ due: [], candidates: [...words, p], ctx: ctx({
      knownLemmaIds: new Set(['k1']), recalledLemmaIds: new Set(['k1']),
    }) });
    const ids = res.order.map((o) => o.id);
    expect(ids.indexOf('p')).toBe(ids.indexOf('w2') - 1); // teaser directly before its word
  });

  it('rejects phrases with 2+ unknown components', () => {
    const words = [1, 2].map((r) => wordCand(`w${r}`, r));
    const p = phraseCand('p', ['w1', 'w2'], 'w1');
    const res = selectBatch({ due: [], candidates: [...words, p], ctx: ctx({
      recalledLemmaIds: new Set(['w1']),
    }) });
    expect(res.admittedNew.map((c) => c.id)).not.toContain('p');
  });

  it('admits a fully-known phrase without a teaser, AFTER the word units', () => {
    const p = phraseCand('p', ['k1', 'k2'], 'k1');
    const w = wordCand('w1', 1);
    const res = selectBatch({ due: [], candidates: [p, w], ctx: ctx({
      knownLemmaIds: new Set(['k1', 'k2']), recalledLemmaIds: new Set(['k1']),
    }) });
    const ids = res.order.map((o) => o.id);
    expect(ids.indexOf('p')).toBeGreaterThan(ids.indexOf('w1'));
    expect(res.admittedNew.map((c) => c.id)).toContain('p');
  });

  it('caps phrases at PHRASE_INTRO_CAP without consuming word allowance', () => {
    const words = [1, 2, 3, 4, 5].map((r) => wordCand(`w${r}`, r));
    const phrases = ['pa', 'pb', 'pc'].map((id, i) =>
      phraseCand(id, ['k1'], 'k1', i + 1)); // all fully... k1 known → zero unknowns
    const res = selectBatch({ due: [], candidates: [...words, ...phrases], ctx: ctx({
      knownLemmaIds: new Set(['k1']), recalledLemmaIds: new Set(['k1']),
    }) });
    const admitted = res.admittedNew.map((c) => c.id);
    expect(words.every((w) => admitted.includes(w.id))).toBe(true); // 5 words all admitted
    expect(admitted.filter((id) => id.startsWith('p'))).toHaveLength(2); // pa, pb only
  });

  it('still requires the anchor to have been recalled', () => {
    const p = phraseCand('p', ['k1'], 'k1');
    const res = selectBatch({ due: [], candidates: [p], ctx: ctx({
      knownLemmaIds: new Set(['k1']), recalledLemmaIds: new Set(), // known but never recalled
    }) });
    expect(res.admittedNew.map((c) => c.id)).not.toContain('p');
  });
});
```

Update existing tests that assume `DAY_ONE_NEW_CAP === 20` (day-one bolus size assertions → 10) and any that assume phrases compete inside `newAllowance` or the old raw-pool satisfiability rule.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest src/session/selectBatch.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement — replace steps 6–7 of `selectBatch`**

In `src/session/selectBatch.ts`: import `PHRASE_INTRO_CAP` from `./pacing`; delete the `dueIds`/`candidateIds` sets of step 1b (no longer used — the new rule requires the word ADMITTED, not merely present); replace the step-6 admission loop and the step-7 unit assembly with:

```typescript
  // -------------------------------------------------------------------------
  // Step 6: Admit new items.
  // Pass 1 — WORDS in utilityRank order against newAllowance (the budget unit).
  // -------------------------------------------------------------------------
  const admittedFields = new Set<string>(ctx.todaysSemanticFields);
  const sorted = [...candidates].sort((a, b) => a.utilityRank - b.utilityRank);

  const admittedWords: Candidate[] = [];
  const admittedWordIds = new Set<string>();
  for (const candidate of sorted) {
    if (candidate.kind !== 'word') continue;
    if (admittedWords.length >= newAllowance) break;
    if (candidate.semanticField && admittedFields.has(candidate.semanticField)) continue;
    admittedWords.push(candidate);
    admittedWordIds.add(candidate.id);
    if (candidate.semanticField) admittedFields.add(candidate.semanticField);
  }

  // -------------------------------------------------------------------------
  // Pass 2 — PHRASES: building blocks. Admissible iff the anchor has been
  // recalled AND either (a) zero unknown components (fully known), or (b)
  // exactly one unknown component whose word is admitted THIS batch (pass 1).
  // Capped at PHRASE_INTRO_CAP; phrases do NOT consume newAllowance.
  // -------------------------------------------------------------------------
  const fullyKnownPhrases: Candidate[] = [];
  const oneAwayByWordId = new Map<string, Candidate[]>();
  let phrasesAdmitted = 0;
  for (const candidate of sorted) {
    if (candidate.kind !== 'phrase') continue;
    if (phrasesAdmitted >= PHRASE_INTRO_CAP) break;
    if (!candidate.anchorLemmaId || !ctx.recalledLemmaIds.has(candidate.anchorLemmaId)) {
      continue;
    }
    const unknown = (candidate.componentLemmaIds ?? []).filter(
      (id) => !ctx.knownLemmaIds.has(id),
    );
    if (unknown.length === 0) {
      fullyKnownPhrases.push(candidate);
      phrasesAdmitted++;
    } else if (
      unknown.length <= I_PLUS_ONE_UNKNOWN_TOLERANCE &&
      unknown[0] !== undefined &&
      admittedWordIds.has(unknown[0])
    ) {
      const arr = oneAwayByWordId.get(unknown[0]) ?? [];
      arr.push(candidate);
      oneAwayByWordId.set(unknown[0], arr);
      phrasesAdmitted++;
    }
  }

  // -------------------------------------------------------------------------
  // Pass 3 — PAIRS (unchanged rules): audio-gated; embedded after their blocked
  // lemma when it was admitted, otherwise standalone (orphaned).
  // -------------------------------------------------------------------------
  const pairsByBlockedLemma = new Map<string, Candidate[]>();
  const orphanedPairs: Candidate[] = [];
  for (const candidate of sorted) {
    if (candidate.kind !== 'pair') continue;
    if (!candidate.hasAudioEnvelope) continue;
    if (candidate.blocksLemmaId && admittedWordIds.has(candidate.blocksLemmaId)) {
      const arr = pairsByBlockedLemma.get(candidate.blocksLemmaId) ?? [];
      arr.push(candidate);
      pairsByBlockedLemma.set(candidate.blocksLemmaId, arr);
    } else {
      orphanedPairs.push(candidate);
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Assemble units and the final admittedNew list.
  // Unit shape per word: [one-away teaser phrase(s)…, word, pair(s)…] — the
  // teaser precedes its word (locked → learn → chime), pairs follow it.
  // Fully-known phrases follow all word units; orphaned pairs go last.
  // -------------------------------------------------------------------------
  const newUnits: NewUnit[] = [];
  const admittedNew: Candidate[] = [];
  for (const w of admittedWords) {
    const teasers = oneAwayByWordId.get(w.id) ?? [];
    const pairs = pairsByBlockedLemma.get(w.id) ?? [];
    const unit = [...teasers, w, ...pairs];
    newUnits.push(unit.length === 1 ? w : unit);
    admittedNew.push(...unit);
  }
  for (const p of fullyKnownPhrases) {
    newUnits.push(p);
    admittedNew.push(p);
  }
  for (const p of orphanedPairs) {
    newUnits.push(p);
    admittedNew.push(p);
  }

  const order = interleave(due, newUnits);

  return { order, due, admittedNew, newAllowance };
```

Delete the now-dead old step-6/7 code (the single-pass loop, `pairsToEmbed` splicing, the mini-set regrouping walk) and the step-1b comment block. Keep `interleave` unchanged.

- [ ] **Step 5: Run tests**

Run: `npx jest src/session/selectBatch.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Fix service-level suites pinned to old caps/rules**

Run: `npx jest src/services/supabase 2>&1 | tail -20`
Update expectations pinned to `DAY_ONE_NEW_CAP = 20` (e.g. day-one bolus counts in `SupabaseSrsService.test.ts`) and any pinned to phrases consuming the allowance. `lemmaCandidates`/`phraseCandidates` use `DAY_ONE_NEW_CAP * 4` as a paging target — now 40; that's still ≥ any allowance, no code change needed.

- [ ] **Step 7: Commit**

```bash
git add src/session/pacing.ts src/session/selectBatch.ts src/session/selectBatch.test.ts src/services/supabase
git commit -m "feat(loop): building-block phrase admission + teaser-before-word placement; day-1 cap 10"
```

---

### Task 4: SRS service — completion-counted productive reps, word-only intro count, deferred drill seeding

Three service-side fixes: (1) a productive rep = a *completed* production-card review (speak cards don't grade pronunciation; requiring `correct === true` would stall rotation parity on a missed choose-stage), (2) `introducedToday` counts words only (phrases no longer consume the word allowance, so `phrase/hear` logs must not shrink it), (3) seeded drills get `due_at = now + 1 day` so a fresh account's day 0 is words, not perception drills.

**Files:**
- Modify: `src/services/supabase/cardTemplate.ts`
- Modify: `src/services/supabase/SupabaseSrsService.ts` (three sites: `introducedToday` ~line 120, C2 derivation ~line 715, post-submit rung derivation ~line 845, `ensureDrillsSeeded` ~line 367)
- Test: `src/services/supabase/cardTemplate.test.ts`, `src/services/supabase/SupabaseSrsService.test.ts` (or the C4submit/ladder suites where those paths are pinned)

**Interfaces:**
- Consumes: `PRODUCTION_CARD_KINDS` (existing, `cardTemplate.ts:10`).
- Produces: `repKind(cardKind: string, correct: boolean | null | undefined): 'productive' | 'receptive' | null` exported from `cardTemplate.ts` — the single rep-counting rule, used by both service sites (and available to future callers).

- [ ] **Step 1: Write the failing tests**

Add to `src/services/supabase/cardTemplate.test.ts`:

```typescript
import { repKind } from './cardTemplate';

describe('repKind — the single rep-counting rule', () => {
  it('counts a production card as productive on COMPLETION, regardless of correct', () => {
    expect(repKind('word/say', true)).toBe('productive');
    expect(repKind('word/say', false)).toBe('productive');
    expect(repKind('word/say', null)).toBe('productive');
    expect(repKind('phrase/sayit', null)).toBe('productive');
    expect(repKind('pron', undefined)).toBe('productive');
  });
  it('counts a non-production card as receptive only when correct', () => {
    expect(repKind('word/hear', true)).toBe('receptive');
    expect(repKind('word/hear', false)).toBeNull();
    expect(repKind('phrase/meaning', true)).toBe('receptive');
    expect(repKind('word/learn-concrete', null)).toBeNull(); // exposure ≠ rep
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/services/supabase/cardTemplate.test.ts`
Expected: FAIL — `repKind` not exported.

- [ ] **Step 3: Implement `repKind`**

Append to `src/services/supabase/cardTemplate.ts`:

```typescript
/**
 * The single rep-counting rule (spec 2026-07-05 §3).
 * Production cards (speak steps) count on COMPLETION — they don't grade pronunciation,
 * so requiring correct===true would stall the MC↔speak rotation parity forever.
 * Non-production cards count only on a correct retrieval; ungraded exposures count nothing.
 */
export function repKind(
  cardKind: string,
  correct: boolean | null | undefined,
): 'productive' | 'receptive' | null {
  if (PRODUCTION_CARD_KINDS.has(cardKind)) return 'productive';
  return correct === true ? 'receptive' : null;
}
```

- [ ] **Step 4: Use it at both counting sites in `SupabaseSrsService.ts`**

C2 derivation (inside `enrichAndReorder`, ~line 715) — replace the loop body:

```typescript
        for (const row of logData as ReviewLogRow[]) {
          const kind = repKind(row.card_kind, row.correct);
          if (kind === null) continue;
          const key = `${row.item_type}:${row.item_id}`;
          const counts = repsByKey.get(key) ?? { receptive: 0, productive: 0 };
          counts[kind] += 1;
          repsByKey.set(key, counts);
        }
```

Post-submit rung derivation (~line 845) — replace the loop body:

```typescript
    let receptiveReps = 0;
    let productiveReps = 0;
    if (logData) {
      for (const row of logData as Array<{ card_kind: string; correct: boolean | null }>) {
        const kind = repKind(row.card_kind, row.correct);
        if (kind === 'productive') productiveReps += 1;
        else if (kind === 'receptive') receptiveReps += 1;
      }
    }
```

Import `repKind` alongside the existing `cardKindToTemplate` import; the direct `PRODUCTION_CARD_KINDS` usages in these two loops disappear (keep the import only if still used elsewhere in the file).

- [ ] **Step 5: Words-only `introducedToday`**

In `introducedToday` (~line 126), replace the `.or(...)` filter line:

```typescript
      .like('card_kind', 'word/learn-%')
```

with a comment above it:

```typescript
    // Words only: newAllowance budgets WORDS (phrases ride under PHRASE_INTRO_CAP in
    // selectBatch), so phrase exposures must not shrink the word allowance.
```

- [ ] **Step 6: Defer seeded drills by one day**

In `ensureDrillsSeeded` (~line 366) replace the `dueIso` line + comment:

```typescript
    // due_at 1 day out: a fresh (or freshly reset) account's day 0 is the teach→MC→speak
    // word arc — perception drills join from the next session, not ahead of the first words.
    const dueIso = new Date(now.getTime() + 86_400_000).toISOString();
```

- [ ] **Step 7: Run the service suites; update pinned expectations**

Run: `npx jest src/services/supabase 2>&1 | tail -20`
Expected failures to fix: tests pinning `introducedToday` counting `phrase/hear`; tests pinning drill seed `due_at` in the past (seeding tests now expect +1 day, i.e. the seeded drills do NOT appear in the same call's due list); rung/ladder tests where an incorrect `word/say` row previously counted 0 productive.

- [ ] **Step 8: Commit**

```bash
git add src/services/supabase/cardTemplate.ts src/services/supabase/cardTemplate.test.ts src/services/supabase/SupabaseSrsService.ts src/services/supabase/SupabaseSrsService.test.ts
git commit -m "feat(srs): completion-counted productive reps; word-only intro count; drills seed day+1"
```

---

### Task 5: Session controller — known-set into learning steps; unlock inserts the phrase arc

Wire the real known-lemma set into `expandLearningSteps` (so fully-known phrases expand at load), and make the unlock path insert the full hear→MC→speak arc instead of a single re-queued exposure.

**Files:**
- Modify: `src/session/requeue.ts` (replace `requeueNext` with `requeueArcNext`)
- Modify: `src/session/sessionController.ts` (two lines)
- Test: `src/session/requeue.test.ts`, `src/session/sessionController.test.tsx`

**Interfaces:**
- Consumes: `expandLearningSteps(batch, groupSize, knownLemmaIds)` (Task 1), `ReviewItem.retest` markers (Task 1).
- Produces: `requeueArcNext(queue: ReviewItem[], fromPos: number, phrase: ReviewItem): ReviewItem[]` — inserts `[phrase, {…retest:'mc'}, {…retest:'speak'}]` at `fromPos + 1`. `requeueNext` is deleted (its only caller was the unlock path).

- [ ] **Step 1: Write the failing tests**

In `src/session/requeue.test.ts`, replace the `requeueNext` describe block:

```typescript
describe('requeueArcNext', () => {
  it('inserts the full hear→mc→speak arc immediately after fromPos', () => {
    const q = [word('a'), phraseItem('p'), word('b')]; // p at pos 1 = the unlock card
    const out = requeueArcNext(q, 1, q[1]!);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual([
      'a:intro', 'p:intro', 'p:intro', 'p:mc', 'p:speak', 'b:intro',
    ]);
    // the inserted intro copy carries no retest marker
    expect(out[2]!.retest).toBeUndefined();
  });
});
```

(`word`/`phraseItem` = the file's existing fixtures; the pos-1 original is the unlock gate card itself — the arc copies follow it.)

In `src/session/sessionController.test.tsx` add a test (following the file's existing fake-service pattern) asserting the end-to-end unlock sequence: a locked phrase seen → its component word answered correctly → the phrase resurfaces as `phrase/unlock` → advancing lands on `phrase/hear` then `phrase/meaning`-routed then `phrase/sayit`-routed copies (assert via the `kind` the controller reports as the queue advances).

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/session/requeue.test.ts`
Expected: FAIL — `requeueArcNext` not exported.

- [ ] **Step 3: Implement**

In `src/session/requeue.ts`, replace `requeueNext`:

```typescript
/** Insert the phrase's full learning arc (hear → MC → speak) immediately after `fromPos`.
 *  Used by the unlock path: the freshly-unlocked phrase gets the same teach→MC→speak arc
 *  a batch-admitted phrase gets from expandLearningSteps. Returns a new array (pure). */
export function requeueArcNext(
  queue: ReviewItem[],
  fromPos: number,
  phrase: ReviewItem,
): ReviewItem[] {
  const arc: ReviewItem[] = [
    { ...phrase, retest: undefined },
    { ...phrase, retest: 'mc' },
    { ...phrase, retest: 'speak' },
  ];
  const at = fromPos + 1;
  return [...queue.slice(0, at), ...arc, ...queue.slice(at)];
}
```

In `src/session/sessionController.ts`:
- line 7: import `requeueArcNext` instead of `requeueNext`;
- line 61: `setQueue(expandLearningSteps(items, LEARNING_STEP_GROUP_SIZE, known.all()));`
- line 145 (unlock branch): `setQueue((q) => requeueArcNext(q, pos, item));`

- [ ] **Step 4: Run the session suites**

Run: `npx jest src/session && npm run typecheck`
Expected: PASS (including the new controller sequence test).

- [ ] **Step 5: Commit**

```bash
git add src/session/requeue.ts src/session/requeue.test.ts src/session/sessionController.ts src/session/sessionController.test.tsx
git commit -m "feat(loop): unlock inserts full phrase arc; known set wired into learning steps"
```

---

### Task 6: Dev clock — skip-to-next-day time travel

A `__DEV__`-only clock offset (persisted in AsyncStorage) injected into `SupabaseSrsService` as its `now` source. Due dates fire naturally, the new cap resets, FSRS writes stay self-consistent. Production builds always get the real clock.

**Files:**
- Create: `src/services/devClock.ts`
- Modify: `src/services/supabase/SupabaseSrsService.ts:104-113` (constructor + `now()`)
- Modify: `src/services/supabase/index.ts:35-56` (`createSupabaseServices`)
- Test: `src/services/devClock.test.ts`

**Interfaces:**
- Produces: `devNow(): Date`, `getOffsetDays(): number`, `loadClockOffset(): Promise<number>`, `skipDay(): Promise<number>`, `clearClockOffset(): Promise<void>` — Task 7's Settings UI consumes these.
- Produces: `SupabaseSrsService` constructor gains an optional 4th param `nowFn?: () => Date` (takes precedence over the test-only `client._now` hook, which is preserved).

- [ ] **Step 1: Write the failing tests**

Create `src/services/devClock.test.ts` (mock AsyncStorage the same way `ThemeProvider`'s tests do — check `src/theme/*.test.tsx` for the existing `jest.mock('@react-native-async-storage/async-storage', …)` pattern and reuse it):

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { devNow, getOffsetDays, loadClockOffset, skipDay, clearClockOffset } from './devClock';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('devClock', () => {
  beforeEach(async () => {
    await clearClockOffset();
    (AsyncStorage.setItem as jest.Mock).mockClear();
  });

  it('starts at offset 0 and real time', () => {
    expect(getOffsetDays()).toBe(0);
    expect(Math.abs(devNow().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('skipDay advances the clock by 24h and persists', async () => {
    await skipDay();
    expect(getOffsetDays()).toBe(1);
    const drift = devNow().getTime() - Date.now();
    expect(Math.abs(drift - 86_400_000)).toBeLessThan(1000);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('pp.dev.clockOffsetDays', '1');
  });

  it('loadClockOffset restores a persisted offset', async () => {
    await AsyncStorage.setItem('pp.dev.clockOffsetDays', '3');
    await loadClockOffset();
    expect(getOffsetDays()).toBe(3);
  });

  it('clearClockOffset returns to real time', async () => {
    await skipDay();
    await clearClockOffset();
    expect(getOffsetDays()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/services/devClock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/devClock.ts`**

```typescript
// Dev-only time travel for testing day boundaries (daily caps, FSRS due dates).
// A whole-day offset added to the real clock, persisted across reloads. Injected into
// SupabaseSrsService as its `now` source in dev builds ONLY — production always runs
// real time (the offset never loads and devNow degenerates to new Date()).
//
// KNOWN CAVEAT (accepted, spec §4): review_log.created_at is stamped by Postgres with
// real time while due_at/introducedToday use the shifted clock — consistent enough for
// loop testing, but the offset is one-way (going backward strands items in the future).
// Reset progress (devTools) clears the offset as the escape hatch.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pp.dev.clockOffsetDays';
const DAY_MS = 86_400_000;

let offsetDays = 0;

export function getOffsetDays(): number {
  return offsetDays;
}

/** Restore the persisted offset (call once at service creation). No-op in production. */
export async function loadClockOffset(): Promise<number> {
  if (!__DEV__) return 0;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    offsetDays = raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    offsetDays = 0;
  }
  return offsetDays;
}

/** Advance the simulated clock by one day. Returns the new offset. */
export async function skipDay(): Promise<number> {
  offsetDays += 1;
  try {
    await AsyncStorage.setItem(KEY, String(offsetDays));
  } catch {
    // persistence is best-effort; the in-memory offset still applies this launch
  }
  return offsetDays;
}

/** Back to real time (also called by devTools.resetProgress). */
export async function clearClockOffset(): Promise<void> {
  offsetDays = 0;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

/** The dev clock: real now + offset. Real time when no offset (and always in prod). */
export function devNow(): Date {
  return new Date(Date.now() + (__DEV__ ? offsetDays : 0) * DAY_MS);
}
```

- [ ] **Step 4: Inject into `SupabaseSrsService`**

In `src/services/supabase/SupabaseSrsService.ts` replace the `now()` method + constructor (lines 101-113):

```typescript
  // Injectable clock. Precedence: explicit nowFn (dev time travel) → client._now
  // (test hook set by fakeClient) → real time.
  private now(): Date {
    if (this.nowFn) return this.nowFn();
    const c = this.client as unknown as { _now?: Date };
    return c._now instanceof Date ? c._now : new Date();
  }

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly uploader?: RecordingUploader,
    private readonly nowFn?: () => Date,
  ) {}
```

- [ ] **Step 5: Wire in `createSupabaseServices`**

In `src/services/supabase/index.ts`, import the clock and pass it in dev:

```typescript
import { devNow, loadClockOffset } from '../devClock';
```

and inside `createSupabaseServices`, before the return:

```typescript
  // Dev time travel: restore any persisted day offset and hand the SRS the dev clock.
  // Production builds pass no nowFn — the service runs real time.
  if (__DEV__) void loadClockOffset();
```

and change the srs line:

```typescript
    srs: new SupabaseSrsService(client, userId, uploader, __DEV__ ? devNow : undefined),
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx jest src/services && npm run typecheck`
Expected: PASS (existing SRS tests use `client._now`, still honored).

- [ ] **Step 7: Commit**

```bash
git add src/services/devClock.ts src/services/devClock.test.ts src/services/supabase/SupabaseSrsService.ts src/services/supabase/index.ts
git commit -m "feat(dev): time-travel clock injected into SRS (skip-to-next-day)"
```

---

### Task 7: Reset-progress RPC + Developer section in Settings

`review_log` is append-only (no DELETE policy, by design — migration 0002). Reset therefore goes through a `security definer` RPC that deletes only the caller's own rows. The Settings screen gets a Developer group (rendered only when the host passes `dev` props, which it does only under `__DEV__`): current simulated date, Skip to next day, and a two-tap-confirm Reset progress. (RN `Alert.alert` is a no-op on web preview, so confirm is in-screen state, not a native alert.)

**Files:**
- Create: `supabase/migrations/0015_dev_reset.sql`
- Create: `src/services/devTools.ts`
- Modify: `src/screens/SettingsScreen.tsx` (props + Developer group in `SettingsMenu`)
- Modify: `src/screens/SettingsHost.tsx`
- Test: `src/screens/SettingsScreen.test.tsx`, `src/screens/SettingsHost.test.tsx`

**Interfaces:**
- Consumes: `skipDay`, `getOffsetDays`, `devNow`, `loadClockOffset`, `clearClockOffset` (Task 6); `supabase` client export from `src/services`.
- Produces: SQL function `public.reset_my_progress()` (authenticated-only); `resetProgress(client: SupabaseClient): Promise<void>`; `SettingsScreenProps.dev?: { simulatedDateLabel: string; offsetDays: number; onSkipDay: () => void; onResetProgress: () => void }`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0015_dev_reset.sql`:

```sql
-- 0015_dev_reset.sql — self-service progress reset (dev/testing; also GDPR-friendly).
-- review_log is append-only for normal client operations (0002 grants no DELETE).
-- This SECURITY DEFINER function is the single sanctioned escape hatch: it deletes
-- ONLY the calling user's own rows, so it grants no cross-user power.

create or replace function public.reset_my_progress()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.review_log where user_id = auth.uid();
  delete from public.review_state where user_id = auth.uid();
$$;

revoke all on function public.reset_my_progress() from public;
grant execute on function public.reset_my_progress() to authenticated;
```

NOTE: delete `review_log` BEFORE `review_state` (review_log has no FK on review_state, but keep this order anyway so a partial failure leaves the less-surprising state: history gone, schedule intact → next batch reintroduces nothing stale).

- [ ] **Step 2: Apply the migration to the live project**

Apply via the Supabase MCP `apply_migration` tool (project `necfghfotwykjsykccsa`, name `dev_reset`, the SQL above). Verify:

```sql
select proname, prosecdef from pg_proc where proname = 'reset_my_progress';
```
Expected: one row, `prosecdef = true`.

- [ ] **Step 3: Implement `src/services/devTools.ts`**

```typescript
// Dev-only actions surfaced in the Settings Developer section. NOT part of the
// ServiceBundle: these are testing tools, not app services. resetProgress is safe to
// ship compiled (the RPC only ever deletes the caller's own rows) but is only ever
// reachable from the __DEV__ Settings section.
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearClockOffset } from './devClock';

/** Wipe the signed-in user's review history + schedule and return to real time. */
export async function resetProgress(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('reset_my_progress');
  if (error) throw error;
  await clearClockOffset();
}
```

- [ ] **Step 4: Write the failing screen test**

Add to `src/screens/SettingsScreen.test.tsx` (follow the file's existing render/props pattern):

```typescript
const devProps = {
  simulatedDateLabel: 'Tue Jul 7 (+2 days)',
  offsetDays: 2,
  onSkipDay: jest.fn(),
  onResetProgress: jest.fn(),
};

it('renders no Developer group without dev props', () => {
  const r = renderSettings({}); // existing helper, no dev prop
  expect(r.queryByText('Developer')).toBeNull();
});

it('renders the Developer group and fires onSkipDay', () => {
  const r = renderSettings({ dev: devProps });
  expect(r.getByText('Tue Jul 7 (+2 days)')).toBeTruthy();
  fireEvent.press(r.getByText('Skip to next day'));
  expect(devProps.onSkipDay).toHaveBeenCalled();
});

it('Reset progress requires a second confirming tap', () => {
  const r = renderSettings({ dev: devProps });
  fireEvent.press(r.getByText('Reset progress'));
  expect(devProps.onResetProgress).not.toHaveBeenCalled(); // armed, not fired
  fireEvent.press(r.getByText('Tap again to erase all progress'));
  expect(devProps.onResetProgress).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npx jest src/screens/SettingsScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 6: Implement the screen changes**

In `src/screens/SettingsScreen.tsx`:

Add to `SettingsScreenProps`:

```typescript
  /** Dev-only controls (host passes this ONLY under __DEV__; absent in production). */
  dev?: {
    simulatedDateLabel: string;
    offsetDays: number;
    onSkipDay: () => void;
    onResetProgress: () => void;
  };
```

In `SettingsMenu`, after the last existing group (before the log-out affordance), add:

```tsx
        {/* Developer (dev builds only — the host omits `dev` in production) */}
        {props.dev ? <DevSection dev={props.dev} /> : null}
```

And add the component (bottom of file, above styles; uses the existing `SettCard`/`SettRow`/`SettGroupLabel` primitives — match their prop names to how the other groups in this file use them):

```tsx
function DevSection({ dev }: { dev: NonNullable<SettingsScreenProps['dev']> }): React.JSX.Element {
  const T = useTheme();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000); // disarm if not confirmed
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <>
      <SettGroupLabel>Developer</SettGroupLabel>
      <SettCard>
        <SettRow
          label="Skip to next day"
          value={dev.simulatedDateLabel}
          onPress={dev.onSkipDay}
        />
        <SettRow
          label={armed ? 'Tap again to erase all progress' : 'Reset progress'}
          onPress={() => {
            if (armed) {
              setArmed(false);
              dev.onResetProgress();
            } else {
              setArmed(true);
            }
          }}
        />
      </SettCard>
    </>
  );
}
```

(Adjust `SettRow` props to the primitive's actual API — read `src/components/SettingsPrimitives.tsx` first; if it has a destructive/danger text variant, use it for the armed state.)

- [ ] **Step 7: Wire the host**

In `src/screens/SettingsHost.tsx`:

```typescript
import { supabase } from '../services';
import { devNow, getOffsetDays, loadClockOffset, skipDay } from '../services/devClock';
import { resetProgress } from '../services/devTools';
```

Inside `SettingsHost`:

```typescript
  const [devOffset, setDevOffset] = useState(0);
  useEffect(() => {
    if (!__DEV__) return;
    void loadClockOffset().then(setDevOffset);
  }, []);

  const dev = __DEV__
    ? {
        simulatedDateLabel:
          devOffset === 0
            ? 'Today (real time)'
            : `${devNow().toDateString()} (+${devOffset} day${devOffset === 1 ? '' : 's'})`,
        offsetDays: devOffset,
        onSkipDay: () => {
          void skipDay().then(setDevOffset);
        },
        onResetProgress: () => {
          void resetProgress(supabase)
            .then(() => setDevOffset(getOffsetDays()))
            .catch(() => {});
        },
      }
    : undefined;
```

and pass `dev={dev}` to `<SettingsScreen …>`.

NOTE: no session-reload plumbing needed — `getDueBatch` runs on every session mount, so the next visit to Today's Session reflects the reset/skip.

- [ ] **Step 8: Run tests**

Run: `npx jest src/screens/Settings && npm run typecheck && npm run lint`
Expected: PASS (update `SettingsHost.test.tsx` if it snapshot-pins props; `__DEV__` is true under Jest, so host tests can assert the dev prop exists and mock `../services/devTools`).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0015_dev_reset.sql src/services/devTools.ts src/screens/SettingsScreen.tsx src/screens/SettingsHost.tsx src/screens/SettingsScreen.test.tsx src/screens/SettingsHost.test.tsx
git commit -m "feat(dev): reset-progress RPC + Developer section (skip day / reset) in Settings"
```

---

### Task 8: Test-account wipe, full verification, on-device check

**Files:** none (verification + live-data task).

- [ ] **Step 1: Wipe the test accounts to day 0**

Via Supabase MCP `execute_sql` (project `necfghfotwykjsykccsa`):

```sql
with u as (
  select id from auth.users
  where email in ('test@pocketpolyglot.dev', 'newuser@pocketpolyglot.dev')
)
delete from public.review_log where user_id in (select id from u);
```

then:

```sql
with u as (
  select id from auth.users
  where email in ('test@pocketpolyglot.dev', 'newuser@pocketpolyglot.dev')
)
delete from public.review_state where user_id in (select id from u);
```

Verify both return to zero:

```sql
select 'log' as t, count(*) from public.review_log where user_id in
  (select id from auth.users where email like '%@pocketpolyglot.dev')
union all
select 'state', count(*) from public.review_state where user_id in
  (select id from auth.users where email like '%@pocketpolyglot.dev');
```
Expected: both counts 0.

- [ ] **Step 2: Full local verification**

Run: `npm run lint && npm run typecheck && npx jest`
Expected: all green, zero skipped-by-accident suites.

- [ ] **Step 3: On-device verification (`npm run phone`, sign in as test@)**

Walk the checklist; fix-forward anything broken before calling the task done:

1. Day 0: session opens with word intro cards FIRST (no drills, no MC before a learn card, no locked phrases at position 1 unless paired before its word).
2. Each word: learn → MC meaning → speak (record + continue works; silent orb on audio-less words, no crash).
3. If a locked phrase appears: it names the missing word, the word's arc follows, the chime + unlock reveal fires, then phrase hear → meaning → say-it.
4. Settings → Developer: Skip to next day updates the label; back in Today's Session, due reviews from day 0 return and rotate MC ↔ speak across two skipped days.
5. Reset progress (two-tap): next session is the day-0 experience again; simulated date shows "Today (real time)".

- [ ] **Step 4: Update the memory/handover note + commit anything fixed**

```bash
git add -A && git commit -m "chore: on-device fixes from core-loop reset verification"
```

(Skip the commit if nothing changed.)

---

## Self-Review (completed)

- **Spec coverage:** §1 arc → Tasks 1, 2, 5; §2 building blocks → Task 3 (+5 for the in-session unlock); §3 rotation + rep counting → Tasks 2, 4; §4 dev controls → Tasks 6, 7; §5 pacing → Task 3; §6 word/say audio-optional → Task 2 (routing) — `WordSay.tsx` already renders without an envelope (`usePlayClip(item.audio?.envelope)`, silent orb) and emits `correct` + `spoke`, so no card change is required, only the routing change; §7 reset + drill check → Tasks 4 (deferral), 7 (RPC), 8 (wipe).
- **Placeholder scan:** none found; the two NOTE blocks in Task 1 are deliberate implementation guidance about emission order, not TBDs.
- **Type consistency:** `retest?: 'mc' | 'speak'` (Task 1) used identically in Tasks 2, 5; `repKind` name consistent between Task 4 test and impl; `requeueArcNext` signature matches its Task 5 usages; `dev` prop shape identical between SettingsScreen and SettingsHost; `nowFn` param name consistent in Task 6.
