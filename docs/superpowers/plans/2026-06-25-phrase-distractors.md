# Phrase Distractors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every phrase a working "pick the English meaning" recognition quiz (`phrase/meaning`) — build phrase distractors, wire phrase `choices`, route the recognition step of all phrases to it, and generalize the card beyond idioms.

**Architecture:** A `get_phrase_distractors` SQL function (mirrors `get_distractors`, prefers phrases sharing a component word) feeds `item.choices` for phrase items in `getDueBatch`; `renderFor` routes phrase recognition reviews to `phrase/meaning`; the `PhraseMeaning` card drops its idiom-only framing.

**Tech Stack:** Expo / React Native (TypeScript), Supabase Postgres (pg_trgm not needed here), Jest + RNTL.

## Global Constraints

- **TypeScript everywhere; no `any`.** Cards stay pure (data-in/events-out; no service imports).
- **Wrong-answer-no-advance** in `PhraseMeaning` must be preserved exactly (red "Try again", chosen option reddens, correct never revealed, correct → advance).
- **Audio optional/non-blocking** — `phrase/meaning` renders the written phrase + a silent play orb when there's no clip; no crash. `phrase/sayit` (production) still requires audio (`hasAudio = !!item.audio?.envelope`).
- **Distractors:** prefer phrases sharing ≥1 component lemma (more confusable), then random; exclude the target and any phrase whose `gloss_en` equals the target's; require non-empty `gloss_en`; `n = 3`.
- **Shuffle** the choices so the correct answer isn't always first (reuse the lemma branch's Fisher–Yates).
- **Supabase project:** `necfghfotwykjsykccsa`. SQL applied to the remote via MCP; migration file committed.
- **Keep CI green:** full `npm test` (baseline 626), `npm run typecheck`, `npm run lint`.

---

### Task 1: `get_phrase_distractors` SQL function

DB change applied to the remote via MCP; migration file committed. Verification is a live query (no app unit test).

**Files:**
- Create: `supabase/migrations/0013_phrase_distractors.sql`

**Interfaces:**
- Produces: `get_phrase_distractors(target uuid, n int default 3) returns setof public.phrases` — `n` other phrases, shared-component phrases first, excluding the target + same-gloss phrases. Consumed by Task 2.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0013_phrase_distractors.sql`:

```sql
-- 0013: distractor pool for the phrase meaning-quiz (phrase/meaning). Returns n OTHER phrases whose
-- gloss_en serves as wrong options. "More confusable": phrases sharing a component lemma with the
-- target rank first, then random. Excludes the target and any phrase whose gloss equals the
-- target's (so no duplicate/correct option leaks in). Requires a non-empty gloss.
create or replace function public.get_phrase_distractors(target uuid, n int default 3)
returns setof public.phrases
language sql
stable
set search_path = ''
as $function$
  with t as (
    select gloss_en from public.phrases where id = target
  ),
  t_components as (
    select lemma_id from public.phrase_components where phrase_id = target
  )
  select p.*
  from public.phrases p
  where p.id <> target
    and coalesce(trim(p.gloss_en), '') <> ''
    and p.gloss_en is distinct from (select gloss_en from t)
  order by
    (select count(*) from public.phrase_components pc
       where pc.phrase_id = p.id
         and pc.lemma_id in (select lemma_id from t_components)) desc,  -- shared components first
    random()
  limit n;
