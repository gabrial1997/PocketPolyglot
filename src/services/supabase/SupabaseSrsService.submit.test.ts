// Task 3: verify that submit() threads the per-template dimension through the
// review_state select + upsert.
//
// Scenarios:
//   A. word/say result → reads + upserts the 'pronunciation' row;
//      payload has template:'pronunciation'; onConflict is 'user_id,item_type,item_id,template'
//   B. word/hear result → payload has template:'recognition' (single write; no companion)
//   C. word/say ALSO advances the 'recognition' row's own schedule (regression: without this,
//      renderFor() permanently switches a graduated item to word/say, so the recognition row's
//      due_at would freeze at its pre-graduation value and stay due forever)

import { SupabaseSrsService } from './SupabaseSrsService';
import type { CardResult } from '../../types/cardResult';

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Instrumented fake client — extends the pattern from SupabaseSrsService.C4submit.test.ts
// but additionally captures:
//   • every select-chain's eq filters on review_state (to assert template is passed to each read)
//   • every upsert payload + onConflict on review_state (to assert template is persisted)
// One submit() call can now issue TWO review_state select+upsert round-trips (the graded
// template, plus a recognition companion write), so captures are arrays, not "last write wins".
// ---------------------------------------------------------------------------

interface CapturedUpsert {
  payload: Row;
  onConflict: string;
}

interface TemplateTestFake {
  client: never; // typed as `never` so SupabaseSrsService accepts it
  reviewStateSelects: Row[];
  reviewStateUpserts: CapturedUpsert[];
  reviewLog: Row[];
}

function makeFakeClientForTemplateTest(opts: {
  priorStateByTemplate: { recognition?: Row | null; pronunciation?: Row | null };
  existingLogRows?: Row[];
}): TemplateTestFake {
  const reviewLog: Row[] = [...(opts.existingLogRows ?? [])];

  const reviewStateSelects: Row[] = [];
  const reviewStateUpserts: CapturedUpsert[] = [];

  const fromTable = (table: string) => {
    if (table === 'review_state') {
      return makeInstrumentedReviewStateBuilder(
        opts.priorStateByTemplate,
        (filters) => { reviewStateSelects.push(filters); },
        (payload, onConflict) => { reviewStateUpserts.push({ payload, onConflict }); },
      );
    }
    if (table === 'review_log') {
      return makeReviewLogBuilder(reviewLog);
    }
    return makeNoopBuilder();
  };

  // Expose captured values through the fake wrapper. We can't put them on
  // the client object itself (the `from` proxy is the only public surface),
  // so we return them as part of the wrapper and read them after await.
  const wrapper = {
    get reviewStateSelects() { return reviewStateSelects; },
    get reviewStateUpserts() { return reviewStateUpserts; },
    get reviewLog() { return reviewLog; },
    client: { from: fromTable } as never,
  };

  return wrapper as TemplateTestFake;
}

function makeInstrumentedReviewStateBuilder(
  priorStateByTemplate: { recognition?: Row | null; pronunciation?: Row | null },
  onSelect: (filters: Row) => void,
  onUpsert: (payload: Row, onConflict: string) => void,
) {
  let eqFilters: Row = {};
  let inSelectChain = false;

  const builder: Record<string, unknown> = {
    select: (_cols?: string) => {
      // Distinguish a select chain (prior-state read) from a count/head call.
      inSelectChain = true;
      eqFilters = {};
      return builder;
    },
    eq: (col: string, val: unknown) => {
      if (inSelectChain) {
        eqFilters = { ...eqFilters, [col]: val };
      }
      return builder;
    },
    upsert: async (payload: Row, opts?: { onConflict?: string }) => {
      onUpsert(payload, opts?.onConflict ?? '');
      return { error: null };
    },
    maybeSingle: async () => {
      // Fire the capture once the chain resolves, then serve the prior matching the
      // template that was actually selected on (each template has its own independent prior).
      onSelect({ ...eqFilters });
      const template = eqFilters.template as 'recognition' | 'pronunciation' | undefined;
      inSelectChain = false;
      const prior = template ? priorStateByTemplate[template] ?? null : null;
      return { data: prior, error: null };
    },
    then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
  };
  return builder;
}

function makeReviewLogBuilder(reviewLog: Row[]) {
  let eqFilters: Row = {};

  const builder: Record<string, unknown> = {
    select: (_cols?: string) => {
      eqFilters = {};
      return builder;
    },
    eq: (col: string, val: unknown) => {
      eqFilters = { ...eqFilters, [col]: val };
      return builder;
    },
    insert: async (row: Row) => {
      reviewLog.push(row);
      return { error: null };
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
      const filters = { ...eqFilters };
      const filtered = reviewLog.filter(r =>
        Object.entries(filters).every(([k, v]) => r[k] === v),
      );
      return resolve({ data: filtered, error: null });
    },
  };
  return builder;
}

