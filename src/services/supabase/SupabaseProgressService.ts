// Supabase-backed ProgressService (spec 2026-07-06). Coverage is framed against the FIXED
// core-word corpus (lemmas with a freq_rank — 1,000 in v1), NOT the QA-approved subset the old
// user_coverage view counted (18 rows while content QA is in flight → a nonsense denominator).
// Client-side join over existing RLS-safe sources; no migration:
//   known_lemmas (security_invoker view — the user's own known lemma ids)
//   × lemmas.freq_rank (content table) → the known ranks the screen renders.
// A known lemma WITHOUT a rank (off-list content) doesn't count toward "of the 1,000".
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgressService, ProgressCoverage } from '../index';

/** REST page-size ceiling for the corpus fetch. The API caps a page at 1,000 rows — exactly the
 *  corpus size by design. If the corpus ever grows past that, replace this client-side join with
 *  a server-side user_rank_coverage view. */
const CORPUS_RANGE_END = 1499;

export class SupabaseProgressService implements ProgressService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getCoverage(): Promise<ProgressCoverage> {
    const [knownRes, corpusRes] = await Promise.all([
      this.client.from('known_lemmas').select('lemma_id').eq('user_id', this.userId),
      this.client
        .from('lemmas')
        .select('id, freq_rank')
        .not('freq_rank', 'is', null)
        .range(0, CORPUS_RANGE_END),
    ]);
    if (knownRes.error) throw knownRes.error;
    if (corpusRes.error) throw corpusRes.error;

    const corpus = (corpusRes.data ?? []) as { id: string; freq_rank: number }[];
    const known = (knownRes.data ?? []) as { lemma_id: string }[];

    const rankById = new Map(corpus.map((row) => [row.id, row.freq_rank]));
    const knownRanks = known
      .map((row) => rankById.get(row.lemma_id))
      .filter((rank): rank is number => typeof rank === 'number')
      .sort((a, b) => a - b);

    return { total: rankById.size, knownRanks };
  }
}
