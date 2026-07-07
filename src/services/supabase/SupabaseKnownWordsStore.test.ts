// SupabaseKnownWordsStore — snapshot loading + the refresh() generation guard.
//
// The store backs phrase unlocking (has()/all() are synchronous reads of the last refresh),
// so a stale in-flight refresh must never overwrite a newer one: without the `gen` guard the
// LAST query to RESOLVE wins, and a slow response started earlier could clobber fresher data.
// The fake client returns manually-resolved deferreds so the test controls resolution order.

import { SupabaseKnownWordsStore } from './SupabaseKnownWordsStore';

interface Deferred {
  resolve: (v: { data: Array<{ lemma_id: string }> | null; error: object | null }) => void;
  promise: Promise<{ data: Array<{ lemma_id: string }> | null; error: object | null }>;
}

function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  const promise = new Promise<{ data: Array<{ lemma_id: string }> | null; error: object | null }>(
    (res) => { resolve = res; },
  );
  return { resolve, promise };
}

/** Fake client: each refresh() consumes the next queued deferred (chain: from→select→eq→await). */
function makeFakeClient(queue: Deferred[]) {
  let call = 0;
  const eqCalls: Array<{ col: string; val: unknown }> = [];
  const client = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, val: unknown) => {
          eqCalls.push({ col, val });
          const d = queue[call++];
          if (!d) throw new Error('fake client: no queued response left');
          return d.promise;
        },
      }),
    }),
  };
  return { client, eqCalls };
}

describe('SupabaseKnownWordsStore', () => {
  it('refresh() loads lemma ids; has()/all() read the snapshot', async () => {
    const d = deferred();
    const { client, eqCalls } = makeFakeClient([d]);
    const store = new SupabaseKnownWordsStore(client as never, 'u1');

    const p = store.refresh();
    d.resolve({ data: [{ lemma_id: 'l-1' }, { lemma_id: 'l-2' }], error: null });
    await p;

    expect(store.has('l-1')).toBe(true);
    expect(store.has('l-2')).toBe(true);
    expect(store.has('l-3')).toBe(false);
    expect([...store.all()].sort()).toEqual(['l-1', 'l-2']);
    expect(eqCalls).toEqual([{ col: 'user_id', val: 'u1' }]);
  });

  it('refresh() throws on a query error and leaves the previous snapshot intact', async () => {
    const ok = deferred();
    const bad = deferred();
    const { client } = makeFakeClient([ok, bad]);
    const store = new SupabaseKnownWordsStore(client as never, 'u1');

    const p1 = store.refresh();
    ok.resolve({ data: [{ lemma_id: 'l-1' }], error: null });
    await p1;

    const p2 = store.refresh();
    bad.resolve({ data: null, error: { message: 'boom' } });
    await expect(p2).rejects.toEqual({ message: 'boom' });

    // Old snapshot still readable.
    expect(store.has('l-1')).toBe(true);
  });

  it('a slow, stale refresh does NOT overwrite a newer one (generation guard)', async () => {
    const slow = deferred(); // started first, resolves last
    const fast = deferred(); // started second, resolves first
    const { client } = makeFakeClient([slow, fast]);
    const store = new SupabaseKnownWordsStore(client as never, 'u1');

    const pSlow = store.refresh(); // gen 1
    const pFast = store.refresh(); // gen 2 — supersedes gen 1

    // The NEWER refresh resolves first with the fresher (larger) set…
    fast.resolve({ data: [{ lemma_id: 'l-1' }, { lemma_id: 'l-2' }], error: null });
    await pFast;
    expect(store.has('l-2')).toBe(true);

    // …then the STALE response lands. Last-resolver-wins would shrink the set back to just l-1.
    slow.resolve({ data: [{ lemma_id: 'l-1' }], error: null });
    await pSlow;

    expect(store.has('l-2')).toBe(true); // stale response was dropped
    expect([...store.all()].sort()).toEqual(['l-1', 'l-2']);
  });
});
