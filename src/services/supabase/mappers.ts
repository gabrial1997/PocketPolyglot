// PURE mappers — no I/O. DB rows <-> contract shapes, plus the FSRS scheduling logic.
// Everything here is deterministic and unit-tested (mappers.test.ts); the service classes
// in this folder are thin I/O wrappers around these functions.

import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { ReviewItem } from '../../types/reviewItem';
import type { CardResult } from '../../types/cardResult';
import type {
  DbStage,
  LemmaRow,
  MinimalPairRow,
  PhraseRow,
  ReviewStateRow,
} from './types';

// ---------------------------------------------------------------------------
// Row -> ReviewItem
// ---------------------------------------------------------------------------

/** stage/reps come from review_state when present, else a fresh 'new'/0 default. */
function stageAndReps(reviewState?: Pick<ReviewStateRow, 'stage' | 'reps'>): {
  stage: ReviewItem['stage'];
  reps: number;
} {
  return {
    stage: reviewState?.stage ?? 'new',
    reps: reviewState?.reps ?? 0,
  };
}

/**
 * lemma row -> ReviewItem (type:'word').
 * choices are NOT stored on the lemma — distractors are fetched separately at runtime
 * (get_distractors), so `choices` is intentionally left undefined here.
 */
export function lemmaRowToReviewItem(
  row: LemmaRow,
  reviewState?: Pick<ReviewStateRow, 'stage' | 'reps'>,
): ReviewItem {
  const { stage, reps } = stageAndReps(reviewState);
  const item: ReviewItem = {
    id: row.id,
    type: 'word',
    stage,
    reps,
    target: row.lemma,
    gloss: row.gloss_en,
    audio: {
      nativeUrl: row.native_url ?? '',
      ...(row.slow_url ? { slowUrl: row.slow_url } : {}),
      ...(row.envelope ? { envelope: row.envelope } : {}),
    },
  };
  if (row.pron) item.pron = row.pron;
  item.wordClass = row.word_class;
  if (row.media) item.media = row.media;
  if (row.mnemonic) item.mnemonic = row.mnemonic;
  if (row.examples) item.examples = row.examples;
  return item;
}

/** phrase row -> ReviewItem (type:'phrase'). */
export function phraseRowToReviewItem(
  row: PhraseRow,
  reviewState?: Pick<ReviewStateRow, 'stage' | 'reps'>,
): ReviewItem {
  const { stage, reps } = stageAndReps(reviewState);
  return {
    id: row.id,
    type: 'phrase',
    stage,
    reps,
    target: row.target,
    gloss: row.gloss_en,
    audio: {
      nativeUrl: row.audio_url ?? '',
      ...(row.envelope ? { envelope: row.envelope } : {}),
    },
  };
}

/** minimal-pair row -> ReviewItem (type:'pair'). */
export function pairRowToReviewItem(
  row: MinimalPairRow,
  reviewState?: Pick<ReviewStateRow, 'stage' | 'reps'>,
): ReviewItem {
  const { stage, reps } = stageAndReps(reviewState);
  const item: ReviewItem = {
    id: row.id,
    type: 'pair',
    stage,
    reps,
    // A minimal pair has no single "target word"; we surface side `a` as the target and
    // leave the gloss empty (the drill UI reads from `pair`, not target/gloss).
    target: row.a,
    gloss: '',
    audio: {
      nativeUrl: row.audio_url,
      ...(row.envelope ? { envelope: row.envelope } : {}),
    },
    pair: {
      a: row.a,
      b: row.b,
      correct: row.correct,
      audioUrl: row.audio_url,
    },
  };
  // Diphthong drills carry a `glide` (e.g. ie = i→e); plain minimal pairs do not.
  if (row.glide) item.glide = row.glide;
  return item;
}

// ---------------------------------------------------------------------------
// CardResult -> FSRS Rating
// ---------------------------------------------------------------------------

