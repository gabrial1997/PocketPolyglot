# Earned-Phrase Gating (Rounds) + Mockup Teaser Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phrase teasers/unlocks are gated on words *earned* (correct recognition in a later round/day than intro, proven by no-FSRS recall probes), and the `phrase/locked` card is rebuilt to the approved mockup (per-word chips, count copy, lock pill, filled CTA).

**Architecture:** A pure `computeEarned` over `review_log` rows (session-stamped via new nullable `review_log.session_id`, migration 0021) replaces `known_lemmas` for phrase gating everywhere: `selectBatch` Pass 2, `decideKind`, the controller's known-set. Same-session unlock paths are deleted; rounds ≥2 prepend no-grade `word/recall` MC probes; ≤3 new-word rounds/day. Spec: `docs/superpowers/specs/2026-07-23-earned-phrase-gating-design.md` — read it first.

**Tech Stack:** Expo/RN + TypeScript, Jest, Supabase (Postgres). Tests run with `npx jest <path> -t "<name>"`; full gate = `npm run lint && npx tsc --noEmit && npx jest`.

## Global Constraints

- **Prerequisite:** branches `fix/bug-list-2026-07-22` and `feat/fsrs-pacing-phrase-tier` must be merged to `main` first (they touch `SupabaseSrsService` + teach-card grading). Migration number **0021** (0019/0020 are applied live; their files arrive with those merges).
- Cards stay pure data-in/events-out (CLAUDE.md boundary): no service imports in `PhraseLocked`.
- Wrong MC answers never advance; no gamification; no time claims in copy.
- `known_lemmas` view and Progress/coverage semantics are UNTOUCHED.
- Earned is monotonic; the lock gate applies ONLY to `stage === 'new'` phrases (no re-locking).
- Pacing numbers live in `src/session/pacing.ts` — no inline literals.
- `Date`/clock: `selectBatch` and all `src/session/*` logic stay pure (no `Date.now()`); the service passes `now`.
- Hermes has no `crypto.randomUUID` — use the existing `src/services/uuid.ts` helper.
- All copy: "known"/"new"/"form of X" as specced; CTA label is **"Continue"** (not "Begin listening").

---

### Task 1: Migration 0021 — `review_log.session_id`

**Files:**
- Create: `supabase/migrations/0021_review_log_session.sql`

**Interfaces:**
- Produces: nullable `review_log.session_id uuid` column, used by Tasks 2–6.

- [ ] **Step 1: Write the migration**

```sql
-- 0021: session stamping for the earned-phrase gate (spec 2026-07-23).
-- A "round" = one app session. Earned = correct recognition in a DIFFERENT round
-- (or later day) than intro. Nullable, no backfill: legacy rows fall back to the
-- later-day rule in computeEarned.
alter table public.review_log add column if not exists session_id uuid;
-- Paged earned/intro queries walk (user_id, card_kind, created_at).
create index if not exists review_log_user_kind_created_idx
  on public.review_log (user_id, card_kind, created_at);
```

- [ ] **Step 2: Apply to the live project**

Apply via Supabase MCP `apply_migration` (project `necfghfotwykjsykccsa`, name `0021_review_log_session`). Verify: `select column_name from information_schema.columns where table_name='review_log' and column_name='session_id';` returns 1 row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0021_review_log_session.sql
git commit -m "migration 0021: review_log.session_id for round-based earned gate"
```

---

### Task 2: Pure earned logic — `computeEarned`

**Files:**
- Create: `src/session/earned.ts`
- Test: `src/session/earned.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EarnedLogRow {
    item_id: string;
    card_kind: string;
    correct: boolean | null;
    session_id: string | null;
    created_at: string; // ISO
  }
  export function computeEarned(rows: EarnedLogRow[]): Set<string>;
  ```
  Consumed by Task 3's loader and unit tests.

- [ ] **Step 1: Write the failing tests**

```ts
// src/session/earned.test.ts
import { computeEarned, type EarnedLogRow } from './earned';

