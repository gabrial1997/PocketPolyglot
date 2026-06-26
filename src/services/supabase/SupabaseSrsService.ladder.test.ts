// Module C2: verify that getDueBatch enriches each ReviewItem with the correct
// receptiveReps / productiveReps / translationVisibility derived from review_log.
//
// This test uses the same fakeClient infrastructure as SupabaseSrsService.test.ts
// (copy-compatible) but is kept in a separate file per the C2 brief.
//
// Scenario coverage (per brief §9):
//   A. item with 3 receptive (non-production, correct=true) rows
//      → receptiveReps===3, translationVisibility==='hint'
//   B. item with word/say correct rows only
//      → those count toward productiveReps, not receptiveReps
//   C. item with no log rows → 0/0, translationVisibility==='auto'
//   D. incorrect rows (correct===false) don't count toward either axis
//   E. production kind but correct===false → NOT counted

import { SupabaseSrsService } from './SupabaseSrsService';

type Row = Record<string, unknown>;
type OrderBy = { col: string; ascending: boolean; nullsFirst: boolean };

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

function makeBuilder(table: string, tables: Record<string, Row[]>) {
  let rows: Row[] = [...(tables[table] ?? [])];
  const orderBys: OrderBy[] = [];
  let countMode = false;
  let orFilter: string | null = null;
  let eqFilters: Record<string, unknown> = {};
  let notFilters: Record<string, unknown> = {};
  let lteFilters: Record<string, unknown> = {};
  let gteFilters: Record<string, unknown> = {};
  let limitVal: number | null = null;
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;
  let inIds: string[] | null = null;
  let inCol: string | null = null;

  const applyFilters = (source: Row[]) => {
    let r = [...source];
    for (const [k, v] of Object.entries(eqFilters)) {
      r = r.filter(row => row[k] === v);
    }
    for (const [k, v] of Object.entries(notFilters)) {
      r = r.filter(row => row[k] !== v);
    }
    for (const [k, v] of Object.entries(lteFilters)) {
      r = r.filter(row => {
        const rv = row[k] as string | null | undefined;
        if (rv == null) return false;
        return rv <= (v as string);
      });
    }
    for (const [k, v] of Object.entries(gteFilters)) {
      r = r.filter(row => {
        const rv = row[k] as string | null | undefined;
        if (rv == null) return false;
        return rv >= (v as string);
      });
    }
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
    if (inIds !== null && inCol !== null) {
      const col = inCol;
      r = r.filter(row => (inIds as string[]).includes(row[col] as string));
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
    in: (col: string, ids: string[]) => {
      inCol = col;
      inIds = ids;
      rows = (tables[table] ?? []).filter((r) => ids.includes(r[col] as string));
      const inResolved = () => ({ data: applyOrder(applyFilters(rows), orderBys), error: null, count: null });
      const inBuilder: Record<string, unknown> = {
        ...builder,
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve(inResolved()),
        maybeSingle: async () => ({ data: applyOrder(applyFilters(rows), orderBys)[0] ?? null, error: null }),
      };
      return inBuilder;
    },
    maybeSingle: async () => {
      const filtered = applyFilters(tables[table] ?? []);
      const sorted = applyOrder(filtered, orderBys);
      return { data: sorted[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[] | null; error: null; count: number | null }) => unknown) =>
      resolve(resolved()),
  };

  void rows;
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
      void args;
      return { data: [], error: null };
    },
    _now: now,
  } as never;
}

// --- helpers ---

function stateRow(item_type: string, item_id: string): Row {
  return {
    user_id: 'u1',
    item_type,
    item_id,
    template: 'recognition',
    stage: 'review',
    due_at: new Date(Date.now() - 5000).toISOString(), // always due
    stability: 10,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    last_review: null,
  };
}

function lemmaContent(id: string): Row {
  return {
    id,
    lemma: id,
    gloss_en: `gloss-${id}`,
    native_url: `${id}.mp3`,
    slow_url: null,
    envelope: [0.5],
    word_class: 'concrete',
    utility_rank: 1,
    media: null,
    mnemonic: null,
    examples: null,
    pron: null,
    literal_gloss: null,
    usage_note: null,
    qa_status: 'native_ok',
  };
}

