# Literal / Usage Notes on Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a word's/phrase's literal reading alongside its functional meaning — only where the two genuinely differ — on the first-exposure learn cards and the phrase cards.

**Architecture:** Two nullable columns (`literal_gloss`, `usage_note`) on `lemmas` and `phrases` flow DB → hand-written row type → pure mapper → `ReviewItem.literal` / `.usageNote` → a single pure `LiteralNote` chrome component rendered by the three `word/learn-*` cards, `PhraseHear`, and `PhraseMeaning`. The card boundary is unchanged (data-in / events-out). The dormant `literalNote` field is removed.

**Tech Stack:** Expo / React Native (TypeScript strict), Jest (`logic` = ts-jest/node, `components` = jest-expo), Supabase Postgres, `@testing-library/react-native`.

## Global Constraints

- **Cards are pure:** presentational only, render from `item` fields, never import a service, never hard-code content. (CLAUDE.md non-negotiable boundary.)
- **TypeScript everywhere; no `any`** in card/controller contracts.
- **Theme tokens from `useTheme()`**, never magic color values (`T.sub`, `T.faint`, `T.ink`, etc.).
- **Note appears only where authored** — `LiteralNote` renders `null` when `literal` is absent, so every card may render it unconditionally.
- **`is_idiom` routing is OUT OF SCOPE.** `renderFor` is untouched. Do not make any phrase an idiom in this work.
- **No new TTS / audio.** Content is text only.
- **Live DB writes are gated** — applying migration `0008` and re-running the seeder happen ONLY in Task 7, which PAUSES for explicit user approval (project `necfghfotwykjsykccsa`).
- **Keep CI green on every change:** `npm run lint`, `npm run typecheck`, `npm test` all pass.
- **Content correction (folded in):** `labdien` means **"good day"**, not "hello" (`sveiki` = hello). Fix its gloss and the `ph-intro` phrase gloss.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0008_literal_usage.sql` | **Create** — add `literal_gloss`, `usage_note` (both nullable text) to `lemmas` + `phrases` |
| `src/services/supabase/types.ts` | Add the two fields to `LemmaRow` + `PhraseRow` |
| `src/types/reviewItem.ts` | Add `literal?` + `usageNote?`; remove dormant `literalNote?` |
| `src/services/supabase/mappers.ts` | Populate `literal` / `usageNote` in both row mappers |
| `src/services/supabase/mappers.test.ts` | Fixture fields + new mapper assertions |
| `src/components/cardChrome.tsx` | Add pure `LiteralNote` component |
| `src/components/cardChrome.test.tsx` | **Create** — test `LiteralNote` in isolation |
| `src/screens/WordLearnConcrete.tsx` / `WordLearnAbstract.tsx` / `WordLearnFunction.tsx` | Render `<LiteralNote>` below the gloss |
| `src/screens/WordLearn*.test.tsx` | Assert note shows/hides |
| `src/screens/PhraseHear.tsx` / `.test.tsx` | Render `<LiteralNote>`; assert |
| `src/screens/PhraseMeaning.tsx` / `.test.tsx` | Use real `literal`/`usageNote`; drop `MeaningExtra`/`literalNote`; assert |
| `content-pipeline/golden-slice.json` | Add `literal`/`usageNote` to gap items; fix `labdien` + `ph-intro` glosses |
| `content-pipeline/seed-golden-slice.mjs` | Write the two columns for lemmas + phrases |

---

## Task 1: Data layer — columns, types, contract field, mapper

**Files:**
- Create: `supabase/migrations/0008_literal_usage.sql`
- Modify: `src/services/supabase/types.ts` (`LemmaRow` after line 39 `qa_status`; `PhraseRow` after line 52 `qa_status`)
- Modify: `src/types/reviewItem.ts:86` (remove `literalNote?`; add `literal?` + `usageNote?`)
- Modify: `src/services/supabase/mappers.ts` (`lemmaRowToReviewItem` ~line 57-59; `phraseRowToReviewItem` ~line 68-81)
- Test: `src/services/supabase/mappers.test.ts` (fixtures lines 19-59; new tests in the two existing `describe` blocks)

**Interfaces:**
- Produces: `ReviewItem.literal?: string`, `ReviewItem.usageNote?: string` (consumed by Tasks 2-5). `LemmaRow.literal_gloss: string | null`, `LemmaRow.usage_note: string | null`, same two on `PhraseRow`. Mappers set `item.literal` / `item.usageNote` from the row (SQL `null` → field left `undefined`).

- [ ] **Step 1: Add the two new fields to the mapper-test fixtures (so the suite still type-checks once the row types gain non-optional columns)**

In `src/services/supabase/mappers.test.ts`, add to the `lemma()` fixture object (after `qa_status: 'locked',` on line 39):

```ts
    literal_gloss: null,
    usage_note: null,