$function$;
```

- [ ] **Step 2: Apply via MCP**

Use the Supabase MCP `apply_migration` (name `phrase_distractors`, the SQL above) against project `necfghfotwykjsykccsa`. Expected: success.

- [ ] **Step 3: Verify live**

Run via MCP `execute_sql`:

```sql
select 'Uz redzēšanos!' as target, target as latvian, gloss_en
from get_phrase_distractors((select id from phrases where target='Uz redzēšanos!'), 3) ;
```

Expected: 3 rows, each a different phrase with a non-empty `gloss_en`, none equal to "Goodbye! …". Confirm it returns exactly 3 distinct other phrases.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_phrase_distractors.sql
git commit -m "feat(db): get_phrase_distractors — shared-component-first phrase meaning distractors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Build phrase `choices` in `getDueBatch` (+ shared shuffle helper)

**Files:**
- Modify: `src/services/supabase/SupabaseSrsService.ts` (the phrase branch, ~line 597-608; and the lemma branch shuffle ~line 583-591)
- Test: `src/services/supabase/SupabaseSrsService.test.ts`

**Interfaces:**
- Consumes: `get_phrase_distractors` RPC (Task 1).
- Produces: a phrase `ReviewItem` carries `item.choices` (1 correct + up to 3 distractors, shuffled).

- [ ] **Step 1: Write the failing test**

In `src/services/supabase/SupabaseSrsService.test.ts`, mirror the lemma distractor test (the fake client supports `rpcResults`). Add a phrase case: `getDueBatch` for a phrase due-item, with `rpcResults` `{ get_phrase_distractors: [3 other phrase rows] }`, asserts `item.choices` has length 4, exactly one `correct` (the phrase's own gloss), and the distractor glosses present (order-independent):

```ts
it('builds phrase choices from get_phrase_distractors: correct meaning + distractors, order-independent', async () => {
  const tables: Record<string, Row[]> = {
    review_state: [{ ...stateRow('phrase', 'p-a', 0), stage: 'review' }] as unknown as Row[],
    lemmas: [],
    phrases: [contentRow('p-a', { envelope: [0.5] })], // contentRow sets gloss_en/gloss/target = id
    phrase_components: [],
    minimal_pairs: [], review_log: [], known_lemmas: [], profiles: [],
  };
  const distractors = [
    { id: 'd1', target: 'X', gloss_en: 'hello' },
    { id: 'd2', target: 'Y', gloss_en: 'thank you' },
    { id: 'd3', target: 'Z', gloss_en: 'see you' },
  ];
  const svc = new SupabaseSrsService(
    fakeClient(tables, { get_phrase_distractors: distractors }, new Date(1_900_000_000_000 + 1_000_000_000)),
    'u1',
  );
  const batch = await svc.getDueBatch();
  const item = batch.find((i) => i.id === 'p-a');
  expect(item?.choices).toBeDefined();
  const choices = item!.choices!;
  expect(choices).toHaveLength(4);
  expect(choices.filter((c) => c.correct)).toHaveLength(1);
  expect(choices.find((c) => c.correct)!.gloss).toBe('p-a'); // contentRow gloss = id
  expect(new Set(choices.map((c) => c.gloss))).toEqual(new Set(['p-a', 'hello', 'thank you', 'see you']));
});
```

> If `contentRow`/`stateRow`/`fakeClient` differ, adapt to the file's actual helpers (the lemma distractor test added earlier is the template — copy its shape).

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest SupabaseSrsService -t "phrase choices"`
Expected: FAIL — phrase items currently have no `choices`.

- [ ] **Step 3a: Extract a shared shuffle helper (DRY)**

In `src/services/supabase/SupabaseSrsService.ts`, add a module-level helper (near the top, after imports), and replace the lemma branch's inline Fisher–Yates loop (~line 586-591) with a call to it:

```ts
/** In-place Fisher–Yates shuffle (so the correct MC option isn't always first). */
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
```

Lemma branch becomes: build `choices`, then `item.choices = shuffleInPlace(choices);` (replacing the inline loop). Keep the surrounding try/catch + comment.

- [ ] **Step 3b: Build phrase choices in the phrase branch**

In the phrase branch (`else if (s.item_type === 'phrase')`, ~line 597), after attaching `componentLemmaIds`, add choices building (graceful on error), mirroring the lemma branch:

