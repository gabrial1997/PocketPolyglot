// getDueBatch ordering: the returned batch MUST follow the seeded curriculum order (due_at asc,
// then a deterministic item_id tiebreak for NULL-due_at new items) — and it must INTERLEAVE types,
// not group all words then all phrases. That interleaving is what lets a seeded walk hit a locked
// phrase, then its component words, then the phrase's unlock. Regression for the device-walk bug
// "the unlock phrase sequence never fires."
//
// The Supabase client is faked at the query-builder level: each `.from(table)` returns a chainable,
// awaitable builder that resolves canned rows. We assert on the ORDER of the final ReviewItem array.
//
// B2 tests: verify that getDueBatch now sources NEW items from content tables (no review_state row),
// that due items are always present + uncapped, that the new cap is respected, and that audio-less
// + image-less due items are NOT re-surfaced.
import { SupabaseSrsService } from './SupabaseSrsService';
import type { ReviewStateRow } from './types';
import { DAY_ONE_NEW_CAP } from '../../session/pacing';

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
function makeBuilder(table: string, tables: Record<string, Row[]>, rpcFn?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>) {
  let rows: Row[] = [...(tables[table] ?? [])];
  const orderBys: OrderBy[] = [];
  let countMode = false;
  let orFilter: string | null = null;
  let eqFilters: Record<string, unknown> = {};
  let notFilters: Record<string, unknown> = {};
  let lteFilters: Record<string, unknown> = {};
  let gteFilters: Record<string, unknown> = {};
  let likeFilters: Record<string, string> = {};
  let limitVal: number | null = null;
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;

  // Mimic Postgres LIKE: '%' is a wildcard, everything else matched literally.
  const likeToRegExp = (pattern: string) =>
    new RegExp(
      '^' + pattern.split('%').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    );

  const applyFilters = (source: Row[]) => {
    let r = [...source];
    // eq filters
    for (const [k, v] of Object.entries(eqFilters)) {
      r = r.filter(row => row[k] === v);
    }
    // neq filters
    for (const [k, v] of Object.entries(notFilters)) {
      r = r.filter(row => row[k] !== v);
    }
    // lte filters
    for (const [k, v] of Object.entries(lteFilters)) {
      r = r.filter(row => {
        const rv = row[k] as string | null | undefined;
        if (rv == null) return false;
        return rv <= (v as string);
      });
    }
    // gte filters
    for (const [k, v] of Object.entries(gteFilters)) {
      r = r.filter(row => {
        const rv = row[k] as string | null | undefined;
        if (rv == null) return false;
        return rv >= (v as string);
      });
    }
    // like filters
    for (const [k, v] of Object.entries(likeFilters)) {
      const re = likeToRegExp(v);
      r = r.filter(row => typeof row[k] === 'string' && re.test(row[k] as string));
    }
    // or filter: simulate 'due_at.lte.X,stage.eq.new'
    if (orFilter) {
      const parts = orFilter.split(',');
      r = r.filter(row => parts.some(part => {
        const m = part.match(/^(\w+)\.(lte|eq|neq)\.(.+)$/);
        if (!m) return false;
        const [, col, op, val] = m as [string, string, string, string];
        const rv = row[col] as string | null | undefined;
        if (op === 'lte') return rv != null && rv <= val;
        if (op === 'eq') return rv === val;
        if (op === 'neq') return rv !== val;
        return false;
      }));
    }
    return r;
  };

  const resolved = () => {
    const filtered = applyFilters(tables[table] ?? []);
    const sorted = applyOrder(filtered, orderBys);
    let paged: Row[];
    if (rangeStart !== null && rangeEnd !== null) {
      paged = sorted.slice(rangeStart, rangeEnd + 1);
    } else if (limitVal !== null) {
      paged = sorted.slice(0, limitVal);
    } else {
      paged = sorted;
    }
    if (countMode) {
      return { data: null, count: paged.length, error: null };
    }
    return { data: paged, error: null, count: null };
  };

  const builder: Record<string, unknown> = {
    select: (_cols?: string, opts?: Record<string, unknown>) => {
      if (opts?.count === 'exact') countMode = true;
      return builder;
    },
    eq: (col: string, val: unknown) => {
      eqFilters = { ...eqFilters, [col]: val };
      return builder;
    },
    neq: (col: string, val: unknown) => {
      notFilters = { ...notFilters, [col]: val };
      return builder;
    },
    or: (filter: string) => {
      orFilter = filter;
      return builder;
    },
    like: (col: string, pattern: string) => {
      likeFilters = { ...likeFilters, [col]: pattern };
      return builder;
    },
    lte: (col: string, val: unknown) => {
      lteFilters = { ...lteFilters, [col]: val };
      return builder;
    },
    gte: (col: string, val: unknown) => {
      gteFilters = { ...gteFilters, [col]: val };
      return builder;
    },
    limit: (n: number) => {
      limitVal = n;
      return builder;
    },
    range: (from: number, to: number) => {
      rangeStart = from;
      rangeEnd = to;
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
      orderBys.push({ col, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst === true });
      return builder;
    },
    in: (_col: string, ids: string[]) => {
      rows = (tables[table] ?? []).filter((r) => ids.includes(r.id as string));
      // reset rows reference so resolved() uses this filtered set
      tables[`__in_filtered_${table}`] = rows;
      // Override resolved for the .in() case: return filtered rows
      const inResolved = () => ({ data: applyOrder(rows, orderBys), error: null, count: null });
      const inBuilder: Record<string, unknown> = {
        ...builder,
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve(inResolved()),
        maybeSingle: async () => ({ data: applyOrder(rows, orderBys)[0] ?? null, error: null }),
      };
      return inBuilder;
    },
    maybeSingle: async () => {
      const filtered = applyFilters(tables[table] ?? []);
      const sorted = applyOrder(filtered, orderBys);
      return { data: sorted[0] ?? null, error: null };
    },
    upsert: async (newRows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      const arr = Array.isArray(newRows) ? newRows : [newRows];
      const keyCols = (opts?.onConflict ?? 'id').split(',').map((c) => c.trim());
      const existing = (tables[table] ??= []);
      const keyOf = (r: Row) => keyCols.map((c) => String(r[c])).join('|');
      const seen = new Set(existing.map(keyOf));
      for (const r of arr) {
        if (seen.has(keyOf(r))) {
          if (opts?.ignoreDuplicates) continue;
          existing[existing.findIndex((e) => keyOf(e) === keyOf(r))] = r;
        } else {
          existing.push(r);
          seen.add(keyOf(r));
        }
      }
      return { error: null };
    },
    then: (resolve: (v: { data: Row[] | null; error: null; count: number | null }) => unknown) =>
      resolve(resolved()),
  };

  void rpcFn; // suppress unused warning
  return builder;
}