```

And to the `phrase()` fixture object (after `qa_status: 'locked',` on line 55):

```ts
    literal_gloss: null,
    usage_note: null,
```

- [ ] **Step 2: Write the failing mapper tests**

In `src/services/supabase/mappers.test.ts`, inside `describe('lemmaRowToReviewItem', ...)` add:

```ts
  it('maps literal_gloss + usage_note onto literal + usageNote', () => {
    const item = lemmaRowToReviewItem(lemma({ literal_gloss: 'like / as', usage_note: 'used as "how"' }));
    expect(item.literal).toBe('like / as');
    expect(item.usageNote).toBe('used as "how"');
  });

  it('leaves literal + usageNote undefined when the columns are null', () => {
    const item = lemmaRowToReviewItem(lemma({ literal_gloss: null, usage_note: null }));
    expect(item.literal).toBeUndefined();
    expect(item.usageNote).toBeUndefined();
  });
```

Inside `describe('phraseRowToReviewItem', ...)` add:

```ts
  it('maps literal_gloss + usage_note onto literal + usageNote', () => {
    const item = phraseRowToReviewItem(phrase({ literal_gloss: 'how to-you goes?', usage_note: 'everyday greeting' }));
    expect(item.literal).toBe('how to-you goes?');
    expect(item.usageNote).toBe('everyday greeting');
  });

  it('leaves literal + usageNote undefined when the columns are null', () => {
    const item = phraseRowToReviewItem(phrase({ literal_gloss: null, usage_note: null }));
    expect(item.literal).toBeUndefined();
    expect(item.usageNote).toBeUndefined();
  });
```

- [ ] **Step 3: Run the new tests — verify they fail**

Run: `npx jest src/services/supabase/mappers.test.ts -t "literal"`
Expected: FAIL — `literal_gloss`/`usage_note` are not valid `Partial<LemmaRow>`/`Partial<PhraseRow>` keys yet (TS error), and `item.literal` is `undefined`.

- [ ] **Step 4: Add the columns to the hand-written row types**

In `src/services/supabase/types.ts`, in `LemmaRow` immediately after `qa_status: 'draft' | 'native_ok' | 'locked';` (line 37) add:

```ts
  // Literal/usage note (0008): the literal reading + a freeform usage nuance. Both null unless authored.
  literal_gloss: string | null;
  usage_note: string | null;
```

In `PhraseRow` immediately after its `qa_status: 'draft' | 'native_ok' | 'locked';` (line 52) add the same two lines:

```ts
  literal_gloss: string | null;
  usage_note: string | null;
```

- [ ] **Step 5: Add the contract fields and remove the dormant one**

In `src/types/reviewItem.ts`, delete line 86 (`  literalNote?: string;`) and the surrounding visual-sync block stays. Replace the `literalNote?: string;` line with:

```ts
  // literal/actual notes (optional, presentational) — surfaced only where the literal reading
  // differs from the functional gloss. literal = the word-for-word reading; usageNote = nuance.
  literal?: string;
  usageNote?: string;
```

(The other visual-sync fields `newForm`, `newLemma`, `lockLemma`, `lockRemaining` on lines 82-85 stay unchanged.)

- [ ] **Step 6: Populate the fields in both mappers**

In `src/services/supabase/mappers.ts`, in `lemmaRowToReviewItem`, immediately before `return item;` (after the `if (row.examples)` line ~59) add:

```ts
  if (row.literal_gloss) item.literal = row.literal_gloss;
  if (row.usage_note) item.usageNote = row.usage_note;
