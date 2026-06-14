// Supabase-backed ProgressService. Reads the user_coverage view (one row per user; absent
// until the user has any known lemmas).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgressService } from '../index';
import type { UserCoverageRow } from './types';

/** Fallback when the user has no coverage row yet: 0 known of the ~1,000 core words. */
const DEFAULT_COVERAGE = { known: 0, total: 1000 } as const;

export class SupabaseProgressService implements ProgressService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getCoverage(): Promise<{ known: number; total: number }> {
    const { data, error } = await this.client
      .from('user_coverage')
      .select('known_count, total_count')
      .eq('user_id', this.userId)
      .maybeSingle();
    if (error) throw error;

    const row = data as Pick<UserCoverageRow, 'known_count' | 'total_count'> | null;
    if (!row) return { ...DEFAULT_COVERAGE };

    return {
      known: row.known_count,
      total: row.total_count ?? DEFAULT_COVERAGE.total,
    };
  }
}
