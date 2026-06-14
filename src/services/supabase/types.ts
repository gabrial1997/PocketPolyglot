// Hand-written row types for the Supabase tables/views the services read & write.
//
// These mirror supabase/migrations/0001_init.sql. The schema is NOT yet applied to any
// live project, so we cannot `supabase gen types` — these are maintained by hand and must
// be kept in sync with 0001_init.sql when columns change. Only the columns the services
// actually touch are typed below (plus enough context to be self-documenting).

import type { ReviewExample, ReviewMnemonic } from '../../types/reviewItem';

/** review_state.item_type / review_log.item_type. NB: DB 'lemma' <-> contract type 'word'. */
export type DbItemType = 'lemma' | 'phrase' | 'pair' | 'wordform';

/** review_state.stage — same union as ReviewItem.stage. */
export type DbStage = 'new' | 'learning' | 'review' | 'mature';

/** public.lemmas — the vocabulary unit. Maps to ReviewItem (type:'word'). */
export interface LemmaRow {
  id: string;
  lemma: string;
  gloss_en: string;
  pron: string | null;
  pos: string | null;
  word_class: 'concrete' | 'abstract' | 'function';
  freq_rank: number | null;
  freq_count: number | null;
  freq_band: number | null;
  cefr: string | null;
  native_url: string | null;
  slow_url: string | null;
  media: { imageUrl?: string; imageUrlDark?: string } | null;
  mnemonic: ReviewMnemonic | null;
  examples: ReviewExample[] | null;
  semantic_field: string | null;
  phonetic_key: string | null;
  qa_status: 'draft' | 'native_ok' | 'locked';
  created_at: string;
  updated_at: string;
}

/** public.phrases — multi-word units. Maps to ReviewItem (type:'phrase'). */
export interface PhraseRow {
  id: string;
  target: string;
  gloss_en: string;
  audio_url: string | null;
  is_idiom: boolean;
  seed: string | null;
  qa_status: 'draft' | 'native_ok' | 'locked';
  created_at: string;
}

/** public.minimal_pairs — perception drills. Maps to ReviewItem (type:'pair'). */
export interface MinimalPairRow {
  id: string;
  a: string;
  b: string;
  correct: 'a' | 'b';
  audio_url: string;
  contrast_type: string;
  qa_status: 'draft' | 'native_ok' | 'locked';
  created_at: string;
}

/** public.review_state — FSRS schedule, one row per user per learnable item. */
export interface ReviewStateRow {
  user_id: string;
  item_type: DbItemType;
  item_id: string;
  stage: DbStage;
  reps: number;
  lapses: number;
  stability: number | null;
  difficulty: number | null;
  due_at: string | null;
  last_review: string | null;
}

/** Upsert payload for public.review_state (same columns as the row). */
export type ReviewStateUpsert = ReviewStateRow;

/** Insert payload for public.review_log (append-only history, one row per CardResult). */
export interface ReviewLogInsert {
  user_id: string;
  item_type: DbItemType;
  item_id: string;
  card_kind: string;
  correct: boolean | null;
  spoke: boolean | null;
  self_rating: 'good' | 'again' | null;
  latency_ms: number | null;
  recording_id?: string | null;
  interval_label: string | null;
}

/** public.podcast_episodes — Tier-B listening. */
export interface PodcastEpisodeRow {
  id: string;
  title: string;
  audio_url: string;
  transcript: string | null;
  level_band: number | null;
  lemma_ids: string[] | null;
  created_at: string;
}

/** public.user_coverage view — progress screen. One row per user (absent if no known lemmas). */
export interface UserCoverageRow {
  user_id: string;
  known_count: number;
  total_count: number;
}

/** public.known_lemmas view — the phrase-unlock gate. */
export interface KnownLemmaRow {
  user_id: string;
  lemma_id: string;
}