/** review_log row factory */
function logRow(item_type: string, item_id: string, card_kind: string, correct: boolean | null): Row {
  return {
    user_id: 'u1',
    item_type,
    item_id,
    card_kind,
    correct,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// C2 ladder tests
// ---------------------------------------------------------------------------

describe('SupabaseSrsService.getDueBatch — C2 ladder reps from review_log', () => {
  const NOW = new Date();

  it('A: 3 receptive (non-production, correct=true) rows → receptiveReps===3, translationVisibility===hint', async () => {
    const tables: Record<string, Row[]> = {
      review_state: [stateRow('lemma', 'word-a')],
      lemmas: [lemmaContent('word-a')],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [
        logRow('lemma', 'word-a', 'word/hear', true),
        logRow('lemma', 'word-a', 'word/hear', true),
        logRow('lemma', 'word-a', 'word/pic-review', true),
      ],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, NOW), 'u1');
    const batch = await svc.getDueBatch();
    const item = batch.find(i => i.id === 'word-a');
    expect(item).toBeDefined();
    expect(item!.receptiveReps).toBe(3);
    expect(item!.productiveReps).toBe(0);
    expect(item!.translationVisibility).toBe('hint');
  });

  it('B: word/say correct rows count toward productiveReps, NOT receptiveReps', async () => {
    const tables: Record<string, Row[]> = {
      review_state: [stateRow('lemma', 'word-b')],
      lemmas: [lemmaContent('word-b')],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [
        logRow('lemma', 'word-b', 'word/say', true),
        logRow('lemma', 'word-b', 'word/say', true),
      ],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, NOW), 'u1');
    const batch = await svc.getDueBatch();
    const item = batch.find(i => i.id === 'word-b');
    expect(item).toBeDefined();
    expect(item!.productiveReps).toBe(2);
    expect(item!.receptiveReps).toBe(0);
  });

  it('C: item with no log rows → receptiveReps===0, productiveReps===0, translationVisibility===auto', async () => {
    const tables: Record<string, Row[]> = {
      review_state: [stateRow('lemma', 'word-c')],
      lemmas: [lemmaContent('word-c')],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [], // no rows at all
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, NOW), 'u1');
    const batch = await svc.getDueBatch();
    const item = batch.find(i => i.id === 'word-c');
    expect(item).toBeDefined();
    expect(item!.receptiveReps).toBe(0);
    expect(item!.productiveReps).toBe(0);
    expect(item!.translationVisibility).toBe('auto');
  });

  it('D: correct===false rows are not counted toward either axis', async () => {
    const tables: Record<string, Row[]> = {
      review_state: [stateRow('lemma', 'word-d')],
      lemmas: [lemmaContent('word-d')],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [
        logRow('lemma', 'word-d', 'word/hear', false),
        logRow('lemma', 'word-d', 'word/say', false),
        logRow('lemma', 'word-d', 'word/hear', null), // null correct also excluded
      ],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, NOW), 'u1');
    const batch = await svc.getDueBatch();
    const item = batch.find(i => i.id === 'word-d');
    expect(item).toBeDefined();
    expect(item!.receptiveReps).toBe(0);
    expect(item!.productiveReps).toBe(0);
    expect(item!.translationVisibility).toBe('auto');
  });

  it('phrase/sayit correct rows count toward productiveReps', async () => {
    const tables: Record<string, Row[]> = {
      review_state: [stateRow('phrase', 'ph-e')],
      lemmas: [],
      phrases: [{ id: 'ph-e', target: 'Es dzeru kafiju.', gloss_en: 'I drink coffee.', audio_url: 'ph.mp3', envelope: [0.5], is_idiom: false, seed: null, qa_status: 'native_ok', literal_gloss: null, usage_note: null, created_at: new Date().toISOString() }],
      phrase_components: [],
      minimal_pairs: [],
      review_log: [
        logRow('phrase', 'ph-e', 'phrase/sayit', true),
        logRow('phrase', 'ph-e', 'phrase/sayit', true),
        logRow('phrase', 'ph-e', 'phrase/hear', true),
      ],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, NOW), 'u1');
    const batch = await svc.getDueBatch();
    const item = batch.find(i => i.id === 'ph-e');
    expect(item).toBeDefined();
    expect(item!.productiveReps).toBe(2);
    expect(item!.receptiveReps).toBe(1);
  });

  it('pron correct rows count toward productiveReps', async () => {
    const tables: Record<string, Row[]> = {
      review_state: [stateRow('pair', 'pair-f')],
      lemmas: [],
      phrases: [],
      phrase_components: [],
      minimal_pairs: [{ id: 'pair-f', a: 'kāpa', b: 'kapa', correct: 'a', audio_url: 'p.mp3', a_audio_url: null, b_audio_url: null, glide_audio_url: null, envelope: [0.5], contrast_type: 'vowel_length', glide: null, qa_status: 'native_ok', created_at: new Date().toISOString() }],
      review_log: [
        logRow('pair', 'pair-f', 'pron', true),
        logRow('pair', 'pair-f', 'pron', true),
      ],
      known_lemmas: [],
      profiles: [],
    };
    const svc = new SupabaseSrsService(fakeClient(tables, {}, NOW), 'u1');
    const batch = await svc.getDueBatch();
    const item = batch.find(i => i.id === 'pair-f');
    expect(item).toBeDefined();
    expect(item!.productiveReps).toBe(2);
    expect(item!.receptiveReps).toBe(0);
  });
});
