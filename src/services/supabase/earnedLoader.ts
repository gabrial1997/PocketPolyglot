// Shared loader for the earned-lemma set (spec 2026-07-23). Used by BOTH
// SupabaseKnownWordsStore (the controller's gate) and SupabaseSrsService
// (selectBatch ctx) so the two gates can never diverge.
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeEarned, type EarnedLogRow } from '../../session/earned';

const CHUNK = 1000; // page: review_log grows forever (see recalledLemmaIds's cap note)

export async function loadEarnedLemmaIds(
  client: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const rows: EarnedLogRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from('review_log')
      .select('item_id,card_kind,correct,session_id,created_at')
      .eq('user_id', userId)
      .eq('item_type', 'lemma')
      .in('card_kind', ['word/hear', 'word/recall', 'word/learn-concrete', 'word/learn-abstract', 'word/learn-function'])
      .order('id', { ascending: true })
      .range(offset, offset + CHUNK - 1);
    if (error) throw error;
    const page = (data ?? []) as EarnedLogRow[];
    rows.push(...page);
    if (page.length < CHUNK) return computeEarned(rows);
    offset += CHUNK;
  }
}
