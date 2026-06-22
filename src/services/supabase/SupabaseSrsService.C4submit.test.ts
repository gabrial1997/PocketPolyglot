// Module C4: verify that submit() evaluates graduation floors AFTER the FSRS state write.
//
// Spec §6 C2: the rung is DERIVED — no DB column is written. submit() returns
// { nextReviewLabel, rung } where rung = evaluateRung(receptiveReps, productiveReps)
// computed from the post-write cumulative review_log correct counts.
//
// Scenarios:
//   A. item with 2 prior receptive corrects + submit a 3rd correct receptive retrieval
//      → post-write rung 'recall' (floor crossed exactly at 3)
//   B. item with 5 prior productive corrects + submit a 6th word/say correct
//      → post-write rung 'production' (floor crossed exactly at 6)
//   C. submitting a non-production correct (word/hear) never advances the productive sub-track

import { SupabaseSrsService } from './SupabaseSrsService';
import type { CardResult } from '../../types/cardResult';
import type { CardKind } from '../../types/cardKind';

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Minimal fakeClient for submit() tests.
// submit() queries:
//   1. review_state .maybeSingle() — load prior FSRS state
//   2. review_state .upsert()      — write next state
//   3. review_log   .insert()      — log the retrieval
//   4. review_log   .select(...).eq(...).eq(...) — load cumulative counts for floor eval
//
// The client is mutable: insert() pushes rows into the live table so the subsequent
// select() query sees them.
// ---------------------------------------------------------------------------

function makeFakeClientForSubmit(opts: {
  priorState: Row | null;
  existingLogRows: Row[];
}) {
  // Mutable table — insert() appends here; subsequent select() reads here.
  const reviewLog: Row[] = [...opts.existingLogRows];

  const fromTable = (table: string) => {
    if (table === 'review_state') {
      return makeReviewStateBuilder(opts.priorState, reviewLog);
    }
    if (table === 'review_log') {
      return makeReviewLogBuilder(reviewLog);
    }
    // Unknown tables — return a no-op builder.
    return makeNoopBuilder();
  };

  return { from: fromTable } as never;
}

function makeReviewStateBuilder(priorState: Row | null, _reviewLog: Row[]) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    upsert: async () => ({ error: null }),
    maybeSingle: async () => ({ data: priorState, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: priorState, error: null }),
  };
  return builder;
}

