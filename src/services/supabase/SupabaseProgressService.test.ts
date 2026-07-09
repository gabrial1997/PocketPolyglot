// SupabaseProgressService — coverage from known_lemmas × lemmas.freq_rank (spec 2026-07-06).
import { SupabaseProgressService } from './SupabaseProgressService';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

/** Minimal chainable fake: each from(table) resolves to the table's rows through any filters.
 *  Filters (eq/not/range) are recorded but not applied — tests seed exactly the rows the real
 *  query would return; errors are injectable per table. */
function fakeClient(
  tables: Record<string, Row[]>,
  errors: Record<string, { message: string }> = {},
): SupabaseClient {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? [], error: errors[table] ?? null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        range: () => builder,
        then: (onFulfilled: (v: typeof result) => unknown) =>
          Promise.resolve(result).then(onFulfilled),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const corpus = [
  { id: 'l1', freq_rank: 1 },
  { id: 'l2', freq_rank: 2 },
  { id: 'l3', freq_rank: 3 },
  { id: 'l9', freq_rank: 9 },
];

describe('SupabaseProgressService.getCoverage', () => {
  it('joins known lemma ids to their ranks, ascending, with total = ranked corpus size', async () => {
    const svc = new SupabaseProgressService(
      fakeClient({ known_lemmas: [{ lemma_id: 'l9' }, { lemma_id: 'l1' }], lemmas: corpus }),
      'u1',
    );
    await expect(svc.getCoverage()).resolves.toEqual({ total: 4, knownRanks: [1, 9] });
  });

  it('drops known lemmas that are not in the ranked corpus (off-list content)', async () => {
    const svc = new SupabaseProgressService(
      fakeClient({ known_lemmas: [{ lemma_id: 'l2' }, { lemma_id: 'off-list' }], lemmas: corpus }),
      'u1',
    );
    await expect(svc.getCoverage()).resolves.toEqual({ total: 4, knownRanks: [2] });
  });

  it('a fresh user (no known rows) gets empty ranks, not an error', async () => {
    const svc = new SupabaseProgressService(fakeClient({ known_lemmas: [], lemmas: corpus }), 'u1');
    await expect(svc.getCoverage()).resolves.toEqual({ total: 4, knownRanks: [] });
  });

  it('propagates a query error (the host renders its retryable error state)', async () => {
    const svc = new SupabaseProgressService(
      fakeClient({ known_lemmas: [], lemmas: corpus }, { lemmas: { message: 'boom' } }),
      'u1',
    );
    await expect(svc.getCoverage()).rejects.toEqual({ message: 'boom' });
  });
});