```ts
        // Meaning-quiz distractors (graceful fallback on error).
        try {
          const { data: pdist } = await this.client.rpc('get_phrase_distractors', {
            target: row.id,
            n: 3,
          });
          const choices = [
            { value: item.id, gloss: item.gloss, correct: true },
            ...((pdist ?? []) as Array<{ id: string; gloss_en: string }>).map((d) => ({
              value: d.id,
              gloss: d.gloss_en,
              correct: false,
            })),
          ];
          item.choices = shuffleInPlace(choices);
        } catch {
          // Leave choices undefined; the card degrades gracefully.
        }
```

- [ ] **Step 4: Run the test + full suite**

Run: `npx jest SupabaseSrsService` → PASS.
Run: `npm test` → PASS (lemma distractor test still green — the shuffle extraction is behavior-preserving).
Run: `npm run typecheck && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/supabase/SupabaseSrsService.ts src/services/supabase/SupabaseSrsService.test.ts
git commit -m "feat(loop): build phrase meaning-quiz choices from get_phrase_distractors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Generalize `PhraseMeaning` beyond idioms

**Files:**
- Modify: `src/screens/PhraseMeaning.tsx`
- Test: `src/screens/PhraseMeaning.test.tsx`

**Interfaces:**
- Produces: `PhraseMeaning` renders for any phrase: neutral eyebrow, "· IDIOM" tag + literal note only when `item.isIdiom` / `item.literal`; audio-optional.

- [ ] **Step 1: Write the failing tests**

In `src/screens/PhraseMeaning.test.tsx` (follow its `renderCard`/fixture pattern):

```ts
it('a non-idiom phrase shows no IDIOM tag', () => {
  const u = renderCard({ isIdiom: false, literal: undefined });
  expect(u.queryByText(/IDIOM/i)).toBeNull();
});

it('an idiom phrase shows the IDIOM tag', () => {
  const u = renderCard({ isIdiom: true });
  expect(u.getByText(/IDIOM/i)).toBeTruthy();
});

