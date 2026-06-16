# Vertical Slice — "Golden Path" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One of every card type rendering from real seeded Supabase content, plus the phrase lock→unlock flow and the two unique-character drill cards (L/Ļ + the new `ie` diphthong), polished in light + dark.

**Architecture:** Cards stay pure (data-in/events-out). Net-new *logic* (contract types, `renderFor` routing, phrase-gating, runtime distractor injection) is TDD'd as pure functions. The two drill cards are **ported verbatim** from the founder handoff `../handover/drill_cards_handoff/screens-drill.jsx` (its kit deps already exist in the app). A golden-slice seed script (OpenAI TTS) populates Supabase so the session deck surfaces every card kind.

**Tech Stack:** Expo / React Native (TypeScript), Supabase (Postgres + Storage + RPC), `ts-fsrs`, `react-native-svg`, Jest + `@testing-library/react-native`, Node ESM content-pipeline.

**Spec:** `docs/superpowers/specs/2026-06-16-vertical-slice-golden-path-design.md`

---

## Context for an engineer new to this repo

- **The card boundary (do not break):** cards are presentational; they receive a `ReviewItem` + callbacks and emit a `CardResult`. They never import services. `SessionController` fetches the batch, calls `renderFor(item)` → `CardKind`, mounts `CARD_REGISTRY[kind]`. See `CLAUDE.md` + `docs/BACKEND_INTEGRATION.md`.
- **Contracts:** `src/types/reviewItem.ts`, `src/types/cardKind.ts`, `src/types/cardResult.ts`. The `ReviewItem` already has `target, gloss, pron, wordClass, audio{nativeUrl,slowUrl,envelope}, media{imageUrl,imageUrlDark}, mnemonic, examples, choices, pair`.
- **Routing:** `src/session/renderFor.ts` (pure, tested in `renderFor.test.ts`).
- **Drill handoff (source of truth for the sound cards):** `../handover/drill_cards_handoff/` — `README.md` (the data contract + port checklist), `screens-drill.jsx` (the two cards + `GlideTrack`), `kit.jsx` (already ported → `src/theme/tokens.ts` + `src/components/{Waveform,PlayOrb,MicOrb,SpeedChip,Screen}`).
- **Run/verify loop:** the `run-and-view-app` skill (web preview on :8081 + headless Chrome on :9222 + chrome-devtools MCP). Test user: `test@pocketpolyglot.dev` / `Polyglot123!`.
- **CI must stay green:** `npx tsc --noEmit`, `npx eslint .`, `npx jest` after every task. Run from `pocketpolyglot-app/`.

## File map (what changes)

```
src/types/reviewItem.ts          MODIFY  add ReviewGlide + item.glide
src/types/cardKind.ts            MODIFY  add 'diphthong' to ReviewCardKind
src/navigation/registry.ts       MODIFY  register DiphthongDrillScreen
src/session/renderFor.ts         MODIFY  route pair+glide → 'diphthong'
src/session/phraseGate.ts        CREATE  pure lock-state helper
src/session/sessionController.ts MODIFY  apply phraseGate before renderFor
src/services/supabase/SupabaseSrsService.ts  MODIFY  fetch phrase_components + distractors
src/services/supabase/mappers.ts MODIFY  map glide; leave choices to be injected
src/components/GlideTrack.tsx     CREATE  diphthong glide visual (svg arc + traveling dot)
src/screens/DiphthongDrillScreen.tsx CREATE  the ie card (meet→contrast→say→done)
src/screens/DrillScreen.tsx      MODIFY  refine to the mockup (listen→chosen→say→done)
src/screens/WordLearnConcrete.tsx MODIFY  un-stub image (placeholder-aware)
src/screens/WordPicReview.tsx    MODIFY  un-stub image (placeholder-aware, dark swap)
docs/latvian-sound-inventory.md  CREATE  curated hard-sound coverage matrix
content-pipeline/golden-slice.json   CREATE  the hand-authored content manifest
content-pipeline/seed-golden-slice.mjs CREATE  TTS + upload + insert + engineered review_state
```

---

### Task 1: Extend the item contract — `glide` for diphthong drills

**Files:**
- Modify: `src/types/reviewItem.ts`

- [ ] **Step 1: Add the `ReviewGlide` interface and the optional `glide` field**