const intro = (id: string, session: string | null, at: string): EarnedLogRow => ({
  item_id: id, card_kind: 'word/learn-function', correct: null, session_id: session, created_at: at,
});
const hear = (id: string, session: string | null, at: string, correct = true): EarnedLogRow => ({
  item_id: id, card_kind: 'word/hear', correct, session_id: session, created_at: at,
});
const recall = (id: string, session: string | null, at: string, correct = true): EarnedLogRow => ({
  item_id: id, card_kind: 'word/recall', correct, session_id: session, created_at: at,
});
const say = (id: string, session: string | null, at: string): EarnedLogRow => ({
  item_id: id, card_kind: 'word/say', correct: true, session_id: session, created_at: at,
});

describe('computeEarned', () => {
  it('same-session correct does NOT earn', () => {
    expect(computeEarned([
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      hear('a', 's1', '2026-07-23T10:00:05Z'),
    ]).has('a')).toBe(false);
  });

  it('different-session same-day correct earns (rounds)', () => {
    expect(computeEarned([
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      recall('a', 's2', '2026-07-23T12:00:00Z'),
    ]).has('a')).toBe(true);
  });

  it('later-day correct earns even with null session ids (legacy / time travel)', () => {
    expect(computeEarned([
      intro('a', null, '2026-07-22T10:00:00Z'),
      hear('a', null, '2026-07-23T09:00:00Z'),
    ]).has('a')).toBe(true);
  });

  it('same-day null-vs-null sessions do NOT earn (legacy same-sitting)', () => {
    expect(computeEarned([
      intro('a', null, '2026-07-23T10:00:00Z'),
      hear('a', null, '2026-07-23T10:00:05Z'),
    ]).has('a')).toBe(false);
  });

  it('incorrect answers never earn', () => {
    expect(computeEarned([
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      recall('a', 's2', '2026-07-23T12:00:00Z', false),
    ]).has('a')).toBe(false);
  });

  it('word/say self-ratings do not earn', () => {
    expect(computeEarned([
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      say('a', 's2', '2026-07-23T12:00:00Z'),
    ]).has('a')).toBe(false);
  });

  it('no intro row (legacy) -> any correct recognition earns', () => {
    expect(computeEarned([hear('a', 's1', '2026-07-23T10:00:00Z')]).has('a')).toBe(true);
  });

  it('earliest intro row is the anchor when several exist', () => {
    expect(computeEarned([
      intro('a', 's2', '2026-07-23T12:00:00Z'), // re-intro later
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      hear('a', 's2', '2026-07-23T12:00:05Z'),
    ]).has('a')).toBe(true); // s2 !== s1 (the earliest intro)
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/session/earned.test.ts`
Expected: FAIL — `Cannot find module './earned'`.

- [ ] **Step 3: Implement**

```ts
// src/session/earned.ts
// Pure "earned" computation for the phrase gate (spec 2026-07-23).
// A lemma is EARNED iff a correct word/hear|word/recall row exists in a different
// round than its (earliest) intro row — where "different round" means a different
// session_id, or a later calendar UTC day (covers legacy null-session rows and
// dev time travel). Monotonic: computed from append-only review_log, never shrinks.

export interface EarnedLogRow {
  item_id: string;
  card_kind: string;
  correct: boolean | null;
  session_id: string | null;
  created_at: string;
}

const RECOGNITION_KINDS = new Set(['word/hear', 'word/recall']);

function day(iso: string): string {
  return iso.slice(0, 10); // UTC calendar day; review_log timestamps are ISO/UTC
}

export function computeEarned(rows: EarnedLogRow[]): Set<string> {
  // earliest intro per lemma
  const introBy = new Map<string, EarnedLogRow>();
  for (const r of rows) {
    if (!r.card_kind.startsWith('word/learn')) continue;
    const prev = introBy.get(r.item_id);
    if (!prev || r.created_at < prev.created_at) introBy.set(r.item_id, r);
  }
  const earned = new Set<string>();
  for (const r of rows) {
    if (r.correct !== true || !RECOGNITION_KINDS.has(r.card_kind)) continue;
    const i = introBy.get(r.item_id);
    if (!i) { earned.add(r.item_id); continue; } // legacy: no intro row recorded
    const differentSession =
      r.session_id !== null && i.session_id !== null && r.session_id !== i.session_id;
    const laterDay = day(r.created_at) > day(i.created_at);
    if (differentSession || laterDay) earned.add(r.item_id);
  }
  return earned;
}
```

- [ ] **Step 4: Run to verify pass** — `npx jest src/session/earned.test.ts` → all PASS.

- [ ] **Step 5: Commit** — `git add src/session/earned.ts src/session/earned.test.ts && git commit -m "feat: pure computeEarned for round-based phrase gate"`

---

### Task 3: Session stamping + shared earned loader

**Files:**
- Create: `src/services/supabase/earnedLoader.ts`
- Modify: `src/services/supabase/SupabaseSrsService.ts` (submit() insert; getDueBatch ctx; session id)
- Modify: `src/services/supabase/SupabaseKnownWordsStore.ts` (refresh() source)
- Test: `src/services/supabase/earnedLoader.test.ts`, extend `SupabaseSrsService.test.ts`

**Interfaces:**
- Consumes: `computeEarned`, `EarnedLogRow` (Task 2); `uuid()` from `src/services/uuid.ts`.
- Produces:
  ```ts
  // earnedLoader.ts
  export async function loadEarnedLemmaIds(client: SupabaseClient, userId: string): Promise<Set<string>>;
  ```
  `SupabaseSrsService` gains `private sessionId: string` (rotated at the top of every `getDueBatch()`), stamped into every `review_log` insert as `session_id`.

- [ ] **Step 1: Write the failing loader test** — fake client (reuse the `fakeClient` builder pattern from `SupabaseSrsService.test.ts`): seed `review_log` with intro `s1` + correct `word/hear` `s2` for lemma `l1`, and intro+correct both `s1` for `l2`. Assert loader returns `Set{l1}`. Also assert it pages: seed 1000+ rows (map over Array.from) and confirm rows past the first page are seen (the fake client must honor `.range()` — extend it if it doesn't).

- [ ] **Step 2: Run to verify failure** — `npx jest src/services/supabase/earnedLoader.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the loader**

```ts
// src/services/supabase/earnedLoader.ts
// Shared loader for the earned-lemma set (spec 2026-07-23). Used by BOTH
// SupabaseKnownWordsStore (the controller's gate) and SupabaseSrsService
// (selectBatch ctx) so the two gates can never diverge.
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeEarned, type EarnedLogRow } from '../../session/earned';

const CHUNK = 1000; // page: review_log grows forever (see recalledLemmaIds's cap note)

export async function loadEarnedLemmaIds(
  client: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const rows: EarnedLogRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from('review_log')
      .select('item_id,card_kind,correct,session_id,created_at')
      .eq('user_id', userId)
      .eq('item_type', 'lemma')
      .in('card_kind', ['word/hear', 'word/recall', 'word/learn-concrete', 'word/learn-abstract', 'word/learn-function'])
      .order('id', { ascending: true })
      .range(offset, offset + CHUNK - 1);
    if (error) throw error;
    const page = (data ?? []) as EarnedLogRow[];
    rows.push(...page);
    if (page.length < CHUNK) return computeEarned(rows);
    offset += CHUNK;
  }
}
```

**NB:** verify the actual learn card_kind strings before finalizing the `.in(...)` list — `grep -rn "word/learn" src/types/cardKind.ts` — and include exactly the kinds defined there (DB has `word/learn-function`; adjust names if the concrete/abstract kinds differ).

- [ ] **Step 4: Session stamping in `SupabaseSrsService`** — add `import { uuid } from '../uuid';` (match the actual export name in `src/services/uuid.ts`), a field `private sessionId = uuid();`, rotate it as the FIRST line of `getDueBatch()` (`this.sessionId = uuid();` — Home's `getDueSummary()` also calls `getDueBatch()`, harmless: no rows post between preview and session start), and add `session_id: this.sessionId` to the `review_log` insert in `submit()`.

- [ ] **Step 5: Swap the ctx + store sources** —
  - In `getDueBatch()` step 2, replace the `this.knownLemmaIds()` and `this.recalledLemmaIds()` parallel calls with one `loadEarnedLemmaIds(this.client, this.userId)`; pass it as ctx per Task 4's new `SelectContext`. Delete the now-unused `recalledLemmaIds()` and `knownLemmaIds()` private methods (grep first for other callers).
  - In `SupabaseKnownWordsStore.refresh()`, replace the `known_lemmas` query with `const next = await loadEarnedLemmaIds(this.client, this.userId);` keeping the `gen` guard exactly as is (`if (myGen !== this.gen) return; this.ids = next;`). Update the file header comment: this store now holds the EARNED set (phrase gate), not the known_lemmas view.

- [ ] **Step 6: Extend service tests** — in `SupabaseSrsService.test.ts`: (a) submit() inserts `session_id` (assert the inserted row has a uuid-shaped `session_id`); (b) two `getDueBatch()` calls produce different `sessionId` stamps on subsequent submits. Run the two files: `npx jest src/services/supabase/earnedLoader.test.ts src/services/supabase/SupabaseSrsService.test.ts` → PASS.

- [ ] **Step 7: Commit** — `git commit -am "feat: session stamping + shared earned-lemma loader; KnownWordsStore serves earned set"`

---

### Task 4: selectBatch — earned bar + 3-round daily cap

**Files:**
- Modify: `src/session/pacing.ts`, `src/session/selectBatch.ts`, `src/services/supabase/SupabaseSrsService.ts` (ctx build + rounds query)
- Test: `src/session/selectBatch.test.ts` (extend)

**Interfaces:**
- Consumes: earned set from Task 3.
- Produces: `SelectContext` shape change — **breaking for callers**:
  ```ts
  export interface SelectContext {
    accountAgeDays: number;
    introducedToday: number;
    /** distinct session_ids that introduced new words today (round cap input). */
    newRoundsToday: number;
    dueToday: number;
    rollingRetention: number | undefined;
    /** lemma ids EARNED for phrase gating (spec 2026-07-23) — replaces knownLemmaIds + recalledLemmaIds. */
    earnedLemmaIds: Set<string>;
    todaysSemanticFields: Set<string>;
  }
  ```

- [ ] **Step 1: Write failing tests** (extend `selectBatch.test.ts`, following its existing builders):
  - Teaser admitted only when anchor earned + exactly one component unearned + that word admitted in Pass 1 (existing one-away tests: rename their `knownLemmaIds`/`recalledLemmaIds` fixtures to `earnedLemmaIds` — a phrase whose anchor is merely "recalled once, same session" must now be REJECTED).
  - Fully-earned phrase admits (unlock path) — earned set contains all components.
  - Day-1 (empty earned set): NO phrase admissions of either kind.
  - `newRoundsToday: 3` → `newAllowance === 0` while due reviews still flow and fully-earned phrases still admit (existing spent-allowance semantics).
  - `newRoundsToday: 2` → normal `newCap`.

- [ ] **Step 2: Run to verify failure** — `npx jest src/session/selectBatch.test.ts` → FAIL (type errors on ctx fields count as the failure).

- [ ] **Step 3: Implement** —
  - `pacing.ts`: `export const NEW_ROUND_DAY_CAP = 3 as const; // max rounds/day that may introduce new words (spec 2026-07-23). ROUND_MIN_GAP deliberately not implemented (founder chose no gap); add here if that changes.`
  - `selectBatch.ts`: replace `knownLemmaIds`/`recalledLemmaIds` with `earnedLemmaIds` throughout Pass 2 (anchor check `ctx.earnedLemmaIds.has(candidate.anchorLemmaId)`; unknown filter `!ctx.earnedLemmaIds.has(id)`). After the retention gate (Step 4 in the file), add: `if (ctx.newRoundsToday >= NEW_ROUND_DAY_CAP) newCap = 0;` (before newAllowance is computed).
  - `SupabaseSrsService`: add private `newRoundsToday(now: Date): Promise<number>` — select `session_id,card_kind,created_at` from `review_log` where `user_id`, `card_kind` like `word/learn%`, `created_at >= <local day start>` (reuse the exact day-start computation from the existing `introducedToday(now)` — read it and copy its boundary logic verbatim), count distinct non-null `session_id` client-side (rows with null session_id from legacy same-day data count as one round). Add to the `Promise.all` in step 2 and to ctx.

- [ ] **Step 4: Run** — `npx jest src/session/selectBatch.test.ts` → PASS. Then `npx tsc --noEmit` to surface every other `SelectContext` construction site and fix them (service + any tests).

- [ ] **Step 5: Commit** — `git commit -am "feat: selectBatch gates phrases on earned set; 3-round/day new-word cap"`

---

### Task 5: decideKind stage guard + controller — no same-session unlock, no teaser re-queue

**Files:**
- Modify: `src/session/decideKind.ts`, `src/session/sessionController.ts`, `src/session/requeue.ts`
- Test: `src/session/decideKind.test.ts`, `src/session/sessionController.test.tsx` (extend)

**Interfaces:**
- Consumes: earned set via `KnownWordsStore.all()` (Task 3 swapped its contents).
- Produces: `decideKind(item, earned, revealed)` — same signature, new semantics: lock/unlock gating applies only to `item.stage === 'new'`.

- [ ] **Step 1: Write failing tests** —
  - `decideKind`: a phrase with `stage: 'review'` and an unearned component renders its review kind (NOT `phrase/locked`) — the no-re-lock rule.
  - `decideKind`: a `stage: 'new'` phrase with one unearned component → `phrase/locked`; all earned + not revealed → `phrase/unlock`.
  - Controller: after answering the missing word correctly IN-SESSION, a later encounter of the phrase still renders `phrase/locked`-family, NOT `phrase/unlock` (the session-learned union no longer feeds the gate). Adapt the existing test that pins the OLD same-session unlock behavior — it flips to pin the new one.
  - Controller: advancing past `phrase/locked` does NOT re-insert the phrase into the queue (assert queue length / no second encounter).

- [ ] **Step 2: Run to verify failure** — `npx jest src/session/decideKind.test.ts src/session/sessionController.test.tsx`.

- [ ] **Step 3: Implement** —
  - `decideKind.ts`: guard the whole phrase branch with `item.stage === 'new'`:
    ```ts
    if (item.type === 'phrase' && item.componentLemmaIds && item.stage === 'new') {
      const { locked } = lockState(item.componentLemmaIds, known);
      if (locked) return { kind: 'phrase/locked' };
      if (!item.retest && !revealed.has(item.id)) return { kind: 'phrase/unlock' };
    }
    ```
    (the old `item.stage === 'new'` check inside the unlock condition is now redundant — remove it). Update the header comment: gating consults the EARNED set; review-stage phrases never re-lock.
  - `sessionController.ts`: delete the `knownUnion` union with `learned.current` — pass `knownWords.all()` (now earned) directly to `decideKind` and `lockHint` (keep the `knownGen` tick so a late store refresh recomputes). Keep `learned.current` ONLY if something else consumes it — grep; if nothing, delete it and the `submit()` line feeding it. In `advance()`, delete the whole `kind === 'phrase/locked'` re-queue branch (`requeuePhraseAfterComponents` + the componentAhead scan); keep the `phrase/unlock` → `requeueArcNext` branch untouched.
  - `requeue.ts`: delete `requeuePhraseAfterComponents` and its tests if the controller was its only caller (grep first).
  - **Verify** `expandLearningSteps` (grep in `src/session/`) does not pre-insert arc copies for admitted locked-teaser phrases — the teaser must appear exactly once. If it does, exclude phrases that are lock-gated at expansion time and pin with a test.

- [ ] **Step 4: Run** — the two test files, then the whole `src/session` suite: `npx jest src/session` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: earned-only phrase gate in controller; teaser shows once; no same-session unlock"`

---

### Task 6: Recall probes (no-FSRS `word/recall`)

**Files:**
- Modify: `src/types/cardKind.ts` (+ `'word/recall'`), `src/services/supabase/cardKindToDbType.ts` (map → `'lemma'`), `src/services/supabase/SupabaseSrsService.ts` (probe assembly + no-grade submit branch), `src/session/renderFor.ts` (probe → `word/hear`), `src/session/sessionController.ts` (rewrite probe results), `src/types/reviewItem.ts` (`probe?: true`)
- Test: `src/services/supabase/SupabaseSrsService.test.ts`, `src/session/renderFor.test.ts` (extend)

**Interfaces:**
- Consumes: `sessionId` + earned loader (Task 3), day-start helper (Task 4).
- Produces: `ReviewItem.probe?: true` (in-memory only, like `retest`); `CardKind` gains `'word/recall'`; `submit()` early-returns for `word/recall` (log-only).

- [ ] **Step 1: Write failing tests** —
  - `renderFor`: `{ type:'word', probe:true, choices:[...] }` → `'word/hear'`.
  - Service: `submit({ cardKind:'word/recall', itemId, correct:true })` inserts a `review_log` row with `card_kind:'word/recall'` + `session_id` and does NOT touch `review_state` (assert no upsert on the fake client).
  - Service: `getDueBatch()` in a second round (fake `review_log` has today-intros under a different `session_id`, lemmas unearned) prepends those lemmas as `probe:true` items with MC choices; lemmas already earned, or already present as due items, are NOT probed.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** —
  - `reviewItem.ts`: add `probe?: true;` next to `retest` with the same "in-memory only, never persisted" comment.
  - `cardKind.ts`: add `'word/recall'` to the union (comment: logged-only recall probe; renders as word/hear).
  - `cardKindToDbType.ts`: `'word/recall'` → `'lemma'`. Check `repKind` in `cardTemplate.ts` — a correct `word/recall` row should classify `receptive` (same bucket as `word/hear`); add it explicitly.
  - `renderFor.ts`: at the top of the word branch: `if (item.probe) return 'word/hear';`
  - `SupabaseSrsService.submit()`: FIRST lines —
    ```ts
    if (result.cardKind === 'word/recall') {
      // Recall probe (spec 2026-07-23 §4): evidence for the earned gate, NEVER an FSRS grade —
      // a same-day extra Good inflates intervals (2026-07-22 pacing artifact).
      const { error } = await this.client.from('review_log').insert({
        user_id: this.userId, item_type: 'lemma', item_id: result.itemId,
        card_kind: 'word/recall', correct: result.correct ?? null,
        session_id: this.sessionId,
      });
      if (error) throw error;
      return { nextReviewLabel: '', rung: computeRung(0, 0) }; // label unused by probe cards
    }
    ```
    (match the actual return-shape expectations at call sites — read `submit()`'s callers first; if the rung matters, compute it via the existing log query instead of `computeRung(0,0)`.)
  - `SupabaseSrsService.getDueBatch()`: after the earned/rounds queries, compute `probeLemmaIds` = (today's intro `item_id`s where `session_id` ≠ current or null) − earned − (ids already in `allDueRows`). Fetch their existing recognition `review_state` rows + lemma rows, build items through the SAME enrichment path as due items, set `probe: true` on each, and PREPEND them to the returned batch (before the interleaved order). Give probes MC choices via the same distractor RPC the `word/hear` enrichment already uses — follow the existing lemma-branch code in `enrichAndReorder`.
  - `sessionController.submit()`: before posting, `if (item?.probe) result = { ...result, cardKind: 'word/recall' };` — and do NOT add probe answers to any unlock bookkeeping (earned refresh happens next round via the store).

- [ ] **Step 4: Run** — `npx jest src/services/supabase src/session/renderFor.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: no-FSRS word/recall probes earn same-day words in later rounds"`

---

### Task 7: Breakdown `lemmaId` + chip decoration

**Files:**
- Modify: `src/services/supabase/mappers.ts` (`buildComponentBreakdown`), `src/services/supabase/SupabaseSrsService.ts` (call site passes `lemmaId`), `src/types/reviewItem.ts`, `src/session/sessionController.ts` (decorate)
- Test: `src/services/supabase/mappers.test.ts`, `src/session/sessionController.test.tsx` (extend)

**Interfaces:**
- Produces:
  ```ts
  componentBreakdown?: Array<{ surface: string; lemma: string; gloss: string; lemmaId?: string; known?: boolean }>;
  ```
  `known` is set ONLY by the controller on the `phrase/locked` item (same decoration site as `lockHint`, `sessionController.ts:162`).

- [ ] **Step 1: Failing tests** — `buildComponentBreakdown('Man ir labi.', [{position:0, lemma:'es', gloss:'I', lemmaId:'L1'}, ...])` carries `lemmaId` through; controller test: the `current.item` for a locked phrase has `componentBreakdown` entries with `known: true` exactly for earned lemma ids.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — extend `buildComponentBreakdown`'s input/output with `lemmaId` (pass-through; keep the position-alignment + degrade behavior identical); at the `SupabaseSrsService` call site add `lemmaId: c.lemma_id` to the flatMap; in the controller replace the decoration line:
  ```ts
  const earned = knownWords.all();
  const withChips = (it: ReviewItem): ReviewItem => ({
    ...it,
    ...lockHint(queue, it, earned),
    componentBreakdown: it.componentBreakdown?.map((c) => ({
      ...c, known: c.lemmaId ? earned.has(c.lemmaId) : false,
    })),
  });
  // ...
  ? { item: kind === 'phrase/locked' ? withChips(item) : item, kind }
  ```

- [ ] **Step 4: Run** — `npx jest src/services/supabase/mappers.test.ts src/session/sessionController.test.tsx` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: componentBreakdown carries lemmaId; controller decorates chips with earned flags"`

---

### Task 8: PhraseLocked rebuild (mockup)

**Files:**
- Rewrite: `src/screens/PhraseLocked.tsx`
- Test: `src/screens/PhraseLocked.test.tsx` (rewrite)

**Interfaces:**
- Consumes: decorated `componentBreakdown` (Task 7), `lockRemaining`/`lockLemma` (existing), `PhraseGateProps` (`{ item, onAdvance }` — unchanged), `CtaButton`, `PhraseLine`, `CardIcon`, `useTheme`, `fonts`.

- [ ] **Step 1: Failing tests** (rewrite the file; fixture items, no services — cards are pure):
  - Chips render in phrase order with surface forms; earned chips show `known`, the missing chip shows `new`.
  - `form of es` sub-label appears ONLY when `surface.toLowerCase() !== lemma.toLowerCase()` (fixture: Man/es yes, labi/labi no).
  - Copy: 2 known + 1 to go → `You already know two of these words. Learn one more and the phrase opens.`; 1 known → `one of these words`; 0 known → `Learn these words and the phrase opens.`
  - Pill: `1 word to go — learn dzert` from `lockRemaining`/`lockLemma`; fallback `Unlocks when you know its words.` when `lockLemma` absent.
  - No `componentBreakdown` → no chip row, no count copy (degrade), still renders phrase + pill + CTA.
  - CTA titled `Continue` fires `onAdvance` once.

- [ ] **Step 2: Run to verify failure** — `npx jest src/screens/PhraseLocked.test.tsx`.

- [ ] **Step 3: Implement**

```tsx
// phrase/locked — gating glimpse rebuilt to the founder mockup (spec 2026-07-23 §6).
// Chips show each word AS IT APPEARS in the phrase; earned words carry a "form of <lemma>"
// bridge when the surface differs from what was taught (the Man/ir fix, bug e9e78a2a).
// Still a GATE, not a review: Continue advances WITHOUT posting a CardResult.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, CtaButton } from '../components';
import { CardIcon, PhraseLine } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import type { PhraseGateProps } from './cardProps';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

function countCopy(known: number, remaining: number): string {
  if (known === 0) return 'Learn these words and the phrase opens.';
  const knowLine = `You already know ${numberWord(known)} of these ${known === 1 ? 'word' : 'words'}.`;
  const learnLine = `Learn ${remaining === 1 ? 'one more' : `${numberWord(remaining)} more`} and the phrase opens.`;
  return `${knowLine}\n${learnLine}`;
}

export function PhraseLocked({ item, onAdvance }: PhraseGateProps): React.JSX.Element {
  const T = useTheme();
  const chips = item.componentBreakdown ?? [];
  const knownCount = chips.filter((c) => c.known).length;
  const remaining = item.lockRemaining ?? Math.max(1, chips.length - knownCount);

  return (
    <Screen>
      {chips.length > 0 ? (
        <View style={styles.chipRow}>
          {chips.map((c, i) => (
            <View
              key={i}
              style={[
                styles.chip,
                c.known
                  ? { backgroundColor: T.card, borderColor: T.border }
                  : { backgroundColor: T.wash, borderColor: T.wash },
              ]}
            >
              <Text style={[styles.chipWord, { color: c.known ? T.ink : T.sub }]}>{c.surface}</Text>
              <View style={styles.chipStatus}>
                <CardIcon name={c.known ? 'check' : 'lock'} size={11} color={c.known ? T.good : T.faint} />
                <Text style={[styles.chipStatusText, { color: T.faint }]}>
                  {c.known
                    ? c.surface.toLowerCase() !== c.lemma.toLowerCase() ? `form of ${c.lemma}` : 'known'
                    : 'new'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.body}>
        {chips.length > 0 ? (
          <Text style={[styles.count, { color: T.sub }]}>{countCopy(knownCount, remaining)}</Text>
        ) : null}
        <View style={{ marginTop: 18 }}>
          <PhraseLine phrase={item.target} size={32} />
        </View>
        <View style={[styles.pill, { borderColor: T.border }]}>
          <CardIcon name="lock" size={14} color={T.faint} />
          <Text style={[styles.pillText, { color: T.sub }]}>
            {item.lockLemma ? (
              <>
                {item.lockRemaining ?? 1} {(item.lockRemaining ?? 1) === 1 ? 'word' : 'words'} to go — learn{' '}
                <Text style={{ fontFamily: fonts.headline, fontWeight: '600', color: T.ink }}>{item.lockLemma}</Text>
              </>
            ) : (
              'Unlocks when you know its words.'
            )}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <CtaButton title="Continue" onPress={() => onAdvance?.()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', justifyContent: 'center', columnGap: 10, marginTop: 8 },
  chip: { minWidth: 86, borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  chipWord: { fontFamily: fonts.headline, fontSize: 17 },
  chipStatus: { flexDirection: 'row', alignItems: 'center', columnGap: 4, marginTop: 6 },
  chipStatusText: { fontSize: 11.5 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  count: { fontSize: 14.5, lineHeight: 21, textAlign: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', columnGap: 7, borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, marginTop: 26 },
  pillText: { fontSize: 14 },
  footer: { paddingBottom: 12 },
});
```

**NB:** verify the theme token names (`T.card`, `T.wash`, `T.good`, `T.border`) against `src/theme/tokens.ts` and the `CardIcon` name set (`'check'` may be `'tick'`) — use the real names; no new magic colors. Confirm light AND dark render in the web preview.

- [ ] **Step 4: Run** — `npx jest src/screens/PhraseLocked.test.tsx` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: PhraseLocked rebuilt to mockup — chips, count copy, lock pill, filled CTA"`

---

### Task 9: Full gate + docs + on-device note

**Files:**
- Modify: `docs/BACKEND_INTEGRATION.md` (phrase gate §4: earned semantics, `word/recall`, no same-session unlock), `docs/WIRING_MAP.md` (card_kind table: `word/recall` row, logged-only)

- [ ] **Step 1: Full suite** — `npm run lint && npx tsc --noEmit && npx jest` → all green. Fix any straggler test still building the old `SelectContext` or pinning same-session unlock / teaser re-queue.
- [ ] **Step 2: Docs** — update the two docs (keep `CardKind` id strings stable; `word/recall` is additive).
- [ ] **Step 3: Manual sanity via dev tools** — on `test@`/`newuser@` (Settings → Developer): Reset progress → round 1: words only, NO teasers; kill+relaunch → round 2: probes first, teaser appears (chips: earned words `known`/`form of es`, missing word `new`); relaunch → round 3: chime + arc; a 4th relaunch introduces no new words. Time-travel +1 day still earns (later-day clause).
- [ ] **Step 4: Commit** — `git commit -am "docs: earned-phrase gate + word/recall in backend integration + wiring map"`. Then run the superpowers:finishing-a-development-branch flow (founder does `npm run phone` on-device check before merge).
