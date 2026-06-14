// Supabase-backed SRS service. All scheduling logic lives in ./mappers (pure, tested);
// this class is the I/O wrapper: it queries review_state + content rows, runs the mappers,
// and persists review_state + review_log.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SrsService } from '../index';
import type { ReviewItem } from '../../types/reviewItem';
import type { CardResult } from '../../types/cardResult';
import type {
  DbItemType,
  LemmaRow,
  MinimalPairRow,
  PhraseRow,
  ReviewStateRow,
} from './types';
import {
  cardResultToRating,
  lemmaRowToReviewItem,
  nextReviewLabel,
  pairRowToReviewItem,
  phraseRowToReviewItem,
  schedule,
  type PriorSchedule,
} from './mappers';

/** Derive the review_state.item_type from a CardKind string (e.g. 'word/say' -> 'lemma'). */
function cardKindToDbType(cardKind: string): DbItemType {
  if (cardKind.startsWith('word')) return 'lemma';
  if (cardKind.startsWith('phrase')) return 'phrase';
  if (cardKind.startsWith('drill') || cardKind.startsWith('pron')) return 'pair';
  // Fallback: treat unknown kinds as lemma so the row still schedules.
  return 'lemma';
}

export class SupabaseSrsService implements SrsService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getDueBatch(): Promise<ReviewItem[]> {
    const nowIso = new Date().toISOString();

    // Due if review_state.due_at <= now, OR the item is still 'new' (never scheduled yet).
    const { data: states, error } = await this.client
      .from('review_state')
      .select('*')
      .eq('user_id', this.userId)
      .or(`due_at.lte.${nowIso},stage.eq.new`);
    if (error) throw error;

    const rows: ReviewStateRow[] = states ?? [];
    if (rows.length === 0) return [];

    // Bucket the due item ids by content type, then fetch each content table in one round-trip.
    const byType: Record<DbItemType, string[]> = {
      lemma: [],
      phrase: [],
      pair: [],
      wordform: [],
    };
    const stateByKey = new Map<string, ReviewStateRow>();
    for (const s of rows) {
      byType[s.item_type]?.push(s.item_id);
      stateByKey.set(`${s.item_type}:${s.item_id}`, s);
    }

    const items: ReviewItem[] = [];

    if (byType.lemma.length > 0) {
      const { data, error: e } = await this.client
        .from('lemmas')
        .select('*')
        .in('id', byType.lemma);
      if (e) throw e;
      for (const row of (data ?? []) as LemmaRow[]) {
        items.push(lemmaRowToReviewItem(row, stateByKey.get(`lemma:${row.id}`)));
      }
    }

    if (byType.phrase.length > 0) {
      const { data, error: e } = await this.client
        .from('phrases')
        .select('*')
        .in('id', byType.phrase);
      if (e) throw e;
      for (const row of (data ?? []) as PhraseRow[]) {
        items.push(phraseRowToReviewItem(row, stateByKey.get(`phrase:${row.id}`)));
      }
    }

    if (byType.pair.length > 0) {
      const { data, error: e } = await this.client
        .from('minimal_pairs')
        .select('*')
        .in('id', byType.pair);
      if (e) throw e;
      for (const row of (data ?? []) as MinimalPairRow[]) {
        items.push(pairRowToReviewItem(row, stateByKey.get(`pair:${row.id}`)));
      }
    }

    return items;
  }

  async submit(result: CardResult): Promise<{ nextReviewLabel: string }> {
    const now = new Date();
    const itemType = cardKindToDbType(result.cardKind);
    const rating = cardResultToRating(result);

    // Load the prior schedule (may be absent for a brand-new item).
    const { data: prevRow, error: prevErr } = await this.client
      .from('review_state')
      .select('*')
      .eq('user_id', this.userId)
      .eq('item_type', itemType)
      .eq('item_id', result.itemId)
      .maybeSingle();
    if (prevErr) throw prevErr;

    const prevState = prevRow as ReviewStateRow | null;
    const prior: PriorSchedule = prevState
      ? {
          stability: prevState.stability,
          difficulty: prevState.difficulty,
          due: prevState.due_at ? new Date(prevState.due_at) : null,
          reps: prevState.reps,
          lapses: prevState.lapses,
          stage: prevState.stage,
          last_review: prevState.last_review ? new Date(prevState.last_review) : null,
        }
      : { reps: 0, stage: 'new' };

    const next = schedule(prior, rating, now);
    const label = nextReviewLabel(next.due, now);

    const { error: upsertErr } = await this.client.from('review_state').upsert(
      {
        user_id: this.userId,
        item_type: itemType,
        item_id: result.itemId,
        stage: next.stage,
        reps: next.reps,
        lapses: next.lapses,
        stability: next.stability,
        difficulty: next.difficulty,
        due_at: next.due.toISOString(),
        last_review: next.last_review.toISOString(),
      },
      { onConflict: 'user_id,item_type,item_id' },
    );
    if (upsertErr) throw upsertErr;

    const { error: logErr } = await this.client.from('review_log').insert({
      user_id: this.userId,
      item_type: itemType,
      item_id: result.itemId,
      card_kind: result.cardKind,
      correct: result.correct ?? null,
      spoke: result.spoke ?? null,
      self_rating: result.selfRating ?? null,
      latency_ms: result.latencyMs ?? null,
      interval_label: label,
    });
    if (logErr) throw logErr;

    return { nextReviewLabel: label };
  }

  async getDueSummary(): Promise<{ newCount: number; reviewCount: number }> {
    const nowIso = new Date().toISOString();

    const { count: newCount, error: newErr } = await this.client
      .from('review_state')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId)
      .eq('stage', 'new');
    if (newErr) throw newErr;

    // "Due" = scheduled (not new) with due_at in the past.
    const { count: reviewCount, error: dueErr } = await this.client
      .from('review_state')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId)
      .neq('stage', 'new')
      .lte('due_at', nowIso);
    if (dueErr) throw dueErr;

    return { newCount: newCount ?? 0, reviewCount: reviewCount ?? 0 };
  }
}