function fakeClient(
  tables: Record<string, Row[]>,
  rpcResults?: Record<string, unknown[]>,
  now?: Date,
) {
  return {
    from: (table: string) => makeBuilder(table, tables),
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (rpcResults && name in rpcResults) {
        return { data: rpcResults[name], error: null };
      }
      // get_distractors returns nothing here — choices degrade gracefully (not under test).
      void args;
      return { data: [], error: null };
    },
    _now: now,
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
    template: 'recognition' as const,
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
    const pastTime = new Date(1_900_000_000_000 - 10_000).toISOString();
    const states = [
      { ...stateRow('lemma', 'w-b', null), stage: 'review', due_at: new Date(1_900_000_000_000 + 120 * 1000).toISOString() },
      { ...stateRow('phrase', 'p-after', null), stage: 'review', due_at: new Date(1_900_000_000_000 + 180 * 1000).toISOString() },
      { ...stateRow('lemma', 'w-a', null), stage: 'review', due_at: new Date(1_900_000_000_000 + 60 * 1000).toISOString() },
      { ...stateRow('phrase', 'p-lock', null), stage: 'review', due_at: new Date(1_900_000_000_000 + 0 * 1000).toISOString() },
    ];

    // All due_at are well in the past relative to real now, so they should be included.
    // Use a far-future "now" to make all items due.
    void pastTime;

    const tables: Record<string, Row[]> = {
      review_state: states as unknown as Row[],
      lemmas: [
        contentRow('w-a', { envelope: [0.5], native_url: 'w-a.mp3' }),
        contentRow('w-b', { envelope: [0.5], native_url: 'w-b.mp3' }),
      ],
      phrases: [
        contentRow('p-lock', { envelope: [0.5] }),
        contentRow('p-after', { envelope: [0.5] }),
      ],
      phrase_components: [],
      minimal_pairs: [],
      // Empty candidate tables — no new items
      review_log: [],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date(1_900_000_000_000 + 1_000_000_000)), 'u1');

    const batch = await svc.getDueBatch();

    // The phrases must NOT all sink to the end (the old type-grouping bug). p-lock comes first and
    // p-after comes between/after its words, exactly tracking due_at.
    expect(batch.map((i) => i.id)).toEqual(['p-lock', 'w-a', 'w-b', 'p-after']);
  });

  it('breaks NULL-due_at ties deterministically by item_id (new candidates are utility-rank ordered)', async () => {
    // Two brand-new lemmas with NO review_state row — they surface as new candidates.
    // utility_rank determines order: w-x=1, w-y=2 → w-x must come before w-y.
    const tables: Record<string, Row[]> = {
      review_state: [], // no state rows — both are never-introduced
      lemmas: [
        contentRow('w-y', { utility_rank: 2, envelope: [0.5], native_url: 'w-y.mp3' }),
        contentRow('w-x', { utility_rank: 1, envelope: [0.5], native_url: 'w-x.mp3' }),
      ],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [{ id: 'u1', created_at: new Date().toISOString() }],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');

    const batch = await svc.getDueBatch();

    // w-x (utility_rank=1) must come before w-y (utility_rank=2)
    const ids = batch.map(i => i.id);
    expect(ids).toContain('w-x');
    expect(ids).toContain('w-y');
    expect(ids.indexOf('w-x')).toBeLessThan(ids.indexOf('w-y'));
  });
});