```

In `phraseRowToReviewItem`, the function currently `return`s an object literal. Refactor it to build a named `item` first, then conditionally attach the fields (mirroring the lemma mapper), so the optional fields stay absent when null:

```ts
export function phraseRowToReviewItem(
  row: PhraseRow,
  reviewState?: Pick<ReviewStateRow, 'stage' | 'reps'>,
): ReviewItem {
  const { stage, reps } = stageAndReps(reviewState);
  const item: ReviewItem = {
    id: row.id,
    type: 'phrase',
    stage,
    reps,
    target: row.target,
    gloss: row.gloss_en,
    isIdiom: row.is_idiom,
    audio: {
      nativeUrl: row.audio_url ?? '',
      ...(row.envelope ? { envelope: row.envelope } : {}),
    },
  };
  if (row.literal_gloss) item.literal = row.literal_gloss;
  if (row.usage_note) item.usageNote = row.usage_note;
  return item;
}
```

- [ ] **Step 7: Run the mapper tests — verify they pass**

Run: `npx jest src/services/supabase/mappers.test.ts`
Expected: PASS (all mapper tests, including the four new ones).

- [ ] **Step 8: Create the migration**

Create `supabase/migrations/0008_literal_usage.sql`:

```sql
-- =====================================================================
-- PocketPolyglot — 0008_literal_usage.sql
-- Some words/phrases read differently word-for-word than they function
-- (e.g. kā = literally "like/as" but used as "how"). Add two nullable
-- text columns to lemmas + phrases to carry that note:
--   literal_gloss — the literal / word-for-word reading
--   usage_note    — a short freeform usage nuance
-- Both nullable; rows with no literal/actual gap simply leave them null.
-- No data backfill here — the golden-slice seeder populates them.
-- =====================================================================

alter table public.lemmas
  add column if not exists literal_gloss text,
  add column if not exists usage_note text;

alter table public.phrases
  add column if not exists literal_gloss text,
  add column if not exists usage_note text;
```

(Do NOT apply it to the live DB here — that is Task 7, gated.)

- [ ] **Step 9: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS — no `literalNote` references remain except in `PhraseMeaning.tsx` (its own local `MeaningExtra` type, removed in Task 5).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0008_literal_usage.sql src/services/supabase/types.ts src/types/reviewItem.ts src/services/supabase/mappers.ts src/services/supabase/mappers.test.ts
git commit -m "feat(content): literal_gloss + usage_note data layer (columns, mapper, ReviewItem)"
```

---

## Task 2: `LiteralNote` presentational component

**Files:**
- Modify: `src/components/cardChrome.tsx` (add component near `GlossLine`, line ~73; add styles to the `chrome` StyleSheet, line ~263)
- Test: `src/components/cardChrome.test.tsx` (create)

**Interfaces:**
- Consumes: `ReviewItem.literal` / `.usageNote` (passed as props by callers).
- Produces: `LiteralNote({ literal?: string; usageNote?: string }): React.JSX.Element | null` — returns `null` when `literal` is falsy; otherwise a "Literally: …" line plus an optional usage line. Exported from `cardChrome`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/cardChrome.test.tsx`:

```tsx
// LiteralNote is PURE (theme + props only). Render it under ThemeProvider with fixture props and
// assert it shows the literal/usage text when authored, and renders nothing when there is no literal.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { LiteralNote } from './cardChrome';

function renderNote(props: { literal?: string; usageNote?: string }) {
  return render(
    <ThemeProvider>
      <LiteralNote {...props} />
    </ThemeProvider>,
  );
}