In `src/types/reviewItem.ts`, after the `ReviewPair` interface add:

```ts
/** Diphthong-drill only: the gliding combination to "feel" (e.g. ie = i→e). */
export interface ReviewGlide {
  combo: string; // e.g. "ie"
  from: string; // e.g. "i"
  to: string; // e.g. "e"
}
```

And inside `ReviewItem`, directly after the `pair?: ReviewPair;` line, add:

```ts
  // diphthong drill — drives the "meet the glide" step + GlideTrack
  glide?: ReviewGlide;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/types/reviewItem.ts
git commit -m "feat(contract): add glide field for diphthong drills"
```

---

### Task 2: Register the `diphthong` CardKind

**Files:**
- Modify: `src/types/cardKind.ts`
- Modify: `src/navigation/registry.ts`

- [ ] **Step 1: Add `'diphthong'` to the `ReviewCardKind` union**

In `src/types/cardKind.ts`, change the `ReviewCardKind` union to include `'diphthong'` right after `'drill'`:

```ts
  | 'drill'
  | 'diphthong'
  | 'pron';
```

- [ ] **Step 2: Register the screen** (the screen file is created in Task 9; add the import + registry entry now and it will resolve once the file exists — do this task AFTER Task 9, or stub the import. To keep CI green, do Task 9 first then return here.)

In `src/navigation/registry.ts`, add `DiphthongDrillScreen` to the import from `../screens` and add to `CARD_REGISTRY`:

```ts
  drill: DrillScreen,
  diphthong: DiphthongDrillScreen,
  pron: PronounceScreen,
```

- [ ] **Step 3: Verify typecheck + the renderFor test still compiles**

Run: `npx tsc --noEmit`
Expected: exit 0 (after Task 9 exists).

- [ ] **Step 4: Commit**

```bash
git add src/types/cardKind.ts src/navigation/registry.ts
git commit -m "feat(contract): register diphthong card kind"
```

> NOTE: Because Task 2 step 2 imports the screen from Task 9, sequence as: Task 1 → Task 8 (GlideTrack) → Task 9 (DiphthongDrillScreen) → Task 2 → Task 3. The plan lists them logically; the implementer orders to keep CI green.

---

### Task 3: Route `pair + glide` → `diphthong` in `renderFor`

**Files:**
- Modify: `src/session/renderFor.ts`
- Test: `src/session/renderFor.test.ts` (exists)

- [ ] **Step 1: Add the failing test**

Append to `src/session/renderFor.test.ts`:

```ts
import { renderFor } from './renderFor';
import type { ReviewItem } from '../types/reviewItem';

function pairItem(extra: Partial<ReviewItem>): ReviewItem {
  return {
    id: 'p1', type: 'pair', stage: 'learning', reps: 0,
    target: 'lieta', gloss: 'thing',
    audio: { nativeUrl: 'x' },
    pair: { a: 'lieta', b: 'lēta', correct: 'a', audioUrl: 'x' },
    ...extra,
  };
}

test('renderFor routes a pair WITH a glide to diphthong', () => {
  expect(renderFor(pairItem({ glide: { combo: 'ie', from: 'i', to: 'e' } }))).toBe('diphthong');
});

test('renderFor routes a pair WITHOUT a glide to drill', () => {
  expect(renderFor(pairItem({}))).toBe('drill');
});
```

- [ ] **Step 2: Run to verify the diphthong case fails**

Run: `npx jest src/session/renderFor.test.ts`
Expected: FAIL — gets `'drill'`, expected `'diphthong'`.

- [ ] **Step 3: Implement the routing**

In `src/session/renderFor.ts`, replace the minimal-pair line:

```ts
  // Minimal-pair perception drill.
  if (item.type === 'pair') return 'drill';
```

with:

```ts
  // Minimal-pair perception drill — a gliding combination (ie) gets the diphthong card.
  if (item.type === 'pair') return item.glide ? 'diphthong' : 'drill';
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/session/renderFor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/renderFor.ts src/session/renderFor.test.ts
git commit -m "feat(routing): pair+glide routes to diphthong card"
```

---

### Task 4: Phrase lock-state helper (pure)

**Files:**
- Create: `src/session/phraseGate.ts`
- Test: `src/session/phraseGate.test.ts`