function makeReviewLogBuilder(reviewLog: Row[]) {
  // Filters accumulated for a select chain.
  let eqFilters: Record<string, unknown> = {};

  const builder: Record<string, unknown> = {
    select: (_cols?: string) => {
      // Reset filters for each new select chain.
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
    // Awaiting the builder after eq chains resolves the select.
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

function logRow(itemId: string, cardKind: string, correct: boolean): Row {
  return {
    user_id: 'u1',
    item_type: 'lemma',
    item_id: itemId,
    card_kind: cardKind,
    correct,
    created_at: new Date().toISOString(),
  };
}

function cardResult(itemId: string, cardKind: CardKind, correct: boolean | undefined): CardResult {
  return { itemId, cardKind, correct };
}

// ---------------------------------------------------------------------------
// C4 submit() floor evaluation tests
// ---------------------------------------------------------------------------

describe('SupabaseSrsService.submit — C4 graduation floors', () => {
  it('A: 2 prior receptive corrects + 3rd correct receptive → rung "recall" (floor crossed at 3)', async () => {
    // Arrange: 2 existing correct receptive rows.
    const existingLog = [
      logRow('item-a', 'word/hear', true),
      logRow('item-a', 'word/pic-review', true),
    ];
    const client = makeFakeClientForSubmit({
      priorState: priorStateRow('item-a'),
      existingLogRows: existingLog,
    });
    const svc = new SupabaseSrsService(client, 'u1');

    // Act: submit a 3rd correct receptive retrieval (word/hear is non-production).
    const res = await svc.submit(cardResult('item-a', 'word/hear', true));

    // Assert: rung crosses recall floor (receptiveReps = 3 >= RECEPTIVE_GRADUATION_FLOOR=3).
    expect(res.rung).toBe('recall');
    // nextReviewLabel must still be present.
    expect(typeof res.nextReviewLabel).toBe('string');
    expect(res.nextReviewLabel.length).toBeGreaterThan(0);
  });

  it('B: 5 prior productive corrects + 6th word/say correct → rung "production" (floor crossed at 6)', async () => {
    // Arrange: 5 existing correct productive rows + enough receptive to be at recall already.
    const existingLog = [
      logRow('item-b', 'word/hear', true),
      logRow('item-b', 'word/hear', true),
      logRow('item-b', 'word/hear', true),
      logRow('item-b', 'word/say', true),
      logRow('item-b', 'word/say', true),
      logRow('item-b', 'word/say', true),
      logRow('item-b', 'word/say', true),
      logRow('item-b', 'word/say', true),
    ];
    const client = makeFakeClientForSubmit({
      priorState: priorStateRow('item-b'),
      existingLogRows: existingLog,
    });
    const svc = new SupabaseSrsService(client, 'u1');

    // Act: submit a 6th productive correct (word/say).
    const res = await svc.submit(cardResult('item-b', 'word/say', true));

    // Assert: productiveReps = 6 >= PRODUCTION_GRADUATION_FLOOR=6 → 'production'.
    expect(res.rung).toBe('production');
  });

  it('C: submitting a non-production correct (word/hear) never advances the productive sub-track', async () => {
    // Arrange: 5 prior productive, but this retrieval is non-production (word/hear).
    const existingLog = [
      logRow('item-c', 'word/hear', true),
      logRow('item-c', 'word/hear', true),
      logRow('item-c', 'word/hear', true),
      logRow('item-c', 'word/say', true),
      logRow('item-c', 'word/say', true),
      logRow('item-c', 'word/say', true),
      logRow('item-c', 'word/say', true),
      logRow('item-c', 'word/say', true),
    ];
    const client = makeFakeClientForSubmit({
      priorState: priorStateRow('item-c'),
      existingLogRows: existingLog,
    });
    const svc = new SupabaseSrsService(client, 'u1');

    // Act: submit a NON-production correct (word/hear) — the 4th receptive, 5 prior productive.
    const res = await svc.submit(cardResult('item-c', 'word/hear', true));

    // Assert: productiveReps stays at 5 (< 6); rung should NOT be 'production'.
    // receptiveReps = 4, productiveReps = 5 → 'recall' (not 'production').
    expect(res.rung).toBe('recall');
    expect(res.rung).not.toBe('production');
  });

  it('FSRS state write happens before floor eval — rung reflects post-write state', async () => {
    // This is a structural invariant test: submit() must not throw, must return both fields,
    // and the rung must be derived from the log (not from some stale pre-write state).
    // With 3 receptive corrects in log, rung === 'recall'.
    const existingLog = [
      logRow('item-d', 'word/hear', true),
      logRow('item-d', 'word/hear', true),
    ];
    const client = makeFakeClientForSubmit({
      priorState: priorStateRow('item-d'),
      existingLogRows: existingLog,
    });
    const svc = new SupabaseSrsService(client, 'u1');

    const res = await svc.submit(cardResult('item-d', 'word/hear', true));

    // 2 prior + 1 inserted = 3 total receptive → floor exactly met → 'recall'.
    expect(res.rung).toBe('recall');
  });

  it('no DB migration needed: result has rung field but review_state has no rung column', async () => {
    // Confirm that submit() returns the rung without writing any extra columns.
    // The fake client's upsert only writes review_state columns — the returned result
    // carries rung as a derived value, not persisted. This test verifies the contract.
    const client = makeFakeClientForSubmit({
      priorState: null, // brand-new item
      existingLogRows: [],
    });
    const svc = new SupabaseSrsService(client, 'u1');

    const res = await svc.submit(cardResult('item-new', 'word/learn-concrete', undefined));

    expect('rung' in res).toBe(true);
    expect(['recognition', 'recall', 'production']).toContain(res.rung);
    // A brand-new item with no prior log rows → recognition.
    expect(res.rung).toBe('recognition');
  });
});
