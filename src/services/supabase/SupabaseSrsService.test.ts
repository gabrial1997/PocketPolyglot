// getDueBatch ordering: the returned batch MUST follow the seeded curriculum order (due_at asc,
// then a deterministic item_id tiebreak for NULL-due_at new items) — and it must INTERLEAVE types,
// not group all words then all phrases. That interleaving is what lets a seeded walk hit a locked
// phrase, then its component words, then the phrase's unlock. Regression for the device-walk bug
// "the unlock phrase sequence never fires."
//
// The Supabase client is faked at the query-builder level: each `.from(table)` returns a chainable,
// awaitable builder that resolves canned rows. We assert on the ORDER of the final ReviewItem array.
import { SupabaseSrsService } from './SupabaseSrsService';
import type { ReviewStateRow } from './types';

type Row = Record<string, unknown>;
type OrderBy = { col: string; ascending: boolean; nullsFirst: boolean };

// Mirror Postgres ORDER BY: apply each key in sequence as a tiebreak, NULLs first/last per opts.
function applyOrder(rows: Row[], orderBys: OrderBy[]): Row[] {
  if (orderBys.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { col, ascending, nullsFirst } of orderBys) {
      const av = a[col] as string | null | undefined;
      const bv = b[col] as string | null | undefined;
      if (av == null && bv == null) continue;
      if (av == null) return nullsFirst ? -1 : 1;
      if (bv == null) return nullsFirst ? 1 : -1;
      if (av < bv) return ascending ? -1 : 1;
      if (av > bv) return ascending ? 1 : -1;
    }
    return 0;
  });
}

// A chainable, thenable query builder. Query methods return `this`; awaiting resolves the canned
// `{ data, error }`. `.order()` actually sorts (so the due_at + item_id tiebreak is exercised, as
// Postgres would); `.in()` filters the canned rows to the requested ids.
function makeBuilder(table: string, tables: Record<string, Row[]>) {
  let rows: Row[] = tables[table] ?? [];
  const orderBys: OrderBy[] = [];
  const resolved = () => ({ data: applyOrder(rows, orderBys), error: null });
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    or: () => builder,
    limit: () => builder,
    lte: () => builder,
    order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
      orderBys.push({ col, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst === true });
      return builder;
    },
    in: (_col: string, ids: string[]) => {
      rows = (tables[table] ?? []).filter((r) => ids.includes(r.id as string));
      return builder;
    },
    maybeSingle: async () => ({ data: applyOrder(rows, orderBys)[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve(resolved()),
  };
  return builder;
}

function fakeClient(tables: Record<string, Row[]>) {
  return {
    from: (table: string) => makeBuilder(table, tables),
    // get_distractors returns nothing here — choices degrade gracefully (not under test).
    rpc: async () => ({ data: [], error: null }),
  } as never;
}

// review_state rows in a SCRAMBLED input order, with due_at offsets that encode the intended walk:
// phrase p-lock (locked, earliest), then word w-a, word w-b, then phrase p-after. Two NEW words
// (w-x, w-y) carry NULL due_at to exercise the item_id tiebreak.
function stateRow(item_type: string, item_id: string, dueOffsetSec: number | null): ReviewStateRow {
  const due_at = dueOffsetSec === null ? null : new Date(1_900_000_000_000 + dueOffsetSec * 1000).toISOString();
  return {
    user_id: 'u1',
    item_type,
    item_id,
    stage: 'new',
    due_at,
    stability: null,
    difficulty: null,
    reps: 0,
    lapses: 0,
    last_reviewed_at: null,
  } as unknown as ReviewStateRow;
}

function contentRow(id: string, extra: Row = {}): Row {
  return { id, lemma: id, gloss_en: id, target: id, gloss: id, audio_url: `${id}.mp3`, ...extra };
}

describe('SupabaseSrsService.getDueBatch ordering', () => {
  it('returns items in due_at order, interleaving phrases and words — not grouped by type', async () => {
    // Scrambled on input; intended order by due_at is: p-lock(0), w-a(60), w-b(120), p-after(180).
    const states = [
      stateRow('lemma', 'w-b', 120),
      stateRow('phrase', 'p-after', 180),
      stateRow('lemma', 'w-a', 60),
      stateRow('phrase', 'p-lock', 0),
    ];
    const tables: Record<string, Row[]> = {
      review_state: states as unknown as Row[],
      lemmas: [contentRow('w-a'), contentRow('w-b')],
      phrases: [contentRow('p-lock'), contentRow('p-after')],
      phrase_components: [],
      minimal_pairs: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables), 'u1');

    const batch = await svc.getDueBatch();

    // The phrases must NOT all sink to the end (the old type-grouping bug). p-lock comes first and
    // p-after comes between/after its words, exactly tracking due_at.
    expect(batch.map((i) => i.id)).toEqual(['p-lock', 'w-a', 'w-b', 'p-after']);
  });

  it('breaks NULL-due_at ties deterministically by item_id (stable starting-loop order)', async () => {
    // Two brand-new words with NULL due_at, fed in reverse id order. They must come out id-sorted.
    const states = [stateRow('lemma', 'w-y', null), stateRow('lemma', 'w-x', null)];
    const tables: Record<string, Row[]> = {
      review_state: states as unknown as Row[],
      lemmas: [contentRow('w-y'), contentRow('w-x')],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables), 'u1');

    const batch = await svc.getDueBatch();

    expect(batch.map((i) => i.id)).toEqual(['w-x', 'w-y']);
  });
});
