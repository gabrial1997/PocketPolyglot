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
        const item = lemmaRowToReviewItem(row, stateByKey.get(`lemma:${row.id}`));
        // Word cards need controlled distractors (same word_class + nearby freq_band). The
        // get_distractors RPC returns full lemma rows; we mark the target correct and the
        // distractors incorrect. The card shuffles choice order itself. Resilient to a null
        // result (e.g. RPC error or no candidates) — the item stays valid with target-only
        // choices, and the cards tolerate missing choices (`item.choices ?? []`).
        try {
          const { data: distractors } = await this.client.rpc('get_distractors', {
            target: row.id,
            n: 3,
          });
          item.choices = [
            { value: item.target, gloss: item.gloss, correct: true },
            ...((distractors ?? []) as LemmaRow[]).map((d) => ({
              value: d.lemma,
              gloss: d.gloss_en,
              correct: false,
            })),
          ];
        } catch {
          // Leave choices undefined; the recognition/production cards degrade gracefully.
        }
        items.push(item);
      }
    }

    if (byType.phrase.length > 0) {
      const { data, error: e } = await this.client
        .from('phrases')
        .select('*')
        .in('id', byType.phrase);
      if (e) throw e;
      for (const row of (data ?? []) as PhraseRow[]) {
        const item = phraseRowToReviewItem(row, stateByKey.get(`phrase:${row.id}`));
        // Phrase cards need the component lemma ids for the i+1 unlock gate. Resilient to a
        // null result — the item stays valid (componentLemmaIds simply left undefined).
        const { data: components } = await this.client
          .from('phrase_components')
          .select('lemma_id')
          .eq('phrase_id', row.id);
        if (components) {
          item.componentLemmaIds = (components as { lemma_id: string }[]).map((c) => c.lemma_id);
        }
        items.push(item);
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