/**
 * Collapse a CardResult into an FSRS Grade (Again | Good). We deliberately use only the
 * two-button model (no Hard/Easy) because cards report a binary outcome or a 2-way self
 * rating — there is no surface for 4-button grading.
 *
 * Rule (first match wins):
 *   1. correct === false           -> Again   (an explicit miss always demotes)
 *   2. selfRating === 'again'      -> Again
 *   3. selfRating === 'good'       -> Good
 *   4. correct === true            -> Good
 *   5. otherwise (learn/pron cards: no correctness, no self rating) -> Good
 *      (showing/practicing the card counts as a successful exposure)
 */
export function cardResultToRating(result: CardResult): Rating.Again | Rating.Good {
  if (result.correct === false) return Rating.Again;
  if (result.selfRating === 'again') return Rating.Again;
  if (result.selfRating === 'good') return Rating.Good;
  if (result.correct === true) return Rating.Good;
  return Rating.Good;
}

// ---------------------------------------------------------------------------
// FSRS scheduling
// ---------------------------------------------------------------------------

/** Once FSRS stability reaches this many days, we treat the card as 'mature'. */
export const MATURE_STABILITY_DAYS = 21;

const scheduler = fsrs();

/** Prior FSRS state pulled from a review_state row (all optional for a brand-new item). */
export interface PriorSchedule {
  stability?: number | null;
  difficulty?: number | null;
  due?: Date | null;
  reps: number;
  lapses?: number;
  stage: DbStage;
  last_review?: Date | null;
}

/** The next-schedule fields we persist back to review_state. */
export interface NextSchedule {
  stability: number;
  difficulty: number;
  due: Date;
  reps: number;
  lapses: number;
  stage: DbStage;
  last_review: Date;
}

/** Map an FSRS State -> our DbStage. 'mature' is a stability-threshold refinement of Review. */
function fsrsStateToStage(state: State, stability: number): DbStage {
  switch (state) {
    case State.New:
      return 'new';
    case State.Learning:
    case State.Relearning:
      return 'learning';
    case State.Review:
      return stability >= MATURE_STABILITY_DAYS ? 'mature' : 'review';
    default:
      return 'review';
  }
}

/** Reconstruct a partial DbStage back to an FSRS State for the prior card. */
function stageToFsrsState(stage: DbStage): State {
  switch (stage) {
    case 'new':
      return State.New;
    case 'learning':
      return State.Learning;
    case 'review':
    case 'mature':
      return State.Review;
    default:
      return State.New;
  }
}

/**
 * Advance the FSRS schedule. Rebuilds a ts-fsrs Card from the prior persisted fields, runs
 * `next(card, now, rating)`, and projects the result back onto our persisted shape.
 */
export function schedule(
  prev: PriorSchedule,
  rating: Rating.Again | Rating.Good,
  now: Date,
): NextSchedule {
  const base = createEmptyCard(now);
  const isFresh =
    prev.stage === 'new' &&
    (prev.stability === undefined || prev.stability === null);

  const card = isFresh
    ? base
    : {
        ...base,
        stability: prev.stability ?? base.stability,
        difficulty: prev.difficulty ?? base.difficulty,
        due: prev.due ?? base.due,
        reps: prev.reps,
        lapses: prev.lapses ?? 0,
        state: stageToFsrsState(prev.stage),
        last_review: prev.last_review ?? undefined,
      };

  const { card: next } = scheduler.next(card, now, rating);

  return {
    stability: next.stability,
    difficulty: next.difficulty,
    due: next.due,
    reps: next.reps,
    lapses: next.lapses,
    stage: fsrsStateToStage(next.state, next.stability),
    last_review: now,
  };
}

// ---------------------------------------------------------------------------
// Helpers shared by the service layer
// ---------------------------------------------------------------------------

/** Human-readable "next review" label from a due date relative to `now`. */
export function nextReviewLabel(due: Date, now: Date): string {
  const ms = due.getTime() - now.getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Next review later today';
  if (days === 1) return 'Next review in 1 day';
  return `Next review in ${days} days`;
}

/** Contract ReviewItem.type -> DB review_state.item_type. */
export function itemTypeToDbType(type: ReviewItem['type']): 'lemma' | 'phrase' | 'pair' {
  return type === 'word' ? 'lemma' : type;
}
