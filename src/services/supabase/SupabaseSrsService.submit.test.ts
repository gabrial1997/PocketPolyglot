// Task 3: verify that submit() threads the per-template dimension through the
// review_state select + upsert.
//
// Scenarios:
//   A. word/say result → reads + upserts the 'pronunciation' row;
//      payload has template:'pronunciation'; onConflict is 'user_id,item_type,item_id,template'
//   B. word/hear result → payload has template:'recognition'

import { SupabaseSrsService } from './SupabaseSrsService';
import type { CardResult } from '../../types/cardResult';

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Instrumented fake client — extends the pattern from SupabaseSrsService.C4submit.test.ts
// but additionally captures:
//   • select-chain eq filters on review_state (to assert template is passed to the read)
//   • upsert payload + onConflict on review_state (to assert template is persisted)
// ---------------------------------------------------------------------------

interface CapturedUpsert {
  payload: Row;
  onConflict: string;
}

interface TemplateTestFake {
  client: never; // typed as `never` so SupabaseSrsService accepts it
  lastReviewStateSelect: Row;
  lastReviewStateUpsert: CapturedUpsert;
}

function makeFakeClientForTemplateTest(opts: {
  priorState: Row | null;
  existingLogRows?: Row[];
}): TemplateTestFake {
  const reviewLog: Row[] = [...(opts.existingLogRows ?? [])];

  let capturedSelectFilters: Row = {};
  let capturedUpsert: CapturedUpsert = { payload: {}, onConflict: '' };

  const fromTable = (table: string) => {
    if (table === 'review_state') {
      return makeInstrumentedReviewStateBuilder(
        opts.priorState,
        (filters) => { capturedSelectFilters = { ...filters }; },
        (payload, onConflict) => { capturedUpsert = { payload, onConflict }; },
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
    get lastReviewStateSelect() { return capturedSelectFilters; },
    get lastReviewStateUpsert() { return capturedUpsert; },
    client: { from: fromTable } as never,
  };

  return wrapper as TemplateTestFake;
}

function makeInstrumentedReviewStateBuilder(
  priorState: Row | null,
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
      // Fire the capture once the chain resolves.
      onSelect({ ...eqFilters });
      inSelectChain = false;
      return { data: priorState, error: null };
    },
    then: (resolve: (v: unknown) => unknown) => resolve({ data: priorState, error: null }),
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
    const fake = makeFakeClientForTemplateTest({ priorState: priorStateRow('lemma-1') });
    const svc = new SupabaseSrsService(fake.client, 'user-1');

    await svc.submit(cardResult('lemma-1', 'word/say', true));

    // The select chain that loaded prior state must include template:'pronunciation'
    expect(fake.lastReviewStateSelect).toMatchObject({
      item_type: 'lemma',
      item_id: 'lemma-1',
      template: 'pronunciation',
    });

    // The upsert payload must carry template:'pronunciation'
    expect(fake.lastReviewStateUpsert.payload).toMatchObject({ template: 'pronunciation' });

    // The conflict target must include template
    expect(fake.lastReviewStateUpsert.onConflict).toBe('user_id,item_type,item_id,template');
  });

  it('B: word/hear uses the recognition row', async () => {
    const fake = makeFakeClientForTemplateTest({ priorState: priorStateRow('lemma-1') });
    const svc = new SupabaseSrsService(fake.client, 'user-1');

    await svc.submit(cardResult('lemma-1', 'word/hear', true));

    expect(fake.lastReviewStateSelect).toMatchObject({ template: 'recognition' });
    expect(fake.lastReviewStateUpsert.payload).toMatchObject({ template: 'recognition' });
    expect(fake.lastReviewStateUpsert.onConflict).toBe('user_id,item_type,item_id,template');
  });
});