The i+1 rule: a phrase is **available** when at most one component lemma is unknown; **locked** when 2+ are unknown. `unlock` (the celebratory reveal) is the transition locked→available — tracked by the controller (Task 5), not here.

- [ ] **Step 1: Write the failing test** (Jest provides `test`/`expect` globally — no imports needed)

Create `src/session/phraseGate.test.ts`:

```ts
import { lockState } from './phraseGate';

test('locked when 2+ components are unknown', () => {
  const known = new Set<string>(['ludzu']);
  const r = lockState(['viens', 'kafija', 'ludzu'], known);
  expect(r.locked).toBe(true);
  expect(r.unknownCount).toBe(2);
});

test('available (i+1) when exactly one component is unknown', () => {
  const known = new Set<string>(['viens', 'ludzu']);
  const r = lockState(['viens', 'kafija', 'ludzu'], known);
  expect(r.locked).toBe(false);
  expect(r.unknownCount).toBe(1);
});

test('available when all known', () => {
  const known = new Set<string>(['viens', 'kafija', 'ludzu']);
  expect(lockState(['viens', 'kafija', 'ludzu'], known).locked).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/session/phraseGate.test.ts`
Expected: FAIL — cannot find module `./phraseGate`.

- [ ] **Step 3: Implement**

Create `src/session/phraseGate.ts`:

```ts
// Pure i+1 phrase-gate logic. A phrase is AVAILABLE when at most one of its component lemmas is
// unknown (the single unknown is the "+1" new word); LOCKED when 2+ are unknown. The controller
// turns a locked→available transition into the one-time 'phrase/unlock' reveal (see sessionController).
export interface LockState {
  locked: boolean;
  unknownCount: number;
}

export function lockState(componentLemmaIds: string[], known: Set<string>): LockState {
  const unknownCount = componentLemmaIds.filter((id) => !known.has(id)).length;
  return { locked: unknownCount > 1, unknownCount };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/session/phraseGate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/session/phraseGate.ts src/session/phraseGate.test.ts
git commit -m "feat(session): pure i+1 phrase lock-state helper"
```

---

### Task 5: Wire phrase gating into the controller

**Files:**
- Modify: `src/session/sessionController.ts`
- Modify: `src/types/reviewItem.ts` (add `componentLemmaIds?` so a phrase item carries its components)
- Test: `src/session/sessionController.test.ts` (exists — extend)

**Context:** The controller currently calls `renderFor(item)` directly. For `phrase` items it must first consult `KnownWordsStore` + the phrase's component lemma ids. The batch (Task 6) attaches `componentLemmaIds` to phrase items. The controller tracks which phrase ids were shown locked this session so it can fire `phrase/unlock` exactly once when they become available.

- [ ] **Step 1: Add `componentLemmaIds` to the item contract**

In `src/types/reviewItem.ts`, inside `ReviewItem` after `glide?:`, add:

```ts
  // phrase items only — the lemma ids that make up the phrase (for the i+1 lock gate).
  componentLemmaIds?: string[];
```

- [ ] **Step 2: Add a pure "kind decision" function with a failing test**

Create `src/session/decideKind.ts`:

```ts
import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';
import { renderFor } from './renderFor';
import { lockState } from './phraseGate';

// Decides the card kind for an item given the known-lemma set and the set of phrase ids already
// seen LOCKED this session. Returns the kind plus whether this render is a fresh unlock (so the
// caller can record it). Phrases consult the i+1 gate; everything else falls through to renderFor.
export function decideKind(
  item: ReviewItem,
  known: Set<string>,
  seenLocked: Set<string>,
): { kind: CardKind; nowUnlocked: boolean } {
  if (item.type === 'phrase' && item.componentLemmaIds) {
    const { locked } = lockState(item.componentLemmaIds, known);
    if (locked) return { kind: 'phrase/locked', nowUnlocked: false };
    if (seenLocked.has(item.id)) return { kind: 'phrase/unlock', nowUnlocked: true };
  }
  return { kind: renderFor(item), nowUnlocked: false };
}
```

Create `src/session/decideKind.test.ts`:

