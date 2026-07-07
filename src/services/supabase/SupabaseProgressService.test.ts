// SupabaseProgressService — coverage read honesty. The client must NEVER render "N of the 0 most
// common words": while the content library is unpublished (all rows 'draft'), the user_coverage
// view reports total_count = 0, and a missing row reports nothing at all. Both fall back to the
// ~1,000-word core size (a schema-side fix may land separately; the client guard stays).
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseProgressService } from './SupabaseProgressService';

/** Minimal chainable fake of the query builder for from().select().eq().maybeSingle(). */
function fakeClient(row: Record<string, unknown> | null, error: { message: string } | null = null): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: row, error }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe('SupabaseProgressService.getCoverage', () => {
  it('passes through a real coverage row', async () => {
    const svc = new SupabaseProgressService(fakeClient({ known_count: 250, total_count: 800 }), 'u1');
    await expect(svc.getCoverage()).resolves.toEqual({ known: 250, total: 800 });
  });

  it('falls back to the ~1,000-word core when the user has no coverage row yet', async () => {
    const svc = new SupabaseProgressService(fakeClient(null), 'u1');
    await expect(svc.getCoverage()).resolves.toEqual({ known: 0, total: 1000 });
  });

  it('guards total_count = 0 (all-draft content) with the same fallback — never "of the 0"', async () => {
    const svc = new SupabaseProgressService(fakeClient({ known_count: 0, total_count: 0 }), 'u1');
    await expect(svc.getCoverage()).resolves.toEqual({ known: 0, total: 1000 });
  });

  it('guards total_count = null with the fallback', async () => {
    const svc = new SupabaseProgressService(fakeClient({ known_count: 3, total_count: null }), 'u1');
    await expect(svc.getCoverage()).resolves.toEqual({ known: 3, total: 1000 });
  });

  it('propagates a query error (the host renders its retryable error state)', async () => {
    const svc = new SupabaseProgressService(fakeClient(null, { message: 'offline' }), 'u1');
    await expect(svc.getCoverage()).rejects.toBeTruthy();
  });
});
