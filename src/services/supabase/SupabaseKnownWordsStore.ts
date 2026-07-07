// Supabase-backed KnownWordsStore. Loads the user's known lemma ids from the known_lemmas
// view into an in-memory Set; has()/all() are synchronous reads of that snapshot.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnownWordsStore } from '../index';
import type { KnownLemmaRow } from './types';

export class SupabaseKnownWordsStore implements KnownWordsStore {
  private ids = new Set<string>();
  // Monotonic token guarding concurrent refresh() calls (same `gen` pattern as
  // ExpoAudioService): without it the LAST query to RESOLVE wins, so a slow, stale response
  // could overwrite the result of a refresh started after it.
  private gen = 0;

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  has(lemmaId: string): boolean {
    return this.ids.has(lemmaId);
  }

  all(): ReadonlySet<string> {
    return this.ids;
  }

  async refresh(): Promise<void> {
    const myGen = ++this.gen;
    const { data, error } = await this.client
      .from('known_lemmas')
      .select('lemma_id')
      .eq('user_id', this.userId);
    if (error) throw error;
    if (myGen !== this.gen) return; // a newer refresh superseded this response — drop it

    const next = new Set<string>();
    for (const row of (data ?? []) as Pick<KnownLemmaRow, 'lemma_id'>[]) {
      next.add(row.lemma_id);
    }
    this.ids = next;
  }
}