```ts
import { decideKind } from './decideKind';
import type { ReviewItem } from '../types/reviewItem';

const phrase: ReviewItem = {
  id: 'ph1', type: 'phrase', stage: 'new', reps: 0,
  target: 'Vienu kafiju, lūdzu.', gloss: 'One coffee, please.',
  audio: { nativeUrl: 'x' }, componentLemmaIds: ['viens', 'kafija', 'ludzu'],
};

test('locked phrase → phrase/locked', () => {
  const r = decideKind(phrase, new Set(['ludzu']), new Set());
  expect(r.kind).toBe('phrase/locked');
});

test('a phrase seen locked, now available → phrase/unlock', () => {
  const r = decideKind(phrase, new Set(['viens', 'ludzu']), new Set(['ph1']));
  expect(r.kind).toBe('phrase/unlock');
  expect(r.nowUnlocked).toBe(true);
});

test('available phrase never seen locked → normal review kind', () => {
  const r = decideKind(phrase, new Set(['viens', 'kafija', 'ludzu']), new Set());
  expect(r.kind).toBe('phrase/hear');
});
```

- [ ] **Step 3: Run to verify it fails then passes**

Run: `npx jest src/session/decideKind.test.ts`
Expected: FAIL (no module) → after creating `decideKind.ts`, PASS (3 tests).

- [ ] **Step 4: Use `decideKind` in the controller**

In `src/session/sessionController.ts`, where the current item's kind is computed via `renderFor(...)`, replace with `decideKind(item, known.all(), seenLocked)` (use the injected `KnownWordsStore` — exposed as `known` — and a `useRef<Set<string>>` `seenLocked` held in the session hook). When `kind === 'phrase/locked'`, add `item.id` to `seenLocked`. Keep the existing `current.kind` shape so `CardHost` is unchanged. (Reference the existing hook body around `src/session/sessionController.ts:55` per the Explore map.)

- [ ] **Step 5: Run the session controller tests + full suite**

Run: `npx jest src/session && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/reviewItem.ts src/session/decideKind.ts src/session/decideKind.test.ts src/session/sessionController.ts
git commit -m "feat(session): i+1 phrase lock/unlock gating in the controller"
```

---

### Task 6: Fetch phrase components + runtime distractors in the batch

**Files:**
- Modify: `src/services/supabase/SupabaseSrsService.ts` (`getDueBatch`)
- Modify: `src/services/supabase/mappers.ts`
- Test: `src/services/supabase/mappers.test.ts` (exists — extend for glide mapping)

**Context (from the Explore map):** `getDueBatch` (`SupabaseSrsService.ts:40–102`) buckets items and maps rows via mappers. `get_distractors` RPC exists in the DB but is never called; `mappers.ts:33` notes choices are "fetched separately." For a `word` review card, choices must be present.

- [ ] **Step 1: Map the `glide` field (unit-testable)** — add a failing test to `mappers.test.ts`:

```ts
import { pairRowToReviewItem } from './mappers';

test('pairRowToReviewItem carries the glide for diphthong rows', () => {
  const row: any = {
    id: 'mp1', a: 'lieta', b: 'lēta', correct: 'a', audio_url: 'x',
    target: 'lieta', gloss_en: 'thing', pron: 'LYEH-ta',
    glide: { combo: 'ie', from: 'i', to: 'e' },
  };
  const item = pairRowToReviewItem(row, { stage: 'learning', reps: 0 } as any);
  expect(item.glide).toEqual({ combo: 'ie', from: 'i', to: 'e' });
});
```

- [ ] **Step 2: Implement glide mapping** — in `pairRowToReviewItem` (mappers.ts), set `glide: row.glide ?? undefined` on the returned item. Run `npx jest src/services/supabase/mappers.test.ts` → PASS.

- [ ] **Step 3: Inject distractors in `getDueBatch`** — after mapping word items, for each `word` item call the RPC and attach `choices`:

```ts
// word cards need controlled distractors (same word_class + nearby freq_band). word/hear → gloss
// choices; word/say → word choices. The RPC returns rows {value, gloss}; we mark the target correct.
const { data: distractors } = await client.rpc('get_distractors', {
  p_lemma_id: item.id, p_n: 3,
});
item.choices = [
  { value: item.target, gloss: item.gloss, correct: true },
  ...(distractors ?? []).map((d: { value: string; gloss: string }) => ({
    value: d.value, gloss: d.gloss, correct: false,
  })),
];
```

