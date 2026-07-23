// SupabaseKnownWordsStore — snapshot loading + the refresh() generation guard.
//
// The store now serves the EARNED lemma set (spec 2026-07-23) via the shared
// loadEarnedLemmaIds() loader, which queries review_log (not known_lemmas). The fake client
// below honours that loader's exact chain (select→eq→eq→in→order→range), with `.range()`
// returning a manually-controlled deferred promise so tests can dictate resolution order —
// this backs phrase unlocking (has()/all() are synchronous reads of the last refresh), so a
// stale in-flight refresh must never overwrite a newer one: without the `gen` guard the LAST
// query to RESOLVE wins, and a slow response started earlier could clobber fresher data.

import { SupabaseKnownWordsStore } from './SupabaseKnownWordsStore';

type LogRow = { item_id: string; card_kind: string; correct: boolean | null; session_id: string | null; created_at: string };

interface Deferred {
  resolve: (v: { data: LogRow[] | null; error: object | null }) => void;
  promise: Promise<{ data: LogRow[] | null; error: object | null }>;
}

function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  const promise = new Promise<{ data: LogRow[] | null; error: object | null }>(
    (res) => { resolve = res; },
  );
  return { resolve, promise };
}

// A row with no word/learn-* intro row is "earned" under computeEarned's legacy fallback, so a
// single correct word/hear row per lemma id is enough to make it show up in the refreshed set —
// keeps these tests focused on the store's refresh()/gen-guard plumbing, not computeEarned's
// same-session logic (covered by session/earned.test.ts and earnedLoader.test.ts).
function correctRow(lemmaId: string): LogRow {
  return { item_id: lemmaId, card_kind: 'word/hear', correct: true, session_id: 's1', created_at: '2026-07-01T00:00:00.000Z' };
}

/** Fake client: each refresh() consumes the next queued deferred at the final `.range()` call. */
function makeFakeClient(queue: Deferred[]) {
  let call = 0;
  const eqCalls: Array<{ col: string; val: unknown }> = [];
  const client = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, val: unknown) => {
          eqCalls.push({ col, val });
          return {
            eq: (col2: string, val2: unknown) => {
              eqCalls.push({ col: col2, val: val2 });
              return {
                in: (_col: string, _vals: string[]) => ({
                  order: (_col: string, _opts?: unknown) => ({
                    range: (_from: number, _to: number) => {
                      const d = queue[call++];
                      if (!d) throw new Error('fake client: no queued response left');
                      return d.promise;
                    },
                  }),
                }),
              };
            },
          };
        },
      }),
    }),
  };
  return { client, eqCalls };
}

describe('SupabaseKnownWordsStore', () => {
  it('refresh() loads the earned lemma set; has()/all() read the snapshot', async () => {
    const d = deferred();
    const { client, eqCalls } = makeFakeClient([d]);
    const store = new SupabaseKnownWordsStore(client as never, 'u1');

    const p = store.refresh();
    d.resolve({ data: [correctRow('l-1'), correctRow('l-2')], error: null });
    await p;

    expect(store.has('l-1')).toBe(true);
    expect(store.has('l-2')).toBe(true);
    expect(store.has('l-3')).toBe(false);
    expect([...store.all()].sort()).toEqual(['l-1', 'l-2']);
    expect(eqCalls).toEqual([
      { col: 'user_id', val: 'u1' },
      { col: 'item_type', val: 'lemma' },
    ]);
  });

  it('refresh() throws on a query error and leaves the previous snapshot intact', async () => {
    const ok = deferred();
    const bad = deferred();
    const { client } = makeFakeClient([ok, bad]);
    const store = new SupabaseKnownWordsStore(client as never, 'u1');

    const p1 = store.refresh();
    ok.resolve({ data: [correctRow('l-1')], error: null });
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
    fast.resolve({ data: [correctRow('l-1'), correctRow('l-2')], error: null });
    await pFast;
    expect(store.has('l-2')).toBe(true);

    // …then the STALE response lands. Last-resolver-wins would shrink the set back to just l-1.
    slow.resolve({ data: [correctRow('l-1')], error: null });
    await pSlow;

    expect(store.has('l-2')).toBe(true); // stale response was dropped
    expect([...store.all()].sort()).toEqual(['l-1', 'l-2']);
  });
});
