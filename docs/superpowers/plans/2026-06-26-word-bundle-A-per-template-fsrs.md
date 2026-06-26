# Word-Bundle Plan A — Per-Template FSRS Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `review_state` a `template` dimension ('recognition' | 'pronunciation') so each quiz template can schedule independently, as a **non-breaking** increment — the visible loop behaves exactly as today.

**Architecture:** Add a `template` column + composite PK to `review_state`; backfill all existing rows to `'recognition'`. `submit()` partitions results by template (production card kinds → `'pronunciation'`, everything else → `'recognition'`). Reads (`getDueBatch`, `known_lemmas`) stay recognition-only for now, so the app is unchanged. Plans B and C make rendering template-aware and build the onboarding loop on this foundation.

**Tech Stack:** Supabase Postgres (migrations), TypeScript, `@supabase/supabase-js`, ts-fsrs, Vitest/Jest (`npm test`).

## Global Constraints

- TypeScript everywhere; no `any` in contracts (CLAUDE.md).
- Keep CI green every commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass.
- The `CardKind` id+k strings are stable analytics/deep-link keys — do not rename them.
- Migrations live in `supabase/migrations/`; never put a key in the client.
- This plan must NOT change any visible loop behavior. It is foundation only.
- Live project ref: `necfghfotwykjsykccsa`. Apply the migration via the Supabase MCP `apply_migration`.

---

### Task 1: Migration — `template` column, composite PK, `known_lemmas` redefinition

**Files:**
- Create: `supabase/migrations/0014_review_state_template.sql`

**Interfaces:**
- Produces: `review_state.template text not null default 'recognition'`; PK becomes `(user_id, item_type, item_id, template)`; `known_lemmas` view filters `template = 'recognition'`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0014_review_state_template.sql`:

```sql
-- Per-template FSRS scheduling: each quiz template ('recognition'|'pronunciation') gets its own
-- review_state row + schedule. Non-breaking: all existing rows backfill to 'recognition', and
-- known_lemmas keeps identical behaviour (it now explicitly filters the recognition template).

alter table public.review_state
  add column if not exists template text not null default 'recognition';

alter table public.review_state
  add constraint review_state_template_chk
  check (template in ('recognition', 'pronunciation'));

-- Widen the primary key to include template so (item) can carry independent schedules.
alter table public.review_state drop constraint review_state_pkey;
alter table public.review_state
  add constraint review_state_pkey
  primary key (user_id, item_type, item_id, template);

-- known_lemmas: a lemma is "known" once its RECOGNITION schedule reaches review/mature.
-- (Pronunciation maturity does not gate phrase unlocks.) Behaviour is unchanged because every
-- pre-existing row is now template='recognition'.
drop view if exists public.known_lemmas;
create view public.known_lemmas
  with (security_invoker = true) as
  select user_id, item_id as lemma_id
  from public.review_state
  where item_type = 'lemma'
    and template = 'recognition'
    and stage in ('review', 'mature');
```

- [ ] **Step 2: Apply the migration to the live project**

Use the Supabase MCP tool `apply_migration` with project_id `necfghfotwykjsykccsa`, name `review_state_template`, and the SQL above.

- [ ] **Step 3: Verify schema + non-breaking backfill**

Run via MCP `execute_sql`:

```sql
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='review_state' and column_name='template';
select count(*) as total, count(*) filter (where template='recognition') as recognition
from public.review_state;
select pg_get_viewdef('public.known_lemmas', true) as known_lemmas_def;
```

Expected: `template` exists, `not null`, default `'recognition'`; `total = recognition` (every row backfilled); view def includes `template = 'recognition'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_review_state_template.sql
git commit -m "feat(db): add per-template dimension to review_state (non-breaking)"
```

---

### Task 2: `ReviewStateRow.template` type + `cardKindToTemplate` pure function

**Files:**
- Modify: `src/services/supabase/types.ts` (the `ReviewStateRow` interface)
- Create: `src/services/supabase/cardTemplate.ts`
- Test: `src/services/supabase/cardTemplate.test.ts`

**Interfaces:**
- Produces: `type ReviewTemplate = 'recognition' | 'pronunciation'`; `cardKindToTemplate(cardKind: string): ReviewTemplate`; `ReviewStateRow.template: ReviewTemplate`.
- Consumes: the production card-kind set, identical to `PRODUCTION_CARD_KINDS` in `SupabaseSrsService.ts` (`'word/say'`, `'phrase/sayit'`, `'pron'`).

- [ ] **Step 1: Write the failing test**

Create `src/services/supabase/cardTemplate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { cardKindToTemplate } from './cardTemplate';