(Confirm the RPC's exact arg names + return columns against `supabase/migrations/` — adjust `p_lemma_id`/`p_n`/`value`/`gloss` to match the SQL. The card shuffles choice order itself.)

- [ ] **Step 4: Attach `componentLemmaIds` to phrase items** — in `getDueBatch`, for phrase items, query `phrase_components` (`select lemma_id where phrase_id = …`) and set `item.componentLemmaIds = rows.map(r => r.lemma_id)`.

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS (snapshots may need `-u` only if a card render legitimately changed; none expected here).

- [ ] **Step 6: Commit**

```bash
git add src/services/supabase/SupabaseSrsService.ts src/services/supabase/mappers.ts src/services/supabase/mappers.test.ts
git commit -m "feat(srs): inject runtime distractors + phrase components into the batch"
```

---

### Task 7: Curated sound-inventory doc

**Files:**
- Create: `docs/latvian-sound-inventory.md`

- [ ] **Step 1: Write the doc** — a coverage matrix of ONLY the sounds hard for English speakers, each mapped to a `contrast_type` and a representative minimal pair. Include exactly these rows (mark which ship in this slice):

  - Palatalization `ļ ķ ģ ņ` → `contrast_type: palatalization` — pair `ļoti`/`lācis` (L/Ļ) **[slice]**.
  - Diphthong `ie` → `contrast_type: diphthong` — pair `lieta`/`lēta` **[slice]**.
  - Vowel length `ā ē ī ū` vs short → `contrast_type: vowel_length` — pair `pile`/`pīle` *(next batch)*.
  - Affricates `dz dž` → `contrast_type: affricate` *(next batch)*.
  - Excluded (absorb from hearing): `č`=ch, `š`=sh, `ž`=zh, `c`=ts, `j`=y. Borderline: trilled `r` (listed, not drilled).

  State the principle at the top: *only sounds an English ear actually confuses get a dedicated card; the rest are absorbed from hearing the core words.* Note the `pron` respelling must mark first-syllable stress, long vowels, and palatals.

- [ ] **Step 2: Commit**

```bash
git add docs/latvian-sound-inventory.md
git commit -m "docs: curated Latvian hard-sound inventory + coverage matrix"
```

---

### Task 8: `GlideTrack` primitive (port)

**Files:**
- Create: `src/components/GlideTrack.tsx`
- Test: `src/components/GlideTrack.test.tsx`

**Port source:** `../handover/drill_cards_handoff/screens-drill.jsx` → the `GlideTrack` export (README §"How the prototype is built" + the port checklist step 2). It is two vowel nodes + a dotted quadratic arc + a dot that animates along that path while `playing`.

- [ ] **Step 1: Port to RN** — implement with `react-native-svg`: render the two nodes (`from`/`to` labels), a dashed `<Path>` quadratic arc between them, and an animated `<Circle>` whose position interpolates along the bezier driven by an `Animated.Value` (0→1) started when `playing` becomes true. Props: `{ from: string; to: string; playing: boolean; color: string }` (theme color passed in by the card — keep the component pure). Use the kit colors via the passed `color`/theme, not hard-coded.

- [ ] **Step 2: Smoke test** — `src/components/GlideTrack.test.tsx`:

```ts
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { GlideTrack } from './GlideTrack';

test('GlideTrack renders both vowel nodes', () => {
  const u = render(
    <ThemeProvider>
      <GlideTrack from="i" to="e" playing={false} color="#6EA8DA" />
    </ThemeProvider>,
  );
  expect(u.getByText('i')).toBeTruthy();
  expect(u.getByText('e')).toBeTruthy();
});
```

- [ ] **Step 3: Run + typecheck**

Run: `npx jest src/components/GlideTrack.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/GlideTrack.tsx src/components/GlideTrack.test.tsx
git commit -m "feat(ui): GlideTrack diphthong-glide primitive (ported)"
```

---

### Task 9: `DiphthongDrillScreen` (port)

**Files:**
- Create: `src/screens/DiphthongDrillScreen.tsx`
- Test: `src/screens/DiphthongDrillScreen.test.tsx`

**Port source:** `screens-drill.jsx` → `DiphthongDrillScreen`. Stage machine **`meet → contrast → say → done`** (README §"state values"). Pure card: props are the standard card props — `{ item: ReviewItem }` plus the injected callbacks (`onPlay`, `onAnswer`, `onRecordStart`, `onRecordStop`, `onComplete`) used by the other cards (match `WordHear.tsx`/`PhraseHear.tsx` signatures). Reads `item.glide` for the "meet the glide" step (renders `GlideTrack`), `item.pair` for the contrast pick, `item.target/pron` for say-it. Honor the locked constraint: **wrong MC pick does NOT advance** — red "Try again", chosen option red, correct answer NOT revealed, copy "Not quite — give it another try." (`CLAUDE.md`).

- [ ] **Step 1: Port the screen** following `screens-drill.jsx` verbatim for layout/stages, swapping web primitives for the app's RN kit (`Screen`, `PlayOrb`, `MicOrb`, `Waveform`, `SpeedChip`, `GlideTrack`). Use `useTheme()` for all colors. Keep ephemeral stage state local (`phase`, `picked`, `say`).

- [ ] **Step 2: Snapshot + behavior test** — `src/screens/DiphthongDrillScreen.test.tsx`: render with a fixture diphthong `ReviewItem` inside `ThemeProvider`; `toMatchSnapshot()`; assert the contrast options render; assert a wrong pick shows "Not quite — give it another try." and does NOT call `onComplete`.

- [ ] **Step 3: Run + typecheck**

Run: `npx jest src/screens/DiphthongDrillScreen.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/DiphthongDrillScreen.tsx src/screens/DiphthongDrillScreen.test.tsx
git commit -m "feat(card): DiphthongDrillScreen (ie glide) ported from handoff"
```

Then complete **Task 2** (register the kind + screen).

---

### Task 10: Refine `DrillScreen` to the mockup

**Files:**
- Modify: `src/screens/DrillScreen.tsx`
- Test: `src/screens/DrillScreen.test.tsx` (exists)

**Port source:** `screens-drill.jsx` → `DrillScreen`. Stage machine **`listen → chosen → say → done`**. Align the existing card to the mockup frames in `../handover/drill_cards_handoff/Drill Cards Preview.html` (the L/Ļ card). Same wrong-answer rule as Task 9.

- [ ] **Step 1: Update the screen** to match the handoff layout/stages; keep it pure; theme all colors.
- [ ] **Step 2: Update its test** for any changed copy; add the wrong-pick "Try again" assertion if missing.
- [ ] **Step 3: Run** `npx jest src/screens/DrillScreen.test.tsx` (use `-u` to update the snapshot only after eyeballing the diff is the intended visual change).
- [ ] **Step 4: Commit**

```bash
git add src/screens/DrillScreen.tsx src/screens/DrillScreen.test.tsx src/screens/__snapshots__/DrillScreen.test.tsx.snap
git commit -m "feat(card): refine DrillScreen (L/Ļ) to the mockup"
```

---

### Task 11: Un-stub images (placeholder-aware) + real envelope

**Files:**
- Modify: `src/screens/WordLearnConcrete.tsx`, `src/screens/WordPicReview.tsx`
- Test: their existing tests

- [ ] **Step 1: Render the image when present, else a themed placeholder** — replace the TODO comment (`WordLearnConcrete.tsx:16`, `WordPicReview.tsx:27`) with: pick `item.media?.imageUrlDark` when `useTheme().dark` and it exists, else `item.media?.imageUrl`; if the url is the placeholder sentinel `'placeholder'` (or missing), render a rounded `T.sunken` block sized to `radii.image` with the word's first letter in `T.faint` (calm placeholder), instead of an `<Image>`. Keep it pure.

- [ ] **Step 2: Wire the real envelope** — where `LiveWaveform`/`Waveform` is shown during audio, pass `item.audio.envelope` so the bar heights come from the seeded RMS envelope (per `../soundbar.md`). If absent, fall back to the seeded `Waveform`.

- [ ] **Step 3: Update snapshots after eyeballing** — `npx jest src/screens/WordLearnConcrete.test.tsx src/screens/WordPicReview.test.tsx -u`.

- [ ] **Step 4: Commit**

```bash
git add src/screens/WordLearnConcrete.tsx src/screens/WordPicReview.tsx src/screens/__snapshots__/WordLearnConcrete.test.tsx.snap src/screens/__snapshots__/WordPicReview.test.tsx.snap
git commit -m "feat(card): render images (placeholder-aware) + real audio envelope"
```

---

### Task 12: Author the golden-slice content manifest

**Files:**
- Create: `content-pipeline/golden-slice.json`

Dispatch the `latvian-linguist` agent to draft every field (`draft`, for Elizabete). The manifest drives Task 13. Content set (from the spec's coverage matrix):

- [ ] **Step 1: Author the manifest** with this shape (lemmas, phrases, drills, plus distractor-filler lemmas so each `word_class` has ≥4 candidates):

```jsonc
{
  "voice": "alloy",
  "lemmas": [
    { "slug": "maja",  "lemma": "māja",  "gloss": "house",  "wordClass": "concrete", "pron": "MAH-ya", "media": "placeholder", "seedState": { "stage": "review", "reps": 1 } },
    { "slug": "kafija","lemma": "kafija","gloss": "coffee", "wordClass": "concrete", "pron": "KAH-fee-ya", "media": "placeholder", "seedState": { "stage": "new", "reps": 0 } },
    { "slug": "suns",  "lemma": "suns",  "gloss": "dog",    "wordClass": "concrete", "pron": "soons" },
    { "slug": "brivs", "lemma": "brīvs", "gloss": "free",   "wordClass": "abstract", "pron": "BREEVS", "mnemonic": { "soundsLike": "breeze", "note": "a free breeze" }, "seedState": { "stage": "new", "reps": 0 } },
    { "slug": "labs",  "lemma": "labs",  "gloss": "good",   "wordClass": "abstract", "pron": "labs", "seedState": { "stage": "review", "reps": 1 } },
    { "slug": "ludzu", "lemma": "lūdzu", "gloss": "please", "wordClass": "function", "pron": "LOO-dzu", "examples": [ { "pre": "", "w": "Lūdzu", "post": ", nāc.", "en": "Please, come." } ], "seedState": { "stage": "new", "reps": 0 } },
    { "slug": "viens", "lemma": "viens", "gloss": "one",    "wordClass": "function", "pron": "VEE-ens", "seedState": { "stage": "review", "reps": 3 } }
  ],
  "phrases": [
    { "slug": "ph-ludzu",  "target": "Lūdzu.",                "gloss": "Please.",            "components": ["ludzu"],               "seedState": { "stage": "new", "reps": 0 } },
    { "slug": "ph-labs-suns","target": "Labs suns.",          "gloss": "Good dog.",          "components": ["labs","suns"],         "seedState": { "stage": "learning", "reps": 1 } },
    { "slug": "ph-kafija", "target": "Vienu kafiju, lūdzu.",  "gloss": "One coffee, please.","components": ["viens","kafija","ludzu"], "seedState": { "stage": "review", "reps": 2 } }
  ],
  "drills": [
    { "slug": "drill-loti", "target": "ļoti", "gloss": "very", "pron": "LYO-tee", "a": "lācis", "b": "ļoti", "correct": "b", "contrastType": "palatalization" },
    { "slug": "drill-lieta","target": "lieta","gloss": "thing","pron": "LYEH-ta","a": "lieta","b": "lēta","correct": "a","contrastType": "diphthong", "glide": { "combo": "ie", "from": "i", "to": "e" } }
  ],
  "knownForTestUser": ["ludzu", "viens", "maja", "labs", "suns"]
}
```

  `knownForTestUser` is set so **"Vienu kafiju, lūdzu." starts LOCKED** (kafija + one other unknown) and **unlocks** once kafija is learned in-session. The `latvian-linguist` confirms glosses/pron and may add filler lemmas for distractor pools.

- [ ] **Step 2: Commit**

```bash
git add content-pipeline/golden-slice.json
git commit -m "content: golden-slice manifest (draft, pending native QA)"
```

---

### Task 13: Golden-slice seed script

**Files:**
- Create: `content-pipeline/seed-golden-slice.mjs`

Extends `tts.mjs` patterns (audio + envelope + upload). Idempotent (delete-then-insert by slug). Needs `OPENAI_API_KEY` (`../.env`) + `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1: Implement** the script to, for the manifest:
  1. Generate native + slow MP3 + RMS envelope per lemma/phrase/drill (reuse `tts.mjs` `synth`/envelope).
  2. Upload to the `content-audio` bucket.
  3. Upsert `lemmas` (with `native_url, slow_url, envelope, pron, word_class, gloss_en, media, mnemonic, examples, qa_status='draft'`), `phrases` (+ `phrase_components` rows from `components`), `minimal_pairs` (+ `glide` column — add a migration if the column doesn't exist).
  4. Insert engineered `review_state` rows for the **test user** from each item's `seedState`.
  5. Insert `known_lemmas` rows for the test user from `knownForTestUser`.
  Resolve the test user id by email via the service-role client.

- [ ] **Step 2: Add a `minimal_pairs.glide` column migration if needed** — `supabase/migrations/00NN_minimal_pairs_glide.sql`: `alter table minimal_pairs add column if not exists glide jsonb;`

- [ ] **Step 3: Run it**

Run: `cd content-pipeline && node seed-golden-slice.mjs`
Expected: prints inserted counts; no errors.

- [ ] **Step 4: Verify rows landed** (service-role SQL): counts for lemmas/phrases/phrase_components/minimal_pairs/review_state/known_lemmas match the manifest.

- [ ] **Step 5: Commit**

```bash
git add content-pipeline/seed-golden-slice.mjs supabase/migrations/
git commit -m "feat(seed): golden-slice seeder (TTS + content + engineered SRS state)"
```

---

### Task 14: End-to-end verification + light/dark polish

**Files:** none new — verification + targeted polish only.

- [ ] **Step 1: Full CI gate**

Run: `npx tsc --noEmit && npx eslint . && npx jest`
Expected: all green.

- [ ] **Step 2: Drive the app** via the `run-and-view-app` skill (web preview + chrome-devtools MCP). Sign in as the test user, start a session, and step through the deck. Screenshot **each card kind in light AND dark**; compare the drill + diphthong cards to `../handover/drill_cards_handoff/Drill Cards Preview.html`.

- [ ] **Step 3: Verify the unlock flow** — confirm **"Vienu kafiju, lūdzu." renders LOCKED**, then after learning **kafija** it shows **`phrase/unlock`** with the chime, then becomes a normal phrase card.

- [ ] **Step 4: Polish pass** — for any card with a hard-coded color or a light/dark glitch found in Step 2, switch it to a `useTheme()` token and re-screenshot. Commit each fix:

```bash
git add src/screens/<fixed>.tsx src/screens/__snapshots__/<fixed>.snap
git commit -m "polish(card): light/dark fixes for <card>"
```

- [ ] **Step 5: Verify on a phone** (Expo Go tunnel) — the full deck once, both themes.

---

## Self-review (completed by plan author)

**Spec coverage:**
- Diphthong card + GlideTrack + new kind → Tasks 1,2,3,8,9. ✓
- Refine DrillScreen to mockup → Task 10. ✓
- Phrase i+1 lock/unlock gating → Tasks 4,5. ✓
- Runtime distractors → Task 6. ✓
- Image un-stub (placeholder) + real envelope → Task 11. ✓
- Sound-inventory doc → Task 7. ✓
- Golden content + seed (OpenAI TTS, engineered review_state, known_lemmas) → Tasks 12,13. ✓
- Ordering bias (drills first) → encoded via `seedState` in Task 12 (drills `learning`, surfaced early); rule documented in the spec. ✓
- Light/dark polish + verify each card + on phone → Task 14. ✓
- Recorder stubbed / no scoring → unchanged (no task touches the recorder). ✓

**Placeholder scan:** Logic tasks (1–7) carry complete code + tests. UI-port tasks (8–10) reference the verbatim source (`screens-drill.jsx`) with explicit stage machines, props, and the wrong-answer rule — a provided artifact, not a hand-wave. Seed tasks (12–13) give the exact manifest + responsibilities. No "TBD/handle edge cases" left.

**Type consistency:** `ReviewGlide{combo,from,to}`, `item.glide`, `item.componentLemmaIds`, `lockState(ids, known)→{locked,unknownCount}`, `decideKind(item,known,seenLocked)→{kind,nowUnlocked}`, kind `'diphthong'` — names consistent across Tasks 1–9. The `get_distractors` RPC arg/column names are flagged to confirm against the migration before use.
