import { Rating } from 'ts-fsrs';
import type { CardResult } from '../../types/cardResult';
import type { LemmaRow, MinimalPairRow, PhraseRow, ReviewStateRow } from './types';
import {
  cardResultToRating,
  itemTypeToDbType,
  lemmaRowToReviewItem,
  nextReviewLabel,
  pairRowToReviewItem,
  phraseRowToReviewItem,
  schedule,
  MATURE_STABILITY_DAYS,
} from './mappers';

// --- fixtures ---------------------------------------------------------------

function lemma(overrides: Partial<LemmaRow> = {}): LemmaRow {
  return {
    id: 'lemma-1',
    lemma: 'māja',
    gloss_en: 'house',
    pron: 'MAH-ya',
    pos: 'noun',
    word_class: 'concrete',
    freq_rank: 5,
    freq_count: 100,
    freq_band: 1,
    cefr: 'A1',
    native_url: 'https://cdn/native.mp3',
    slow_url: 'https://cdn/slow.mp3',
    media: { imageUrl: 'https://cdn/house.png', imageUrlDark: 'https://cdn/house-dark.png' },
    mnemonic: { soundsLike: 'maya', note: 'a house called maya' },
    examples: [{ pre: 'Es ', w: 'māja', post: ' liela', en: 'My house is big', audioUrl: 'https://cdn/ex.mp3' }],
    semantic_field: 'dwelling',
    phonetic_key: 'mja',
    qa_status: 'locked',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function phrase(overrides: Partial<PhraseRow> = {}): PhraseRow {
  return {
    id: 'phrase-1',
    target: 'Es dzeru kafiju',
    gloss_en: 'I drink coffee',
    audio_url: 'https://cdn/phrase.mp3',
    is_idiom: false,
    seed: null,
    qa_status: 'locked',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function pair(overrides: Partial<MinimalPairRow> = {}): MinimalPairRow {
  return {
    id: 'pair-1',
    a: 'kāpa',
    b: 'kapa',
    correct: 'a',
    audio_url: 'https://cdn/pair.mp3',
    contrast_type: 'vowel_length',
    qa_status: 'locked',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function reviewState(overrides: Partial<ReviewStateRow> = {}): ReviewStateRow {
  return {
    user_id: 'user-1',
    item_type: 'lemma',
    item_id: 'lemma-1',
    stage: 'review',
    reps: 3,
    lapses: 1,
    stability: 10,
    difficulty: 5,
    due_at: '2026-06-20T00:00:00Z',
    last_review: '2026-06-10T00:00:00Z',
    ...overrides,
  };
}

// --- lemmaRowToReviewItem ---------------------------------------------------

describe('lemmaRowToReviewItem', () => {
  it('maps every lemma field onto a word ReviewItem', () => {
    const item = lemmaRowToReviewItem(lemma());
    expect(item.id).toBe('lemma-1');
    expect(item.type).toBe('word');
    expect(item.target).toBe('māja');
    expect(item.gloss).toBe('house');
    expect(item.pron).toBe('MAH-ya');
    expect(item.wordClass).toBe('concrete');
    expect(item.audio).toEqual({
      nativeUrl: 'https://cdn/native.mp3',
      slowUrl: 'https://cdn/slow.mp3',
    });
    expect(item.media).toEqual({
      imageUrl: 'https://cdn/house.png',
      imageUrlDark: 'https://cdn/house-dark.png',
    });
    expect(item.mnemonic).toEqual({ soundsLike: 'maya', note: 'a house called maya' });
    expect(item.examples).toHaveLength(1);
  });

  it('defaults stage/reps to new/0 when no review state', () => {
    const item = lemmaRowToReviewItem(lemma());
    expect(item.stage).toBe('new');
    expect(item.reps).toBe(0);
  });

  it('takes stage/reps from review state when provided', () => {
    const item = lemmaRowToReviewItem(lemma(), reviewState({ stage: 'mature', reps: 7 }));
    expect(item.stage).toBe('mature');
    expect(item.reps).toBe(7);
  });

  it('leaves choices undefined (distractors are fetched separately)', () => {
    const item = lemmaRowToReviewItem(lemma());
    expect(item.choices).toBeUndefined();
  });

  it('omits slowUrl / pron / optional payloads when null', () => {
    const item = lemmaRowToReviewItem(
      lemma({ slow_url: null, pron: null, media: null, mnemonic: null, examples: null, native_url: null }),
    );
    expect(item.audio).toEqual({ nativeUrl: '' });
    expect(item.audio.slowUrl).toBeUndefined();
    expect(item.pron).toBeUndefined();
    expect(item.media).toBeUndefined();
    expect(item.mnemonic).toBeUndefined();
    expect(item.examples).toBeUndefined();
  });
});

// --- phraseRowToReviewItem --------------------------------------------------

describe('phraseRowToReviewItem', () => {
  it('maps phrase fields onto a phrase ReviewItem', () => {
    const item = phraseRowToReviewItem(phrase());
    expect(item.id).toBe('phrase-1');
    expect(item.type).toBe('phrase');
    expect(item.target).toBe('Es dzeru kafiju');
    expect(item.gloss).toBe('I drink coffee');
    expect(item.audio).toEqual({ nativeUrl: 'https://cdn/phrase.mp3' });
    expect(item.stage).toBe('new');
    expect(item.reps).toBe(0);
  });

  it('falls back to empty nativeUrl when audio_url is null', () => {
    expect(phraseRowToReviewItem(phrase({ audio_url: null })).audio.nativeUrl).toBe('');
  });

  it('honors review state stage/reps', () => {
    const item = phraseRowToReviewItem(
      phrase(),
      reviewState({ item_type: 'phrase', stage: 'learning', reps: 2 }),
    );
    expect(item.stage).toBe('learning');
    expect(item.reps).toBe(2);
  });
});

// --- pairRowToReviewItem ----------------------------------------------------

describe('pairRowToReviewItem', () => {
  it('maps minimal pair onto a pair ReviewItem with pair payload', () => {
    const item = pairRowToReviewItem(pair());
    expect(item.id).toBe('pair-1');
    expect(item.type).toBe('pair');
    expect(item.target).toBe('kāpa');
    expect(item.gloss).toBe('');
    expect(item.audio).toEqual({ nativeUrl: 'https://cdn/pair.mp3' });
    expect(item.pair).toEqual({
      a: 'kāpa',
      b: 'kapa',
      correct: 'a',
      audioUrl: 'https://cdn/pair.mp3',
    });
  });

  it('honors review state stage/reps', () => {
    const item = pairRowToReviewItem(pair(), reviewState({ item_type: 'pair', stage: 'review', reps: 4 }));
    expect(item.stage).toBe('review');
    expect(item.reps).toBe(4);
  });
});

// --- cardResultToRating -----------------------------------------------------

describe('cardResultToRating', () => {
  const base: CardResult = { itemId: 'x', cardKind: 'word/pic-review' };

  it('correct === false -> Again', () => {
    expect(cardResultToRating({ ...base, correct: false })).toBe(Rating.Again);
  });

  it('correct === true -> Good', () => {
    expect(cardResultToRating({ ...base, correct: true })).toBe(Rating.Good);
  });

  it("selfRating 'again' -> Again", () => {
    expect(cardResultToRating({ ...base, selfRating: 'again' })).toBe(Rating.Again);
  });

  it("selfRating 'good' -> Good", () => {
    expect(cardResultToRating({ ...base, selfRating: 'good' })).toBe(Rating.Good);
  });

  it('learn/pron card (no correctness, no self rating) -> Good', () => {
    expect(cardResultToRating({ itemId: 'x', cardKind: 'word/learn-concrete' })).toBe(Rating.Good);
    expect(cardResultToRating({ itemId: 'x', cardKind: 'pron', spoke: true })).toBe(Rating.Good);
  });

  it('correct === false beats selfRating good', () => {
    expect(cardResultToRating({ ...base, correct: false, selfRating: 'good' })).toBe(Rating.Again);
  });
});

// --- schedule ---------------------------------------------------------------

describe('schedule', () => {
  const now = new Date('2026-06-14T12:00:00Z');

  it('a new card rated Good advances out of new and sets a future due date', () => {
    const next = schedule({ reps: 0, stage: 'new' }, Rating.Good, now);
    expect(next.stage).not.toBe('new');
    expect(next.due.getTime()).toBeGreaterThan(now.getTime());
    expect(next.reps).toBe(1);
    expect(next.last_review.getTime()).toBe(now.getTime());
    expect(next.stability).toBeGreaterThan(0);
  });

  it('a new card rated Again stays in a low/learning stage', () => {
    const next = schedule({ reps: 0, stage: 'new' }, Rating.Again, now);
    expect(next.stage).toBe('learning');
    expect(next.due.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it('marks a card mature once stability crosses the threshold', () => {
    const next = schedule(
      {
        reps: 10,
        stage: 'review',
        stability: MATURE_STABILITY_DAYS + 50,
        difficulty: 4,
        due: new Date('2026-06-13T12:00:00Z'),
        last_review: new Date('2026-05-13T12:00:00Z'),
      },
      Rating.Good,
      now,
    );
    expect(next.stage).toBe('mature');
    expect(next.stability).toBeGreaterThanOrEqual(MATURE_STABILITY_DAYS);
  });

  it('Good produces a later due date than Again for the same prior', () => {
    const prior = { reps: 0, stage: 'new' as const };
    const good = schedule(prior, Rating.Good, now);
    const again = schedule(prior, Rating.Again, now);
    expect(good.due.getTime()).toBeGreaterThan(again.due.getTime());
  });
});

// --- helpers ----------------------------------------------------------------

describe('nextReviewLabel', () => {
  const now = new Date('2026-06-14T12:00:00Z');
  it('formats singular / plural / same-day', () => {
    expect(nextReviewLabel(new Date('2026-06-15T12:00:00Z'), now)).toBe('Next review in 1 day');
    expect(nextReviewLabel(new Date('2026-06-19T12:00:00Z'), now)).toBe('Next review in 5 days');
    expect(nextReviewLabel(new Date('2026-06-14T18:00:00Z'), now)).toBe('Next review later today');
  });
});

describe('itemTypeToDbType', () => {
  it('maps word -> lemma, passes phrase/pair through', () => {
    expect(itemTypeToDbType('word')).toBe('lemma');
    expect(itemTypeToDbType('phrase')).toBe('phrase');
    expect(itemTypeToDbType('pair')).toBe('pair');
  });
});