describe('cardKindToTemplate', () => {
  it('maps production (spoken) card kinds to pronunciation', () => {
    expect(cardKindToTemplate('word/say')).toBe('pronunciation');
    expect(cardKindToTemplate('phrase/sayit')).toBe('pronunciation');
    expect(cardKindToTemplate('pron')).toBe('pronunciation');
  });

  it('maps every other card kind to recognition', () => {
    expect(cardKindToTemplate('word/hear')).toBe('recognition');
    expect(cardKindToTemplate('word/learn-concrete')).toBe('recognition');
    expect(cardKindToTemplate('phrase/meaning')).toBe('recognition');
    expect(cardKindToTemplate('drill')).toBe('recognition');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cardTemplate`
Expected: FAIL — `cardTemplate` module not found.

- [ ] **Step 3: Implement `cardTemplate.ts`**

Create `src/services/supabase/cardTemplate.ts`:

```typescript
// Maps a CardKind to the FSRS scheduling template it grades. Production (spoken) cards train
// pronunciation; everything else trains recognition. This is the single source of truth for which
// review_state row (user_id,item_type,item_id,template) a graded result writes to.
export type ReviewTemplate = 'recognition' | 'pronunciation';

// Mirrors PRODUCTION_CARD_KINDS in SupabaseSrsService.ts (Module C2). Keep in sync.
const PRONUNCIATION_CARD_KINDS = new Set<string>(['word/say', 'phrase/sayit', 'pron']);

export function cardKindToTemplate(cardKind: string): ReviewTemplate {
  return PRONUNCIATION_CARD_KINDS.has(cardKind) ? 'pronunciation' : 'recognition';
}
```

- [ ] **Step 4: Add `template` to `ReviewStateRow`**

In `src/services/supabase/types.ts`, find the `ReviewStateRow` interface and add the field (and import/define `ReviewTemplate`):

```typescript
import type { ReviewTemplate } from './cardTemplate';

export interface ReviewStateRow {
  // ...existing fields (user_id, item_type, item_id, stage, reps, lapses, stability, difficulty, due_at, last_review)...
  template: ReviewTemplate;
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- cardTemplate && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/supabase/cardTemplate.ts src/services/supabase/cardTemplate.test.ts src/services/supabase/types.ts
git commit -m "feat(srs): cardKindToTemplate + ReviewStateRow.template"
```

---

### Task 3: `submit()` writes the per-template row

**Files:**
- Modify: `src/services/supabase/SupabaseSrsService.ts` (the `submit()` method: the `review_state` select + upsert)
- Test: `src/services/supabase/SupabaseSrsService.submit.test.ts` (extend existing submit tests if present; otherwise create)

**Interfaces:**
- Consumes: `cardKindToTemplate` (Task 2).
- Produces: `submit()` reads the prior schedule from the `(user_id,item_type,item_id,template)` row and upserts back to the same key with `onConflict: 'user_id,item_type,item_id,template'`.

- [ ] **Step 1: Write the failing test**

Create/extend `src/services/supabase/SupabaseSrsService.submit.test.ts`. Use the existing test harness/mock client pattern in the repo's other `SupabaseSrsService` tests (a fake `client` recording `.from().upsert()` calls). Assert the template is threaded:

```typescript
import { describe, it, expect } from 'vitest';
import { SupabaseSrsService } from './SupabaseSrsService';
import { makeFakeClient } from './testFakeClient'; // existing helper used by other SRS tests

describe('submit() per-template', () => {
  it('reads + upserts the pronunciation row for a word/say result', async () => {
    const fake = makeFakeClient(); // records review_state select/upsert filters + payloads
    const svc = new SupabaseSrsService(fake.client, 'user-1');
    await svc.submit({ itemId: 'lemma-1', cardKind: 'word/say', correct: true, spoke: true });
    expect(fake.lastReviewStateSelect).toMatchObject({ item_type: 'lemma', item_id: 'lemma-1', template: 'pronunciation' });
    expect(fake.lastReviewStateUpsert.payload).toMatchObject({ template: 'pronunciation' });
    expect(fake.lastReviewStateUpsert.onConflict).toBe('user_id,item_type,item_id,template');
  });

  it('uses the recognition row for a word/hear result', async () => {
    const fake = makeFakeClient();
    const svc = new SupabaseSrsService(fake.client, 'user-1');
    await svc.submit({ itemId: 'lemma-1', cardKind: 'word/hear', correct: true, spoke: false });
    expect(fake.lastReviewStateUpsert.payload).toMatchObject({ template: 'recognition' });
  });
});
```

> If no `makeFakeClient`/`testFakeClient` helper exists, mirror the mock-client shape used by the nearest existing `SupabaseSrsService.*.test.ts` instead of inventing a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SupabaseSrsService.submit`
Expected: FAIL — template not present on the select filter / upsert payload.

- [ ] **Step 3: Thread `template` through `submit()`**

In `SupabaseSrsService.ts`, `submit()`. After `const itemType = cardKindToDbType(result.cardKind);` add:

```typescript
const template = cardKindToTemplate(result.cardKind);
```

Update the prior-schedule load to filter by template:

```typescript
const { data: prevRow, error: prevErr } = await this.client
  .from('review_state')
  .select('*')
  .eq('user_id', this.userId)
  .eq('item_type', itemType)
  .eq('item_id', result.itemId)
  .eq('template', template)
  .maybeSingle();
if (prevErr) throw prevErr;
```

Update the upsert payload + conflict target:

```typescript
const { error: upsertErr } = await this.client.from('review_state').upsert(
  {
    user_id: this.userId,
    item_type: itemType,
    item_id: result.itemId,
    template,
    stage: next.stage,
    reps: next.reps,
    lapses: next.lapses,
    stability: next.stability,
    difficulty: next.difficulty,
    due_at: next.due.toISOString(),
    last_review: next.last_review.toISOString(),
  },
  { onConflict: 'user_id,item_type,item_id,template' },
);
if (upsertErr) throw upsertErr;
```

Add the import at the top of the file:

```typescript
import { cardKindToTemplate } from './cardTemplate';
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- SupabaseSrsService && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/supabase/SupabaseSrsService.ts src/services/supabase/SupabaseSrsService.submit.test.ts
git commit -m "feat(srs): submit() reads/writes the per-template review_state row"
```

---

### Task 4: `getDueBatch()` stays recognition-only (non-breaking read)

**Files:**
- Modify: `src/services/supabase/SupabaseSrsService.ts` (`getDueBatch()` — the due-state fetch + synthetic new-row creation)
- Test: `src/services/supabase/SupabaseSrsService.getDueBatch.test.ts` (extend existing)

**Interfaces:**
- Consumes: the per-template `review_state` rows from Task 1/3.
- Produces: `getDueBatch()` surfaces only `template='recognition'` rows for rendering, and synthesises new-item rows with `template:'recognition'`. Pronunciation rows accumulate but are not yet rendered (Plan B/2 will surface them). Behaviour is identical to pre-migration.

- [ ] **Step 1: Write the failing test**

Extend `src/services/supabase/SupabaseSrsService.getDueBatch.test.ts`. Seed the fake client's `review_state` due rows with BOTH a recognition and a pronunciation row for the same item, both due, and assert the batch contains that item exactly once (the recognition schedule), and that a brand-new admitted candidate is synthesised with `template:'recognition'`:

```typescript
it('renders only the recognition schedule when both templates are due (non-breaking)', async () => {
  const fake = makeFakeClient({
    reviewStateDue: [
      { item_type: 'lemma', item_id: 'lemma-1', template: 'recognition', stage: 'review', reps: 4, due_at: PAST },
      { item_type: 'lemma', item_id: 'lemma-1', template: 'pronunciation', stage: 'review', reps: 2, due_at: PAST },
    ],
  });
  const svc = new SupabaseSrsService(fake.client, 'user-1');
  const batch = await svc.getDueBatch();
  expect(batch.filter((i) => i.id === 'lemma-1')).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- getDueBatch`
Expected: FAIL — item appears twice (both template rows surfaced).

- [ ] **Step 3: Filter due states to recognition; tag synthetic rows**

In `getDueBatch()`, immediately after the due-state fetch (`const dueStates: ReviewStateRow[] = (dueStateData ?? []) as ReviewStateRow[];`), restrict to the recognition schedule so rendering is unchanged this plan:

```typescript
// Plan A: render only the recognition schedule. Pronunciation rows are written by submit() but
// not surfaced until Plan B/2 makes rendering template-aware. Keeps the loop behaviour identical.
const dueStates: ReviewStateRow[] = ((dueStateData ?? []) as ReviewStateRow[])
  .filter((r) => r.template === 'recognition');
```

In the synthetic new-row creation (the `orderedStates.push({ ... } as unknown as ReviewStateRow)` block for items with no existing state), add `template: 'recognition'`:

```typescript
orderedStates.push({
  user_id: this.userId,
  item_type: dbType,
  item_id: entry.id,
  template: 'recognition',
  stage: 'new',
  reps: 0,
  lapses: 0,
  stability: null,
  difficulty: null,
  due_at: null,
  last_review: null,
} as unknown as ReviewStateRow);
```

If the `stateByKey` map keys by `${dbType}:${id}`, leave it — the recognition filter guarantees one row per item now. (Do not change the key in this plan.)

- [ ] **Step 4: Run tests + typecheck + full suite**

Run: `npm test -- SupabaseSrsService && npm run typecheck && npm test`
Expected: PASS — full suite green (proves non-breaking).

- [ ] **Step 5: Commit**

```bash
git add src/services/supabase/SupabaseSrsService.ts src/services/supabase/SupabaseSrsService.getDueBatch.test.ts
git commit -m "feat(srs): getDueBatch renders recognition schedule only (non-breaking)"
```

---

### Task 5: Regression gate — full suite + build

**Files:** none (verification task)

- [ ] **Step 1: Run the full pipeline**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green. This proves Plan A changed schema + write-partitioning without altering visible behaviour.

- [ ] **Step 2: Manual smoke (optional, if a device/session is handy)**

Onboard one new word and answer its recognition + (if reached) say card. Verify via MCP `execute_sql`:

```sql
select item_id, template, stage, reps from review_state
where user_id = '<test-user-id>' order by item_id, template;
```

Expected: the word has a `recognition` row; if a `word/say` was graded, also a `pronunciation` row — independent schedules.

- [ ] **Step 3: Commit (if any incidental fixes)**

```bash
git commit -am "chore: Plan A regression gate green" --allow-empty
```

---

## Self-Review

- **Spec coverage:** Implements spec §5 (per-template `review_state`, `known_lemmas` redefinition). Onboarding sequence (§2), counting (§4), and card unification (§3) are deferred to Plans B/C by design — this plan is the foundation they require.
- **Placeholders:** none — migration SQL, `cardKindToTemplate`, and the `submit()`/`getDueBatch()` edits are concrete. The one conditional ("if no `makeFakeClient` helper exists") points at the existing test pattern to mirror, not a TODO.
- **Type consistency:** `ReviewTemplate` defined in `cardTemplate.ts`, consumed by `types.ts` and `SupabaseSrsService.ts`. `cardKindToTemplate` signature stable across tasks. `onConflict` string `'user_id,item_type,item_id,template'` matches the new PK in Task 1.
- **Scope:** single foundation increment; non-breaking; full suite is the gate.
