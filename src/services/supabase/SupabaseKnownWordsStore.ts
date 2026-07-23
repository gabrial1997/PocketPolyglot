// Supabase-backed KnownWordsStore. Despite the name, this now holds the EARNED lemma set (the
// phrase gate, spec 2026-07-23) — a lemma the user correctly recognized in a DIFFERENT round
// (session) or later day than its intro — loaded via the shared loadEarnedLemmaIds(), NOT the
// known_lemmas view. has()/all() are synchronous reads of the last refresh() snapshot.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnownWordsStore } from '../index';
import { loadEarnedLemmaIds } from './earnedLoader';

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
    const next = await loadEarnedLemmaIds(this.client, this.userId);
    if (myGen !== this.gen) return; // a newer refresh superseded this response — drop it
    this.ids = next;
  }
}
