// loadEarnedLemmaIds: shared query + computeEarned wiring for the earned-phrase gate.
// The fake client below honours the exact chain the loader issues (select→eq→eq→in→order→range)
// and applies real eq/in filtering + sort/paging, so pagination past the CHUNK size is exercised
// for real (not just trusted).
import { loadEarnedLemmaIds } from './earnedLoader';

type Row = Record<string, unknown>;

function makeClient(rows: Row[]) {
  return {
    from: (_table: string) => {
      let eqFilters: Record<string, unknown> = {};
      let inCol: string | null = null;
      let inVals: unknown[] = [];
      let orderCol: string | null = null;
      const builder = {
        select: (_cols: string) => builder,
        eq: (col: string, val: unknown) => {
          eqFilters = { ...eqFilters, [col]: val };
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          inCol = col;
          inVals = vals;
          return builder;
        },
        order: (col: string, _opts?: unknown) => {
          orderCol = col;
          return builder;
        },
        range: async (from: number, to: number) => {
          let filtered = rows.filter((r) =>
            Object.entries(eqFilters).every(([k, v]) => r[k] === v),
          );
          if (inCol) {
            const col = inCol;
            filtered = filtered.filter((r) => inVals.includes(r[col]));
          }
          if (orderCol) {
            const col = orderCol;
            filtered = [...filtered].sort((a, b) => {
              const av = a[col] as string;
              const bv = b[col] as string;
              return av < bv ? -1 : av > bv ? 1 : 0;
            });
          }
          return { data: filtered.slice(from, to + 1), error: null };
        },
      };
      return builder;
    },
  } as never;
}

function row(
  id: string,
  item_id: string,
  card_kind: string,
  correct: boolean | null,
  session_id: string | null,
  created_at: string,
): Row {
  return { id, user_id: 'u1', item_id, item_type: 'lemma', card_kind, correct, session_id, created_at };
}

describe('loadEarnedLemmaIds', () => {
  it('returns only lemmas earned in a different round (session)', async () => {
    const rows: Row[] = [
      // l1: intro in s1, correct word/hear in s2 (different session) — earned.
      row('r1', 'l1', 'word/learn-concrete', null, 's1', '2026-07-01T00:00:00.000Z'),
      row('r2', 'l1', 'word/hear', true, 's2', '2026-07-01T00:05:00.000Z'),
      // l2: intro + correct both in s1 (same session) — NOT earned.
      row('r3', 'l2', 'word/learn-concrete', null, 's1', '2026-07-01T00:00:00.000Z'),
      row('r4', 'l2', 'word/hear', true, 's1', '2026-07-01T00:01:00.000Z'),
    ];
    const client = makeClient(rows);

    const earned = await loadEarnedLemmaIds(client, 'u1');

    expect(earned).toEqual(new Set(['l1']));
  });

  it('pages past the CHUNK size: an earned lemma on page 2 still surfaces', async () => {
    // 1000 filler rows (id log-0000..log-0999, sort first) that never contribute an earned
    // lemma, plus 2 rows (id log-1000/log-1001, sort after) that only an un-paginated read
    // would miss.
    const fillers: Row[] = Array.from({ length: 1000 }, (_, k) =>
      row(
        `log-${String(k).padStart(4, '0')}`,
        `filler-${k}`,
        'word/hear',
        false,
        null,
        '2026-07-01T00:00:00.000Z',
      ),
    );
    const page2: Row[] = [
      row('log-1000', 'l-page2', 'word/learn-concrete', null, 's1', '2026-07-01T00:00:00.000Z'),
      row('log-1001', 'l-page2', 'word/hear', true, 's2', '2026-07-01T00:05:00.000Z'),
    ];
    const client = makeClient([...fillers, ...page2]);

    const earned = await loadEarnedLemmaIds(client, 'u1');

    expect(earned.has('l-page2')).toBe(true);
  });
});