describe('LiteralNote', () => {
  it('shows the literal reading and the usage note when both are present', () => {
    const u = renderNote({ literal: 'like / as', usageNote: 'used as "how"' });
    expect(u.getByText(/like \/ as/)).toBeTruthy();
    expect(u.getByText('used as "how"')).toBeTruthy();
  });

  it('shows the literal reading alone when there is no usage note', () => {
    const u = renderNote({ literal: 'I ask / beg' });
    expect(u.getByText(/I ask \/ beg/)).toBeTruthy();
  });

  it('renders nothing when there is no literal reading', () => {
    const u = renderNote({ usageNote: 'orphan note' });
    expect(u.toJSON()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx jest src/components/cardChrome.test.tsx`
Expected: FAIL — `LiteralNote` is not exported from `cardChrome`.

- [ ] **Step 3: Add the `LiteralNote` component**

In `src/components/cardChrome.tsx`, immediately after the `GlossLine` component (ends line 73), add:

```tsx
// ── literal / usage note (learn cards + phrase cards) ──────────────────────
// Optional, presentational. Renders nothing unless a literal reading is authored on the item — so
// callers may mount it unconditionally. `literal` = the word-for-word reading; `usageNote` = nuance.
export function LiteralNote({ literal, usageNote }: { literal?: string; usageNote?: string }): React.JSX.Element | null {
  const T = useTheme();
  if (!literal) return null;
  return (
    <View style={chrome.litNote}>
      <Text style={[chrome.litLine, { color: T.sub }]}>
        <Text style={{ fontWeight: '700' }}>Literally: </Text>
        {literal}
      </Text>
      {usageNote ? <Text style={[chrome.litUsage, { color: T.faint }]}>{usageNote}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 4: Add the styles**

In `src/components/cardChrome.tsx`, inside the `chrome` `StyleSheet.create({ ... })` (starts line 263), add these entries (e.g. after the `footNote` entry on line 270):

```ts
  litNote: { width: '100%', alignItems: 'center', rowGap: 3, marginTop: 2 },
  litLine: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  litUsage: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 18 },
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `npx jest src/components/cardChrome.test.tsx`
Expected: PASS (all three).

- [ ] **Step 6: Typecheck + lint, then commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/components/cardChrome.tsx src/components/cardChrome.test.tsx
git commit -m "feat(cards): add pure LiteralNote chrome component"
```

---

## Task 3: Render `LiteralNote` on the word learn cards

**Files:**
- Modify: `src/screens/WordLearnConcrete.tsx`, `src/screens/WordLearnAbstract.tsx`, `src/screens/WordLearnFunction.tsx`
- Test: `src/screens/WordLearnConcrete.test.tsx`, `src/screens/WordLearnAbstract.test.tsx`, `src/screens/WordLearnFunction.test.tsx`

**Interfaces:**
- Consumes: `LiteralNote` from `../components/cardChrome`; `item.literal` / `item.usageNote`.

- [ ] **Step 1: Write a failing test for each card (note shows when authored)**

Add this test to each of the three `WordLearn*.test.tsx` files. Use that file's existing fixture/render helper — these files already build a fixture `ReviewItem` and render under `ThemeProvider`. Pass `literal` + `usageNote` via the fixture override and assert the text appears. Example for `WordLearnFunction.test.tsx` (adapt the helper name to each file):

```tsx
  it('shows the literal/usage note when the item carries one', () => {
    const u = renderCard({ literal: 'like / as', usageNote: 'used as "how"' });
    expect(u.getByText(/like \/ as/)).toBeTruthy();
    expect(u.getByText('used as "how"')).toBeTruthy();
  });

  it('shows no literal note when the item has none', () => {
    const u = renderCard();
    expect(u.queryByText(/Literally:/)).toBeNull();
  });
```

If a file's render helper does not accept overrides, add an `overrides: Partial<ReviewItem>` parameter that spreads into the fixture (match the pattern in `PhraseHear.test.tsx` lines 15-41).

- [ ] **Step 2: Run the three tests — verify they fail**

Run: `npx jest src/screens/WordLearnConcrete.test.tsx src/screens/WordLearnAbstract.test.tsx src/screens/WordLearnFunction.test.tsx -t "literal/usage note"`
Expected: FAIL — `getByText(/like \/ as/)` finds nothing (the cards don't render it yet).

- [ ] **Step 3: Render `LiteralNote` in `WordLearnConcrete.tsx`**

Add `LiteralNote` to the `cardChrome` import (line 8) and render it directly below `GlossLine` (after line 25):

```tsx
import { Eyebrow, WordTag, WordHero, GlossLine, Caption, FootNote, CardBody, CardFooter, HeadRow, LiteralNote, wordTagFor } from '../components/cardChrome';
```

```tsx
        <GlossLine gloss={item.gloss} pron={item.pron} size={17} />
        <LiteralNote literal={item.literal} usageNote={item.usageNote} />
```

- [ ] **Step 4: Render `LiteralNote` in `WordLearnAbstract.tsx`**

Add `LiteralNote` to the `cardChrome` import (line 7) and render it after the `GlossLine` (line 22), before the `MnemonicCard`:

```tsx
import { Eyebrow, WordTag, WordHero, GlossLine, Caption, FootNote, CardBody, CardFooter, HeadRow, MnemonicCard, ExampleRow, LiteralNote, wordTagFor } from '../components/cardChrome';
```

```tsx
        <GlossLine gloss={item.gloss} pron={item.pron} size={17} />
        <LiteralNote literal={item.literal} usageNote={item.usageNote} />
        {item.mnemonic ? <MnemonicCard soundsLike={item.mnemonic.soundsLike} note={item.mnemonic.note} /> : null}
```

- [ ] **Step 5: Render `LiteralNote` in `WordLearnFunction.tsx`**

Add `LiteralNote` to the `cardChrome` import (line 7) and render it after the `GlossLine` (line 22), before the `examples` `View`:

```tsx
import { Eyebrow, WordTag, WordHero, GlossLine, Caption, FootNote, CardBody, CardFooter, HeadRow, ExampleRow, LiteralNote, wordTagFor } from '../components/cardChrome';
```

```tsx
        <GlossLine gloss={item.gloss} pron={item.pron} size={17} />
        <LiteralNote literal={item.literal} usageNote={item.usageNote} />
        <View style={styles.examples}>
```

- [ ] **Step 6: Run the three card tests — verify they pass**

Run: `npx jest src/screens/WordLearnConcrete.test.tsx src/screens/WordLearnAbstract.test.tsx src/screens/WordLearnFunction.test.tsx`
Expected: PASS. If a pre-existing snapshot test fails, confirm the diff is ONLY the added note for the new-fixture case (the no-note fixtures must be byte-identical — `LiteralNote` returns `null`); if a snapshot legitimately needs the new node, update with `npx jest <file> -u` and eyeball the diff.

- [ ] **Step 7: Typecheck + lint, then commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/screens/WordLearnConcrete.tsx src/screens/WordLearnAbstract.tsx src/screens/WordLearnFunction.tsx src/screens/WordLearnConcrete.test.tsx src/screens/WordLearnAbstract.test.tsx src/screens/WordLearnFunction.test.tsx
git commit -m "feat(cards): show LiteralNote on word learn cards"
```

---

## Task 4: Render `LiteralNote` on `PhraseHear`

**Files:**
- Modify: `src/screens/PhraseHear.tsx` (import line 12; body after the hint block, line ~55)
- Test: `src/screens/PhraseHear.test.tsx`

**Interfaces:**
- Consumes: `LiteralNote` from `../components/cardChrome`; `item.literal` / `item.usageNote`.

- [ ] **Step 1: Write the failing test**

In `src/screens/PhraseHear.test.tsx`, inside `describe('PhraseHear', ...)` add:

```tsx
  it('shows the literal/usage note when the phrase carries one', () => {
    const u = renderCard({ literal: 'how to-you goes?', usageNote: 'everyday "How are you?"' });
    expect(u.getByText(/how to-you goes\?/)).toBeTruthy();
    expect(u.getByText('everyday "How are you?"')).toBeTruthy();
  });

  it('shows no literal note when the phrase has none', () => {
    const u = renderCard();
    expect(u.queryByText(/Literally:/)).toBeNull();
  });
```

(`renderCard` already accepts `overrides: Partial<ReviewItem>` — see lines 29-41.)

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx jest src/screens/PhraseHear.test.tsx -t "literal/usage note"`
Expected: FAIL — note text not found.

- [ ] **Step 3: Render `LiteralNote` in `PhraseHear.tsx`**

Add `LiteralNote` to the `cardChrome` import (line 12):

```tsx
import { CardIcon, Eyebrow, PhraseLine, LiteralNote } from '../components/cardChrome';
```

Render it after the hint `Text` block (the `{x.newLemma || x.newForm ? (...) : null}` block ending line 55), before the `audio hero` comment:

```tsx
        ) : null}

        <View style={{ marginTop: 14 }}>
          <LiteralNote literal={item.literal} usageNote={item.usageNote} />
        </View>

        {/* audio hero */}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx jest src/screens/PhraseHear.test.tsx`
Expected: PASS. If the existing snapshot test fails, confirm the no-note fixture render is unchanged (it must be — `LiteralNote` returns `null`); the wrapping `View` with no children renders an empty view, so if the snapshot differs, update with `npx jest src/screens/PhraseHear.test.tsx -u` and verify the only change is the empty wrapper.

- [ ] **Step 5: Typecheck + lint, then commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/screens/PhraseHear.tsx src/screens/PhraseHear.test.tsx
git commit -m "feat(cards): show LiteralNote on PhraseHear first exposure"
```

---

## Task 5: Wire `PhraseMeaning` to the real literal/usage data

**Files:**
- Modify: `src/screens/PhraseMeaning.tsx` (remove `MeaningExtra` line 21 + the cast line 25 usage; feedback line 40-44; import line 14; render after choices line 82)
- Test: `src/screens/PhraseMeaning.test.tsx`

**Interfaces:**
- Consumes: `LiteralNote` from `../components/cardChrome`; `item.literal` / `item.usageNote`.

- [ ] **Step 1: Write the failing test (solved state shows the usage note as feedback + the literal reading)**

In `src/screens/PhraseMeaning.test.tsx`, inside `describe('PhraseMeaning', ...)` add this test. The file's `renderCard(overrides)` helper (line 28) builds a fixture whose correct choice has gloss `'Good morning!'` (`fixtureItem` lines 11-26) — press that to reach the solved state:

```tsx
  it('on a correct answer shows the usage note and the literal reading', () => {
    const u = renderCard({
      literal: 'how to-you goes?',
      usageNote: 'Everyday "How are you?"',
    });
    fireEvent.press(u.getByText('Good morning!')); // the fixture's correct choice
    expect(u.getByText('Everyday "How are you?"')).toBeTruthy();
    expect(u.getByText(/how to-you goes\?/)).toBeTruthy();
  });
```

(`fireEvent` is already imported in this file.)

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx jest src/screens/PhraseMeaning.test.tsx -t "usage note and the literal"`
Expected: FAIL — the card currently shows the hard-coded `'That's it — …'` string and never renders `item.literal`.

- [ ] **Step 3: Remove the dormant `MeaningExtra` type + cast**

In `src/screens/PhraseMeaning.tsx`:
- Delete line 20-21 (the comment `// Optional additive field: …` and `type MeaningExtra = { literalNote?: string };`).
- Change line 25 from `const x = item as ReviewItem & MeaningExtra;` to remove the cast — the component will read `item.usageNote` / `item.literal` directly. Delete the now-unused `x` declaration and the `ReviewItem` import if it becomes unused (check: `ReviewItem` is imported on line 18 only for the cast — remove that import if nothing else uses it).

- [ ] **Step 4: Use the real data for the feedback line + render the literal reading**

In `src/screens/PhraseMeaning.tsx`, add `LiteralNote` to the `cardChrome` import (line 14):

```tsx
import { PromptText, LiteralNote } from '../components/cardChrome';
```

Change the `feedback` computation (lines 40-44) to read `item.usageNote`:

```tsx
  const solved = correctValue !== null;
  const feedback = solved
    ? (item.usageNote ?? 'That’s it — the words don’t add up literally.')
    : wrongValue
      ? 'Not quite — give it another try.'
      : '';
```

Then render the literal reading in the solved state, after the feedback `Text` (line 84), passing `usageNote={undefined}` because the usage nuance is already the feedback line (do not show it twice):

```tsx
        <Text style={[styles.feedback, { color: solved ? T.sub : T.record }]}>{feedback}</Text>
        {solved ? <LiteralNote literal={item.literal} usageNote={undefined} /> : null}
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `npx jest src/screens/PhraseMeaning.test.tsx`
Expected: PASS. The default-fixture snapshot (no `literal`/`usageNote`) must be unchanged: in the solved state with no `usageNote` the feedback is still `'That's it — …'`, and `LiteralNote` returns `null`. If a snapshot differs, confirm the diff is only the new branch and update with `-u`.

- [ ] **Step 6: Typecheck + lint, then commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS. No `literalNote` or `MeaningExtra` references remain anywhere (`grep -rn "literalNote\|MeaningExtra" src/` returns nothing).

```bash
git add src/screens/PhraseMeaning.tsx src/screens/PhraseMeaning.test.tsx
git commit -m "feat(cards): PhraseMeaning uses real literal/usage data; drop dormant literalNote"
```

---

## Task 6: Seeder writes the columns + drafted golden-slice content

**Files:**
- Modify: `content-pipeline/seed-golden-slice.mjs` (lemma row build ~line 269-270; phrase row build ~line 283)
- Modify: `content-pipeline/golden-slice.json` (gap items + gloss corrections)

**Interfaces:**
- Consumes: optional `literal` / `usageNote` string fields on `golden-slice.json` lemma + phrase entries.

> **Content note (drafted by Claude — these are the "I draft, you approve" values; present them as the approval table in Task 7 before any live seed):**
> | Item | Current gloss | literal | usageNote / fix |
> | --- | --- | --- | --- |
> | `kā` (lemma) | how | `like / as` | `Used to ask "how" — as in Kā tev iet? (How are you?).` |
> | `lūdzu` (lemma) | please | `I ask / beg` | `Means "please" — and "you're welcome" when replying to thanks.` |
> | `Kā tev iet?` (phrase `ph-howareyou`) | How are you? | `how to-you goes?` | `Everyday "How are you?"` |
> | `labdien` (lemma) | ~~hello~~ → **good day** | — (no gap) | gloss correction only |
> | `Labdien, es esmu ___.` (`ph-intro`) | ~~Hello, I am ___.~~ → **Good day, I am ___.** | — | gloss correction (follows labdien) |

- [ ] **Step 1: Make the seeder write the lemma columns**

In `content-pipeline/seed-golden-slice.mjs`, find the lemma row build (the `if (l.mnemonic) row.mnemonic = l.mnemonic;` / `if (l.examples) row.examples = l.examples;` block, ~line 269-270). Immediately after those two lines add:

```js
    if (l.literal) row.literal_gloss = l.literal;
    if (l.usageNote) row.usage_note = l.usageNote;
```

- [ ] **Step 2: Make the seeder write the phrase columns**

In the phrase row build (~line 283), change:

```js
    const phraseRow = { target: p.target, gloss_en: p.gloss, audio_url: audioUrl, qa_status: SEED_QA_STATUS };
```

to add the two optional columns right after it:

```js
    const phraseRow = { target: p.target, gloss_en: p.gloss, audio_url: audioUrl, qa_status: SEED_QA_STATUS };
    if (p.literal) phraseRow.literal_gloss = p.literal;
    if (p.usageNote) phraseRow.usage_note = p.usageNote;
```

- [ ] **Step 3: Add the drafted content to `golden-slice.json`**

In `content-pipeline/golden-slice.json`:

Change the `ka` lemma (line 23) to add `literal` + `usageNote`:

```json
    { "slug": "ka",      "lemma": "kā",      "gloss": "how",   "wordClass": "function", "pron": "kah",     "literal": "like / as", "usageNote": "Used to ask \"how\" — as in Kā tev iet? (How are you?).", "seedState": { "stage": "new", "reps": 0, "order": 8 } },
```

Change the `ludzu` lemma (line 15) to add `literal` + `usageNote` (keep its existing `examples` + `seedState`):

```json
    { "slug": "ludzu", "lemma": "lūdzu", "gloss": "please", "wordClass": "function", "pron": "LOO-dzu", "literal": "I ask / beg", "usageNote": "Means \"please\" — and \"you're welcome\" when replying to thanks.", "examples": [ { "pre": "", "w": "Lūdzu", "post": ", nāc.", "en": "Please, come." } ], "seedState": { "stage": "new", "reps": 0, "order": 2 } },
```

Fix the `labdien` gloss (line 20): change `"gloss": "hello"` to `"gloss": "good day"`:

```json
    { "slug": "labdien", "lemma": "labdien", "gloss": "good day", "wordClass": "function", "pron": "LAHB-dyen", "seedState": { "stage": "new", "reps": 0, "order": 4 } },
```

Change the `ph-howareyou` phrase (line 33) to add `literal` + `usageNote`:

```json
    { "slug": "ph-howareyou", "target": "Kā tev iet?",           "gloss": "How are you?",    "components": ["ka","tev","iet"],      "literal": "how to-you goes?", "usageNote": "Everyday \"How are you?\"", "seedState": { "stage": "new", "reps": 0, "order": 7 } }
```

Fix the `ph-intro` phrase gloss (line 32): change `"gloss": "Hello, I am ___."` to `"gloss": "Good day, I am ___."`:

```json
    { "slug": "ph-intro",     "target": "Labdien, es esmu ___.", "gloss": "Good day, I am ___.", "components": ["labdien","es","esmu"], "seedState": { "stage": "new", "reps": 0, "order": 3 } },
```

- [ ] **Step 4: Validate the manifest parses and carries the fields**

Run:

```bash
node -e "const m=require('./content-pipeline/golden-slice.json'); const ka=m.lemmas.find(l=>l.slug==='ka'); const lu=m.lemmas.find(l=>l.slug==='ludzu'); const ld=m.lemmas.find(l=>l.slug==='labdien'); const hp=m.phrases.find(p=>p.slug==='ph-howareyou'); const ip=m.phrases.find(p=>p.slug==='ph-intro'); if(ka.literal!=='like / as'||!ka.usageNote) throw new Error('ka'); if(lu.literal!=='I ask / beg'||!lu.usageNote) throw new Error('ludzu'); if(ld.gloss!=='good day') throw new Error('labdien gloss'); if(hp.literal!=='how to-you goes?'||!hp.usageNote) throw new Error('howareyou'); if(ip.gloss!=='Good day, I am ___.') throw new Error('intro gloss'); console.log('manifest OK');"
```

Expected: prints `manifest OK`.

- [ ] **Step 5: Confirm the seeder references the new columns**

Run: `grep -n "literal_gloss\|usage_note" content-pipeline/seed-golden-slice.mjs`
Expected: shows the four added assignments (two lemma, two phrase).

- [ ] **Step 6: Commit**

```bash
git add content-pipeline/seed-golden-slice.mjs content-pipeline/golden-slice.json
git commit -m "content: seed literal/usage notes + fix labdien/ph-intro glosses (good day)"
```

---

## Task 7: Live persistence — apply migration + re-seed (GATED — PAUSE FOR USER APPROVAL)

**This task writes to the live Supabase project. Do NOT run any step without the user's explicit go-ahead in this session.**

**Files:** none (live DB operations only).

- [ ] **Step 1: Present the content approval table**

Show the user the drafted-content table from Task 6 (the five rows: `kā`, `lūdzu`, `Kā tev iet?`, and the `labdien` / `ph-intro` gloss corrections). Ask them to approve or edit each. Apply any edits to `golden-slice.json` and re-commit before proceeding. **Wait for explicit approval.**

- [ ] **Step 2: Apply migration `0008` to the live project (after approval)**

Use the Supabase MCP `apply_migration` tool with project `necfghfotwykjsykccsa`, migration name `0008_literal_usage`, and the SQL body from `supabase/migrations/0008_literal_usage.sql`.
Verify: query `information_schema.columns` (via `execute_sql`) for `lemmas` and `phrases` and confirm `literal_gloss` + `usage_note` exist on both.

- [ ] **Step 3: Re-run the golden-slice seeder (after approval)**

Run the seeder per its existing usage (the same command used for the card-polish Task 5 seed; check `content-pipeline/seed-golden-slice.mjs` header / `package.json` for the exact invocation and required env, e.g. `OPENAI_API_KEY` from `../.env`). It is idempotent (delete-then-insert). Text content only — no new TTS is needed for the note columns, but the seeder regenerates audio as part of its normal run.

- [ ] **Step 4: Verify the live rows**

Via `execute_sql`, confirm the seeded rows carry the notes:

```sql
select lemma, gloss_en, literal_gloss, usage_note from public.lemmas where lemma in ('kā','lūdzu','labdien');
select target, gloss_en, literal_gloss, usage_note from public.phrases where target in ('Kā tev iet?','Labdien, es esmu ___.');
```

Expected: `kā` + `lūdzu` carry `literal_gloss`/`usage_note`; `labdien` gloss = `good day`; `Kā tev iet?` carries the note; `Labdien, es esmu ___.` gloss = `Good day, I am ___.`

- [ ] **Step 5: Update the progress ledger**

Append a line to `.superpowers/sdd/progress.md` noting the live migration applied + seeder run + the verification query results.

---

## Self-Review

**1. Spec coverage:**
- Data model (two nullable columns, both tables) → Task 1 (migration, types, mapper) ✅
- `ReviewItem.literal` + `usageNote`; remove dormant `literalNote` → Task 1 Step 5 ✅
- Mapper population (null → undefined) → Task 1 Step 6 + tests Step 2 ✅
- Shared pure `LiteralNote` → Task 2 ✅
- Word learn cards render it (first exposure) → Task 3 ✅
- `PhraseHear` renders it → Task 4 ✅
- `PhraseMeaning` uses real data, drops `MeaningExtra`/`literalNote` → Task 5 ✅
- Seeder writes columns + drafted content + `labdien`/`ph-intro` gloss fixes → Task 6 ✅
- Gated live apply + seeder + approval table → Task 7 ✅
- `renderFor` untouched; `is_idiom` out of scope → respected (no task changes `renderFor.ts`) ✅
- Testing: mapper, component, each card, snapshots → Tasks 1-5 ✅

**2. Placeholder scan:** Task 5's test now uses the file's real `renderCard` helper and the concrete `'Good morning!'` correct-choice label (verified against `PhraseMeaning.test.tsx`). All steps carry complete code. No TBD/TODO.

**3. Type consistency:** `literal_gloss`/`usage_note` (DB/row) ↔ `literal`/`usageNote` (ReviewItem) used consistently across Tasks 1-6. `LiteralNote({ literal?, usageNote? })` signature matches every call site (Tasks 3-5). `phraseRowToReviewItem` refactor (object literal → named `item`) preserves all existing fields (`isIdiom`, audio spread) — verified against current source.