function makeNoopBuilder() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    upsert: async () => ({ error: null }),
    insert: async () => ({ error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  };
  return builder;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priorStateRow(itemId = 'item-1'): Row {
  return {
    user_id: 'u1',
    item_type: 'lemma',
    item_id: itemId,
    stage: 'review',
    reps: 3,
    lapses: 0,
    stability: 10,
    difficulty: 5,
    due_at: new Date(Date.now() - 5000).toISOString(),
    last_review: new Date(Date.now() - 86_400_000).toISOString(),
  };
}

function cardResult(itemId: string, cardKind: string, correct: boolean): CardResult {
  return { itemId, cardKind: cardKind as CardResult['cardKind'], correct };
}

// ---------------------------------------------------------------------------
// Task 3: per-template submit() tests
// ---------------------------------------------------------------------------

describe('SupabaseSrsService.submit — per-template (Task 3)', () => {
  it('A: word/say reads + upserts the pronunciation row', async () => {
    const fake = makeFakeClientForTemplateTest({
      priorStateByTemplate: { pronunciation: priorStateRow('lemma-1') },
    });
    const svc = new SupabaseSrsService(fake.client, 'user-1');

    await svc.submit(cardResult('lemma-1', 'word/say', true));

    // The select chain that loaded prior state must include template:'pronunciation'
    expect(fake.reviewStateSelects).toContainEqual(
      expect.objectContaining({ item_type: 'lemma', item_id: 'lemma-1', template: 'pronunciation' }),
    );

    // The upsert payload must carry template:'pronunciation'
    const pronUpsert = fake.reviewStateUpserts.find(u => u.payload.template === 'pronunciation');
    expect(pronUpsert).toBeDefined();

    // The conflict target must include template
    expect(pronUpsert!.onConflict).toBe('user_id,item_type,item_id,template');
  });

  it('B: word/hear uses only the recognition row (no companion write)', async () => {
    const fake = makeFakeClientForTemplateTest({
      priorStateByTemplate: { recognition: priorStateRow('lemma-1') },
    });
    const svc = new SupabaseSrsService(fake.client, 'user-1');

    await svc.submit(cardResult('lemma-1', 'word/hear', true));

    // Recognition is already the graded template, so there is nothing to mirror — exactly one
    // review_state upsert should happen (the pre-existing, single-row behaviour).
    expect(fake.reviewStateUpserts).toHaveLength(1);
    const [onlyUpsert] = fake.reviewStateUpserts;
    expect(onlyUpsert!.payload).toMatchObject({ template: 'recognition' });
    expect(onlyUpsert!.onConflict).toBe('user_id,item_type,item_id,template');
  });

  it('C: word/say ALSO advances the recognition row\'s own schedule (regression)', async () => {
    // The recognition row is stale — its due_at is already in the past, as it would be for a
    // lemma that graduated to the production rung a while ago and has only received word/say
    // grades since. Without the companion write, this row's due_at never moves and the item
    // stays "due" forever even though the learner keeps passing word/say.
    const staleRecognitionPrior = priorStateRow('lemma-1');
    const fake = makeFakeClientForTemplateTest({
      priorStateByTemplate: { recognition: staleRecognitionPrior, pronunciation: null },
    });
    const svc = new SupabaseSrsService(fake.client, 'user-1');

    await svc.submit(cardResult('lemma-1', 'word/say', true));

    // Both rows get an independent select + upsert.
    expect(fake.reviewStateSelects).toContainEqual(
      expect.objectContaining({ item_type: 'lemma', item_id: 'lemma-1', template: 'recognition' }),
    );
    const recogUpsert = fake.reviewStateUpserts.find(u => u.payload.template === 'recognition');
    const pronUpsert = fake.reviewStateUpserts.find(u => u.payload.template === 'pronunciation');
    expect(recogUpsert).toBeDefined();
    expect(pronUpsert).toBeDefined();

    // The recognition row's due_at must move into the future — a correct review of any kind
    // must un-stick a stale recognition schedule, not leave it permanently due.
    expect(new Date(recogUpsert!.payload.due_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(recogUpsert!.onConflict).toBe('user_id,item_type,item_id,template');
  });
});

// ---------------------------------------------------------------------------
// Teach cards are ungraded exposures — they must NOT advance FSRS.
// Beta report 8b5ab652 follow-up (founder decision 2026-07-22): the first-exposure learn card
// posted a Good with zero retrieval, inflating day-1 stability (spec §3: "ungraded exposures
// count nothing"). The exposure is still review_log'd; the first real grade is the MC retrieval.
// phrase/hear stays graded on purpose — it doubles as the MC-fallback for distractor-less due
// phrases (renderFor), and exempting it would freeze those rows' schedules.
// ---------------------------------------------------------------------------

describe('SupabaseSrsService.submit — teach cards do not grade FSRS', () => {
  it.each(['word/learn-function', 'word/learn-concrete', 'word/learn-abstract'])(
    '%s logs the exposure but never reads or writes review_state',
    async (kind) => {
      const fake = makeFakeClientForTemplateTest({ priorStateByTemplate: {} });
      const svc = new SupabaseSrsService(fake.client, 'user-1');

      const res = await svc.submit({ itemId: 'lemma-1', cardKind: kind, spoke: false } as CardResult);

      expect(fake.reviewStateSelects).toHaveLength(0);
      expect(fake.reviewStateUpserts).toHaveLength(0);
      // The exposure still lands in review_log (analytics + arc history).
      expect(fake.reviewLog).toContainEqual(expect.objectContaining({ item_id: 'lemma-1', card_kind: kind }));
      // The arc serves the MC step later this same session.
      expect(res.nextReviewLabel).toBe('Next review later today');
    },
  );

  it('phrase/hear still grades (it doubles as the distractor-less MC fallback)', async () => {
    const fake = makeFakeClientForTemplateTest({ priorStateByTemplate: {} });
    const svc = new SupabaseSrsService(fake.client, 'user-1');

    await svc.submit({ itemId: 'phrase-1', cardKind: 'phrase/hear', spoke: false } as CardResult);

    expect(fake.reviewStateUpserts.length).toBeGreaterThan(0);
  });
});