describe('SupabaseSrsService.getDueBatch — MC distractors', () => {
  it('builds choices from get_distractors: correct answer + all distractors, order-independent', async () => {
    const tables: Record<string, Row[]> = {
      review_state: [{ ...stateRow('lemma', 'w-a', 0), stage: 'review' }] as unknown as Row[],
      lemmas: [contentRow('w-a', { envelope: [0.5], native_url: 'w-a.mp3' })],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [],
    };
    // get_distractors returns 3 closest-sounding decoys.
    const distractors = [
      { id: 'd1', lemma: 'kabata', gloss_en: 'pocket' },
      { id: 'd2', lemma: 'kazas', gloss_en: 'wedding' },
      { id: 'd3', lemma: 'kakls', gloss_en: 'neck' },
    ];
    const svc = new SupabaseSrsService(
      fakeClient(tables, { get_distractors: distractors }, new Date(1_900_000_000_000 + 1_000_000_000)),
      'u1',
    );

    const batch = await svc.getDueBatch();
    const item = batch.find((i) => i.id === 'w-a');
    expect(item?.choices).toBeDefined();
    const choices = item!.choices!;
    // 1 correct + 3 distractors, set-equality (order is shuffled, so don't assert positions).
    expect(choices).toHaveLength(4);
    expect(choices.filter((c) => c.correct)).toHaveLength(1);
    expect(choices.find((c) => c.correct)!.value).toBe('w-a');
    expect(new Set(choices.map((c) => c.value))).toEqual(new Set(['w-a', 'kabata', 'kazas', 'kakls']));
  });

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
});

// ---------------------------------------------------------------------------
// B2: New tests for the rewritten getDueBatch that sources candidates from
//     content tables (no review_state row needed to surface new items).
// ---------------------------------------------------------------------------