it('renders with no audio without crashing', () => {
  expect(() => renderCard({ audio: undefined })).not.toThrow();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest PhraseMeaning -t "IDIOM"`
Expected: FAIL — the eyebrow currently hard-codes "· IDIOM" for every phrase.

- [ ] **Step 3: Implement the generalization**

In `src/screens/PhraseMeaning.tsx`:
- Change the eyebrow (currently `NEW PHRASE · IDIOM`) to a neutral label with a conditional idiom tag:

```tsx
        <Text style={[styles.eyebrow, { color: T.faint }]}>
          WHICH MEANING?{item.isIdiom ? <Text style={{ color: T.primary }}> · IDIOM</Text> : null}
        </Text>
```

- On solve, only render `LiteralNote` when there's a literal reading:

```tsx
        {solved && item.literal ? <LiteralNote literal={item.literal} usageNote={undefined} /> : null}
```

- The mount effect already only `onPreload`s (no auto-play) and audio is optional-chained, so the card renders without audio. Leave the orb/waveform as-is (silent when no clip). Do NOT change the choices rendering or the wrong-answer-no-advance logic.

- [ ] **Step 4: Run tests + full suite + update snapshot**

Run: `npx jest PhraseMeaning` → PASS (a snapshot may change — `npx jest PhraseMeaning -u` and eyeball: only the eyebrow text + conditional literal note differ).
Run: `npm test` → PASS.
Run: `npm run typecheck && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/PhraseMeaning.tsx src/screens/PhraseMeaning.test.tsx src/screens/__snapshots__/PhraseMeaning.test.tsx.snap
git commit -m "feat(loop): PhraseMeaning works for all phrases (idiom tag/literal note conditional)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Route phrase recognition reviews to `phrase/meaning`

**Files:**
- Modify: `src/session/renderFor.ts` (phrase block)
- Test: `src/session/renderFor.test.ts`

**Interfaces:**
- Consumes: phrase `choices` (Task 2), generalized `PhraseMeaning` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `src/session/renderFor.test.ts`, add (and UPDATE the prior-branch expectations that routed audio-less phrases to `phrase/hear` for ALL stages — now only `stage:'new'` is `phrase/hear`):

```ts
it('a new phrase routes to phrase/hear (first exposure)', () => {
  const item = { id: 'p', type: 'phrase' as const, stage: 'new' as const, reps: 0, target: 'labrīt', gloss: 'good morning',
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' as const };
  expect(renderFor(item)).toBe('phrase/hear');
});

it('a phrase recognition review routes to phrase/meaning (the meaning quiz)', () => {
  const item = { id: 'p', type: 'phrase' as const, stage: 'review' as const, reps: 2, target: 'labrīt', gloss: 'good morning',
    receptiveReps: 1, productiveReps: 0, translationVisibility: 'auto' as const };
  expect(renderFor(item)).toBe('phrase/meaning');
});

it('a phrase at production rung WITH audio routes to phrase/sayit', () => {
  const item = { id: 'p', type: 'phrase' as const, stage: 'review' as const, reps: 9, target: 'labrīt', gloss: 'good morning',
    audio: { envelope: [0.5] }, receptiveReps: 3, productiveReps: 6, translationVisibility: 'auto' as const };
  expect(renderFor(item)).toBe('phrase/sayit');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest renderFor -t "phrase"`
Expected: FAIL — recognition review currently returns `phrase/hear` (audio-less) or only idioms reach `phrase/meaning`.

- [ ] **Step 3: Implement the routing**

In `src/session/renderFor.ts`, replace the phrase block with:

```ts
  // Phrase reviews. (locked/unlock handled by the controller, not here.) All phrases now get the
  // meaning-quiz (phrase/meaning) for recognition — it's audio-optional and has choices (Task 2).
  if (item.type === 'phrase') {
    if (item.stage === 'new') return 'phrase/hear'; // first exposure: hear/see the phrase
    // Production (sayit) compares against native audio, so it needs audio.
    if (hasAudio && computeRung(item.receptiveReps ?? 0, item.productiveReps ?? 0) === 'production') {
      return 'phrase/sayit';
    }
    return 'phrase/meaning'; // recognition meaning-quiz
  }
```

This removes the prior `if (!hasAudio) return 'phrase/hear'` and `if (item.isIdiom) return 'phrase/meaning'` special cases — `is_idiom` no longer affects routing.

- [ ] **Step 4: Run tests + full suite**

Run: `npx jest renderFor` → PASS. Update any prior-branch phrase test asserting audio-less phrase → `phrase/hear` for a non-`new` stage; those recognition cases are now `phrase/meaning` (confirm each is the intended change). Then:
Run: `npm test` → PASS (watch decideKind / sessionController / StartingLoop phrase-flow suites).
Run: `npm run typecheck && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/renderFor.ts src/session/renderFor.test.ts
git commit -m "feat(loop): route phrase recognition reviews to the phrase/meaning quiz

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `get_phrase_distractors` (shared-component-first, exclude target/same-gloss) → Task 1. ✓
- Build phrase `choices` in getDueBatch (+ shared shuffle) → Task 2. ✓
- Routing new→hear, recognition→meaning, production(audio)→sayit → Task 4. ✓
- `PhraseMeaning` generalized (eyebrow, conditional idiom tag + literal, audio-optional) → Task 3. ✓
- Out of scope (smarter distractors, TTS, is_idiom expansion) → not built. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The "adapt to the file's helpers" notes (Task 2 fake-client/contentRow, Task 3 renderCard) point at concrete existing templates (the lemma distractor test, the PhraseHear/WordHear card tests).

**Type consistency:** `get_phrase_distractors(target, n)` consistent Task 1↔2. `shuffleInPlace<T>` used by both lemma + phrase branches. `item.choices` shape `{value, gloss, correct}` matches `ReviewChoice`. renderFor returns `phrase/hear|phrase/meaning|phrase/sayit` (valid `ReviewCardKind`). `hasAudio`/`computeRung` already exist in renderFor.