describe('SupabaseSrsService.getDueBatch — B2 candidate sourcing', () => {
  // A far-future "now" so no content rows are accidentally treated as due.
  // We use a fixed timestamp far enough in the past that due review_state rows are all due.
  const FAR_FUTURE = new Date('2099-01-01T00:00:00.000Z');

  it('surfaces never-introduced lemmas as new without a pre-engineered stage=new row', async () => {
    // No review_state rows at all — everything is brand new.
    const tables: Record<string, Row[]> = {
      review_state: [],
      lemmas: [
        contentRow('lemma-1', { utility_rank: 1, envelope: [0.5], native_url: 'l1.mp3', word_class: 'concrete' }),
        contentRow('lemma-2', { utility_rank: 2, envelope: [0.5], native_url: 'l2.mp3', word_class: 'concrete' }),
        contentRow('lemma-3', { utility_rank: 3, envelope: [0.5], native_url: 'l3.mp3', word_class: 'concrete' }),
      ],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [],
    };

    const svc = new SupabaseSrsService(fakeClient(tables, {}, FAR_FUTURE), 'u1');
    const batch = await svc.getDueBatch();

    // Should include new candidates (no review_state required)
    expect(batch.length).toBeGreaterThan(0);
    // All should be type 'word'
    expect(batch.every(i => i.type === 'word')).toBe(true);
  });

  it('due items are always present and uncapped (all due items appear regardless of new cap)', async () => {
    // Create many due review_state rows (more than STEADY_STATE_NEW_CAP=5)
    const dueStates: Row[] = Array.from({ length: 15 }, (_, k) => ({
      user_id: 'u1',
      item_type: 'lemma',
      item_id: `due-lemma-${k}`,
      template: 'recognition',
      stage: 'review',
      due_at: new Date(Date.now() - 1000 * (k + 1)).toISOString(), // all in the past
      stability: 10,
      difficulty: 5,
      reps: 3,
      lapses: 0,
      last_review: null,
    }));

    const lemmaRows: Row[] = Array.from({ length: 15 }, (_, k) => ({
      id: `due-lemma-${k}`,
      lemma: `due-lemma-${k}`,
      gloss_en: `gloss-${k}`,
      audio_url: `due-lemma-${k}.mp3`,
      native_url: `due-lemma-${k}.mp3`,
      envelope: [0.5],
      word_class: 'concrete',
      media: { imageUrl: `img-${k}.jpg` },
      utility_rank: k + 1,
    }));

    const tables: Record<string, Row[]> = {
      review_state: dueStates,
      lemmas: lemmaRows,
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [],
    };

    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');
    const batch = await svc.getDueBatch();

    // All 15 due items must appear (reviews are uncapped)
    expect(batch.length).toBeGreaterThanOrEqual(15);
    const ids = new Set(batch.map(i => i.id));
    for (let k = 0; k < 15; k++) {
      expect(ids.has(`due-lemma-${k}`)).toBe(true);
    }
  });

  it('new count respects DAY_ONE_NEW_CAP on day 1 (account age < 1 day)', async () => {
    // Day-1 account: profiles.created_at = just now. No review_state rows (fresh account).
    const now = new Date();
    const tables: Record<string, Row[]> = {
      review_state: [],
      // 30 candidate lemmas — more than DAY_ONE_NEW_CAP
      lemmas: Array.from({ length: 30 }, (_, k) => ({
        id: `new-lemma-${k}`,
        lemma: `word-${k}`,
        gloss_en: `gloss-${k}`,
        audio_url: `new-lemma-${k}.mp3`,
        native_url: `new-lemma-${k}.mp3`,
        envelope: [0.5],
        word_class: 'concrete',
        utility_rank: k + 1,
      })),
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [{ id: 'u1', user_id: 'u1', created_at: now.toISOString() }],
    };

    const svc = new SupabaseSrsService(fakeClient(tables, {}, now), 'u1');
    const batch = await svc.getDueBatch();

    // Must not exceed DAY_ONE_NEW_CAP new items (words are the only budgeted unit)
    expect(batch.length).toBeLessThanOrEqual(DAY_ONE_NEW_CAP);
    // Exact: with 30 gate-passing word candidates the function must fill the whole cap
    expect(batch.length).toBe(DAY_ONE_NEW_CAP);
  });

  it('audio-less + image-less WORD due items ARE re-surfaced (reviewable via the written word)', async () => {
    // One due item with no audio and no image, one with audio
    const dueStates: Row[] = [
      {
        user_id: 'u1',
        item_type: 'lemma',
        item_id: 'no-audio-lemma',
        template: 'recognition',
        stage: 'review',
        due_at: new Date(Date.now() - 5000).toISOString(),
        stability: 10,
        difficulty: 5,
        reps: 3,
        lapses: 0,
        last_review: null,
      },
      {
        user_id: 'u1',
        item_type: 'lemma',
        item_id: 'has-audio-lemma',
        template: 'recognition',
        stage: 'review',
        due_at: new Date(Date.now() - 4000).toISOString(),
        stability: 10,
        difficulty: 5,
        reps: 3,
        lapses: 0,
        last_review: null,
      },
    ];

    const lemmaRows: Row[] = [
      {
        id: 'no-audio-lemma',
        lemma: 'no-audio-lemma',
        gloss_en: 'no audio',
        native_url: null,
        slow_url: null,
        envelope: null,
        audio_url: null,
        media: null, // no image either
        word_class: 'concrete',
        utility_rank: 1,
      },
      {
        id: 'has-audio-lemma',
        lemma: 'has-audio-lemma',
        gloss_en: 'has audio',
        native_url: 'has-audio-lemma.mp3',
        slow_url: null,
        envelope: [0.5],
        audio_url: 'has-audio-lemma.mp3',
        media: null,
        word_class: 'concrete',
        utility_rank: 2,
      },
    ];

    const tables: Record<string, Row[]> = {
      review_state: dueStates,
      lemmas: lemmaRows,
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [],
    };

    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');
    const batch = await svc.getDueBatch();

    const ids = batch.map(i => i.id);
    // Both surface now: words/phrases are reviewable via their written form (the card shows the
    // word + a silent play orb until audio is backfilled). Only audio-less PAIRS are still dropped.
    expect(ids).toContain('no-audio-lemma');
    expect(ids).toContain('has-audio-lemma');
  });

  it('new items are ordered by utility_rank ascending', async () => {
    // 5 lemmas with descending utility_rank values — output must be ascending.
    const tables: Record<string, Row[]> = {
      review_state: [],
      lemmas: [
        contentRow('l-rank-5', { utility_rank: 5, envelope: [0.5], native_url: 'l5.mp3', word_class: 'concrete' }),
        contentRow('l-rank-1', { utility_rank: 1, envelope: [0.5], native_url: 'l1.mp3', word_class: 'concrete' }),
        contentRow('l-rank-3', { utility_rank: 3, envelope: [0.5], native_url: 'l3.mp3', word_class: 'concrete' }),
        contentRow('l-rank-2', { utility_rank: 2, envelope: [0.5], native_url: 'l2.mp3', word_class: 'concrete' }),
        contentRow('l-rank-4', { utility_rank: 4, envelope: [0.5], native_url: 'l4.mp3', word_class: 'concrete' }),
      ],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [{ id: 'u1', created_at: new Date().toISOString() }],
    };

    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');
    const batch = await svc.getDueBatch();

    // Batch is new items only; must be in utility_rank order
    const ranks = batch.map(i => i.id);
    // The first admitted item must be l-rank-1 (lowest utility_rank = highest utility)
    expect(ranks[0]).toBe('l-rank-1');
    // Overall order must be ascending by rank
    const expectedOrder = ['l-rank-1', 'l-rank-2', 'l-rank-3', 'l-rank-4', 'l-rank-5'];
    expect(ranks).toEqual(expectedOrder.slice(0, ranks.length));
  });

  // ---------------------------------------------------------------------------
  // Regression: accountAgeDays must query profiles by `id`, not `user_id`.
  // A user whose profiles.created_at is 3 days ago AND who has NO review_log rows
  // must be classified as a RETURNING user (steady-state new cap = 5), NOT day-1 (20).
  // This test FAILS against the old `.eq('user_id', ...)` code (profile not found →
  // falls through to empty review_log → age=0 → day-1 cap=20 → batch.length up to 20).
  // ---------------------------------------------------------------------------
  it('user with profiles.created_at 3 days ago + no review_log is classified as returning (steady-state cap=5)', async () => {
    // 3 days ago
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000).toISOString();

    // profiles row has `id` matching userId but NO `user_id` column — faithful to real schema.
    // Old code queried `.eq('user_id', userId)` → returned null → age=0 → DAY_ONE_NEW_CAP.
    // Fixed code queries `.eq('id', userId)` → returns this row → age=3 → STEADY_STATE_NEW_CAP(5).
    const tables: Record<string, Row[]> = {
      review_state: [],
      // 30 candidates so the cap is the binding constraint
      lemmas: Array.from({ length: 30 }, (_, k) => ({
        id: `cap-lemma-${k}`,
        lemma: `word-${k}`,
        gloss_en: `gloss-${k}`,
        audio_url: `cap-lemma-${k}.mp3`,
        native_url: `cap-lemma-${k}.mp3`,
        envelope: [0.5],
        word_class: 'concrete',
        utility_rank: k + 1,
      })),
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [], // no review history at all
      known_lemmas: [],
      // Faithful schema: `id` is the PK. No `user_id` column on this row.
      profiles: [{ id: 'u1', created_at: threeDaysAgo }],
    };

    const svc = new SupabaseSrsService(fakeClient(tables, {}, now), 'u1');
    const batch = await svc.getDueBatch();

    // With the fix: accountAgeDays = 3 (≥1) → STEADY_STATE_NEW_CAP = 5
    // Without the fix: profile not found (wrong column) → age=0 → DAY_ONE_NEW_CAP
    expect(batch.length).toBeLessThanOrEqual(5);
    expect(batch.length).toBeGreaterThan(0);
  });

  it('user who already introduced top-N lemmas still receives never-introduced lower-ranked lemmas', async () => {
    // Top 5 lemmas are already introduced (have review_state rows).
    // Lemma-6 through lemma-10 are never introduced — must surface as candidates.
    const introducedStates: Row[] = Array.from({ length: 5 }, (_, k) => ({
      user_id: 'u1',
      item_type: 'lemma',
      item_id: `lemma-${k + 1}`,
      template: 'recognition',
      stage: 'review',
      due_at: new Date('2099-01-01').toISOString(), // not yet due
      stability: 10,
      difficulty: 5,
      reps: 3,
      lapses: 0,
      last_review: null,
    }));

    const allLemmas: Row[] = Array.from({ length: 10 }, (_, k) => ({
      id: `lemma-${k + 1}`,
      lemma: `word-${k + 1}`,
      gloss_en: `gloss-${k + 1}`,
      audio_url: `lemma-${k + 1}.mp3`,
      native_url: `lemma-${k + 1}.mp3`,
      envelope: [0.5],
      word_class: 'concrete',
      utility_rank: k + 1,
    }));

    const tables: Record<string, Row[]> = {
      review_state: introducedStates,
      lemmas: allLemmas,
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [{ id: 'u1', created_at: new Date().toISOString() }],
    };

    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');
    const batch = await svc.getDueBatch();

    // Must include lemma-6 through lemma-10 (never introduced) not lemma-1 through lemma-5 (already introduced)
    const ids = batch.map(i => i.id);
    // None of the already-introduced lemmas should appear as new candidates
    for (let k = 1; k <= 5; k++) {
      expect(ids).not.toContain(`lemma-${k}`);
    }
    // At least some never-introduced lemmas must appear
    const hasNeverIntroduced = ids.some(id => ['lemma-6', 'lemma-7', 'lemma-8', 'lemma-9', 'lemma-10'].includes(id));
    expect(hasNeverIntroduced).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E2: submit() + RecordingUploader integration tests
// ---------------------------------------------------------------------------

import type { RecordingUploader } from './SupabaseRecordingUploader';
import type { CardResult } from '../../types/cardResult';
import type { CardKind } from '../../types/cardKind';

/** Minimal fake client for submit() — only the tables submit() touches. */
function makeSubmitClient(reviewLog: Row[] = []) {
  let _lastLogInsert: Row | null = null;

  const client = {
    from: (table: string) => {
      if (table === 'review_state') {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          upsert: async () => ({ error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
        };
        return b;
      }
      if (table === 'review_log') {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          insert: async (row: Row) => {
            _lastLogInsert = row;
            reviewLog.push(row);
            return { error: null };
          },
          then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
            resolve({ data: reviewLog, error: null }),
        };
        return b;
      }
      const noop: Record<string, unknown> = {
        select: () => noop,
        eq: () => noop,
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      };
      return noop;
    },
    _getLastLogInsert: () => _lastLogInsert,
  };
  return client;
}

function makeCardResult(overrides: Partial<CardResult> = {}): CardResult {
  return {
    itemId: 'item-e2',
    cardKind: 'word/hear' as CardKind,
    correct: true,
    ...overrides,
  };
}

describe('SupabaseSrsService.submit() — E2 recording_id linkage', () => {
  it('submit() with recording + stub uploader returning "rec-1" → review_log.insert gets recording_id:"rec-1"', async () => {
    const stubUploader: RecordingUploader = {
      upload: jest.fn().mockResolvedValue('rec-1'),
    };
    const client = makeSubmitClient();
    const svc = new SupabaseSrsService(client as never, 'u1', stubUploader);

    await svc.submit(makeCardResult({ recording: 'file:///take.m4a' }));

    const inserted = (client as { _getLastLogInsert: () => Row | null })._getLastLogInsert();
    expect(inserted).not.toBeNull();
    expect(inserted!.recording_id).toBe('rec-1');
    expect(stubUploader.upload).toHaveBeenCalledWith('file:///take.m4a');
  });

  it('submit() with recording but consent-false uploader (returns null) → recording_id:null in log', async () => {
    const stubUploader: RecordingUploader = {
      upload: jest.fn().mockResolvedValue(null),
    };
    const client = makeSubmitClient();
    const svc = new SupabaseSrsService(client as never, 'u1', stubUploader);

    await svc.submit(makeCardResult({ recording: 'file:///take.m4a' }));

    const inserted = (client as { _getLastLogInsert: () => Row | null })._getLastLogInsert();
    expect(inserted).not.toBeNull();
    expect(inserted!.recording_id).toBeNull();
  });

  it('submit() with no recording → uploader not called, recording_id:null in log', async () => {
    const stubUploader: RecordingUploader = {
      upload: jest.fn().mockResolvedValue('should-not-be-called'),
    };
    const client = makeSubmitClient();
    const svc = new SupabaseSrsService(client as never, 'u1', stubUploader);

    // No recording field in CardResult
    await svc.submit(makeCardResult({ recording: undefined }));

    expect(stubUploader.upload).not.toHaveBeenCalled();
    const inserted = (client as { _getLastLogInsert: () => Row | null })._getLastLogInsert();
    expect(inserted).not.toBeNull();
    expect(inserted!.recording_id).toBeNull();
  });

  it('submit() with no uploader (undefined) behaves as before — recording_id:null', async () => {
    const client = makeSubmitClient();
    const svc = new SupabaseSrsService(client as never, 'u1'); // no uploader

    await svc.submit(makeCardResult());

    const inserted = (client as { _getLastLogInsert: () => Row | null })._getLastLogInsert();
    expect(inserted).not.toBeNull();
    expect(inserted!.recording_id).toBeNull();
  });
});

// --- Drill seeding (perception drills have no candidate path; seed them so they can surface) ---
describe('SupabaseSrsService drill seeding', () => {
  const drillRow = (id: string): Row => ({
    id,
    a: 'lieta',
    b: 'lēta',
    correct: 'a',
    audio_url: `${id}.mp3`,
    envelope: [0.4, 0.8, 0.5],
    contrast_type: 'diphthong',
    qa_status: 'native_ok',
  });
  const emptyContent = () => ({
    lemmas: [] as Row[],
    phrases: [] as Row[],
    phrase_components: [] as Row[],
    review_log: [] as Row[],
    known_lemmas: [] as Row[],
    profiles: [] as Row[],
  });

  it('seeds a QA’d drill for a user with no pair rows, due one day out so it does not surface today', async () => {
    const now = new Date();
    const tables: Record<string, Row[]> = {
      review_state: [],
      minimal_pairs: [drillRow('drill-1')],
      // A word candidate so selectBatch admits something and the free-practice fallback (which
      // ignores due_at) doesn't fire — isolating the drill's own due_at from that fallback path.
      lemmas: [contentRow('word-a')],
      phrases: [] as Row[],
      phrase_components: [] as Row[],
      review_log: [] as Row[],
      known_lemmas: [] as Row[],
      profiles: [] as Row[],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, now), 'u1');

    const batch = await svc.getDueBatch();

    // A review_state pair row was created: stage='new' (first exposure) due one day out.
    const seeded = (tables.review_state ?? []).find((r) => r.item_type === 'pair' && r.item_id === 'drill-1');
    expect(seeded).toBeTruthy();
    expect(seeded!.stage).toBe('new');
    expect(seeded!.due_at).toBeTruthy();
    expect(new Date(seeded!.due_at as string).getTime()).toBeGreaterThan(now.getTime());
    // Day 0 is words, not drills — the seeded drill must NOT reach the learner yet.
    expect(batch.map((i) => i.id)).not.toContain('drill-1');
  });

  it('does not clobber a drill already in progress, and adds no duplicate', async () => {
    const inProgress: Row = {
      user_id: 'u1', item_type: 'pair', item_id: 'drill-1',
      template: 'recognition',
      stage: 'review', reps: 3, lapses: 0,
      stability: 6, difficulty: 5,
      due_at: new Date(Date.now() + 86_400_000).toISOString(), // due tomorrow — not yet due
      last_review: new Date(Date.now() - 86_400_000).toISOString(),
    };
    const tables: Record<string, Row[]> = {
      review_state: [{ ...inProgress }],
      minimal_pairs: [drillRow('drill-1')],
      ...emptyContent(),
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');

    await svc.getDueBatch();

    const pairRows = (tables.review_state ?? []).filter((r) => r.item_type === 'pair' && r.item_id === 'drill-1');
    expect(pairRows).toHaveLength(1); // no duplicate
    expect(pairRows[0]!.stage).toBe('review'); // FSRS progress untouched
    expect(pairRows[0]!.reps).toBe(3);
  });

  it('a pronunciation-only pair row does not block recognition drill seeding (regression)', async () => {
    // A 'pron' card grade can write a (pair, pronunciation) row (cardTemplate.ts) with no
    // matching (pair, recognition) row ever having been seeded. The "already seeded" gate must
    // be scoped to template='recognition', or this row makes ensureDrillsSeeded() think drills
    // were already seeded and the user never gets the L/Ļ / `ie` drills.
    const pronunciationOnly: Row = {
      user_id: 'u1', item_type: 'pair', item_id: 'other-pair',
      template: 'pronunciation',
      stage: 'review', reps: 1, lapses: 0,
      stability: 2, difficulty: 5,
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      last_review: new Date(Date.now() - 86_400_000).toISOString(),
    };
    const tables: Record<string, Row[]> = {
      review_state: [pronunciationOnly],
      minimal_pairs: [drillRow('drill-1')],
      ...emptyContent(),
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');

    await svc.getDueBatch();

    // The regression under test is the seeding GATE (scoped to template='recognition'), not the
    // due_at deferral — assert the recognition drill row now exists, due one day out per spec.
    const seeded = (tables.review_state ?? []).find(
      (r) => r.item_type === 'pair' && r.item_id === 'drill-1' && r.template === 'recognition',
    );
    expect(seeded).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Task 4: getDueBatch renders recognition schedule only (non-breaking).
// When the review_state table contains BOTH a 'recognition' and a 'pronunciation'
// row for the same item (both due), the batch must surface that item exactly ONCE
// via the recognition schedule. Pronunciation rows accumulate silently.
// ---------------------------------------------------------------------------

describe('SupabaseSrsService.getDueBatch — recognition-only filter (Task 4)', () => {
  it('renders only the recognition schedule when both templates are due (non-breaking)', async () => {
    const PAST = new Date(Date.now() - 5000).toISOString();
    const tables: Record<string, Row[]> = {
      review_state: [
        {
          user_id: 'u1',
          item_type: 'lemma',
          item_id: 'lemma-1',
          template: 'recognition',
          stage: 'review',
          reps: 4,
          lapses: 0,
          stability: 8,
          difficulty: 5,
          due_at: PAST,
          last_review: null,
        },
        {
          user_id: 'u1',
          item_type: 'lemma',
          item_id: 'lemma-1',
          template: 'pronunciation',
          stage: 'review',
          reps: 2,
          lapses: 0,
          stability: 4,
          difficulty: 5,
          due_at: PAST,
          last_review: null,
        },
      ],
      lemmas: [contentRow('lemma-1', { envelope: [0.5], native_url: 'l1.mp3', utility_rank: 1 })],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');
    const batch = await svc.getDueBatch();

    // Without the filter: both template rows produce two DueRefs → item appears twice. FAIL.
    // With the filter: only recognition row passes → item appears exactly once. PASS.
    expect(batch.filter((i) => i.id === 'lemma-1')).toHaveLength(1);
  });

  it('synthesises new-item rows with template recognition', async () => {
    // No review_state rows → item is a brand-new candidate.
    const tables: Record<string, Row[]> = {
      review_state: [],
      lemmas: [contentRow('lemma-new', { envelope: [0.5], native_url: 'ln.mp3', utility_rank: 1 })],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');
    const batch = await svc.getDueBatch();

    expect(batch).toHaveLength(1);
    expect(batch[0]!.id).toBe('lemma-new');
    expect(batch[0]!.stage).toBe('new');
  });

  // Regression: free-practice fallback must also apply a recognition-only filter.
  // A user who has accumulated pronunciation rows (normal after any word/say review) but has
  // nothing due and no new items admitted hits the fallback path. Without the filter the fallback
  // query returns BOTH recognition + pronunciation rows for the same lemma, and enrichAndReorder
  // renders it TWICE. With .eq('template','recognition') added, the fallback returns only the
  // recognition row and the item appears exactly once.
  it('free-practice fallback applies recognition-only filter — lemma with both templates surfaces once', async () => {
    // Both rows are due tomorrow (not yet due) so the primary due path skips them.
    // lemma-1 is already introduced (has review_state rows) so lemmaCandidates excludes it.
    // → selectBatch gets empty due + empty candidates → result.order.length === 0 → fallback fires.
    const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
    const tables: Record<string, Row[]> = {
      review_state: [
        {
          user_id: 'u1',
          item_type: 'lemma',
          item_id: 'lemma-1',
          template: 'recognition',
          stage: 'review',
          reps: 5,
          lapses: 0,
          stability: 12,
          difficulty: 5,
          due_at: FUTURE,
          last_review: null,
        },
        {
          user_id: 'u1',
          item_type: 'lemma',
          item_id: 'lemma-1',
          template: 'pronunciation',
          stage: 'review',
          reps: 2,
          lapses: 0,
          stability: 4,
          difficulty: 5,
          due_at: FUTURE,
          last_review: null,
        },
      ],
      lemmas: [contentRow('lemma-1', { envelope: [0.5], native_url: 'l1.mp3', utility_rank: 1 })],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, new Date()), 'u1');
    const batch = await svc.getDueBatch();

    // Without fix: fallback returns both rows → enrichAndReorder sees 2 orderedStates entries
    // → lemma-1 pushed twice → batch.filter(i => i.id === 'lemma-1').length === 2. FAIL.
    // With fix: .eq('template','recognition') on fallback query → only 1 row → length === 1. PASS.
    expect(batch.filter((i) => i.id === 'lemma-1')).toHaveLength(1);
  });
});
