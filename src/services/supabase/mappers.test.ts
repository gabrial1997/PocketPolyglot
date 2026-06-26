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
  projectReviewLabels,
  rowToPrior,
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
    utility_rank: null,
    cefr: 'A1',
    native_url: 'https://cdn/native.mp3',
    slow_url: 'https://cdn/slow.mp3',
    envelope: null,
    media: { imageUrl: 'https://cdn/house.png', imageUrlDark: 'https://cdn/house-dark.png' },
    mnemonic: { soundsLike: 'maya', note: 'a house called maya' },
    examples: [{ pre: 'Es ', w: 'māja', post: ' liela', en: 'My house is big', audioUrl: 'https://cdn/ex.mp3' }],
    semantic_field: 'dwelling',
    phonetic_key: 'mja',
    qa_status: 'locked',
    literal_gloss: null,
    usage_note: null,
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
    envelope: null,
    is_idiom: false,
    seed: null,
    qa_status: 'locked',
    literal_gloss: null,
    usage_note: null,
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
    a_audio_url: 'https://cdn/pair-a.mp3',
    b_audio_url: 'https://cdn/pair-b.mp3',
    glide_audio_url: null,
    envelope: null,
    contrast_type: 'vowel_length',
    glide: null,
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
    template: 'recognition',
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

  it('defaults C2 rung fields to 0/0/auto (overwritten by getDueBatch)', () => {
    const item = lemmaRowToReviewItem(lemma());
    expect(item.receptiveReps).toBe(0);
    expect(item.productiveReps).toBe(0);
    expect(item.translationVisibility).toBe('auto');
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

  it('maps the RMS envelope onto audio.envelope when present', () => {
    const item = lemmaRowToReviewItem(lemma({ envelope: [0.1, 0.5, 0.9] }));
    expect(item.audio?.envelope).toEqual([0.1, 0.5, 0.9]);
  });

  it('leaves audio.envelope undefined when the row has none', () => {
    expect(lemmaRowToReviewItem(lemma({ envelope: null })).audio?.envelope).toBeUndefined();
  });

  it('omits audio entirely when no url/envelope', () => {
    const item = lemmaRowToReviewItem(
      lemma({ native_url: null, slow_url: null, envelope: null }),
    );
    expect(item.audio).toBeUndefined();
  });

  it('includes audio with only present fields', () => {
    const item = lemmaRowToReviewItem(
      lemma({ native_url: 'n.mp3', slow_url: null, envelope: [0.5, 1] }),
    );
    expect(item.audio).toEqual({ nativeUrl: 'n.mp3', envelope: [0.5, 1] });
  });

  it('omits slowUrl / pron / optional payloads when null', () => {
    const item = lemmaRowToReviewItem(
      lemma({ slow_url: null, pron: null, media: null, mnemonic: null, examples: null, native_url: null }),
    );
    expect(item.audio).toBeUndefined();
    expect(item.pron).toBeUndefined();
    expect(item.media).toBeUndefined();
    expect(item.mnemonic).toBeUndefined();
    expect(item.examples).toBeUndefined();
  });

  it('maps literal_gloss + usage_note onto literal + usageNote', () => {
    const item = lemmaRowToReviewItem(lemma({ literal_gloss: 'like / as', usage_note: 'used as "how"' }));
    expect(item.literal).toBe('like / as');
    expect(item.usageNote).toBe('used as "how"');
  });

  it('leaves literal + usageNote undefined when the columns are null', () => {
    const item = lemmaRowToReviewItem(lemma({ literal_gloss: null, usage_note: null }));
    expect(item.literal).toBeUndefined();
    expect(item.usageNote).toBeUndefined();
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

  it('omits audio when no audio_url/envelope', () => {
    expect(phraseRowToReviewItem(phrase({ audio_url: null, envelope: null })).audio).toBeUndefined();
  });

  it('maps the RMS envelope onto audio.envelope when present, undefined when absent', () => {
    expect(phraseRowToReviewItem(phrase({ envelope: [0.1, 0.5, 0.9] })).audio?.envelope).toEqual([
      0.1, 0.5, 0.9,
    ]);
    expect(phraseRowToReviewItem(phrase({ envelope: null })).audio?.envelope).toBeUndefined();
  });

  it('honors review state stage/reps', () => {
    const item = phraseRowToReviewItem(
      phrase(),
      reviewState({ item_type: 'phrase', stage: 'learning', reps: 2 }),
    );
    expect(item.stage).toBe('learning');
    expect(item.reps).toBe(2);
  });

  it('defaults C2 rung fields to 0/0/auto', () => {
    const item = phraseRowToReviewItem(phrase());
    expect(item.receptiveReps).toBe(0);
    expect(item.productiveReps).toBe(0);
    expect(item.translationVisibility).toBe('auto');
  });

  it('maps is_idiom onto isIdiom', () => {
    expect(phraseRowToReviewItem(phrase({ is_idiom: true })).isIdiom).toBe(true);
    expect(phraseRowToReviewItem(phrase({ is_idiom: false })).isIdiom).toBe(false);
  });

  it('maps literal_gloss + usage_note onto literal + usageNote', () => {
    const item = phraseRowToReviewItem(phrase({ literal_gloss: 'how to-you goes?', usage_note: 'everyday greeting' }));
    expect(item.literal).toBe('how to-you goes?');
    expect(item.usageNote).toBe('everyday greeting');
  });

  it('leaves literal + usageNote undefined when the columns are null', () => {
    const item = phraseRowToReviewItem(phrase({ literal_gloss: null, usage_note: null }));
    expect(item.literal).toBeUndefined();
    expect(item.usageNote).toBeUndefined();
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
      aAudioUrl: 'https://cdn/pair-a.mp3',
      bAudioUrl: 'https://cdn/pair-b.mp3',
    });
  });

  it('target is the stimulus word (side b) when correct is b — see == hear', () => {
    const item = pairRowToReviewItem(pair({ a: 'lācis', b: 'ļoti', correct: 'b' }));
    expect(item.target).toBe('ļoti');
  });

  it('target is side a when correct is a', () => {
    const item = pairRowToReviewItem(pair({ a: 'lieta', b: 'lēta', correct: 'a' }));
    expect(item.target).toBe('lieta');
  });

  it('carries per-option audio urls into item.pair', () => {
    const item = pairRowToReviewItem(pair());
    expect(item.pair?.aAudioUrl).toBe('https://cdn/pair-a.mp3');
    expect(item.pair?.bAudioUrl).toBe('https://cdn/pair-b.mp3');
  });

  it('carries glide.audioUrl from glide_audio_url for diphthong rows', () => {
    const item = pairRowToReviewItem(
      pair({ glide: { combo: 'ie', from: 'i', to: 'e' }, glide_audio_url: 'https://cdn/glide-ie.mp3' }),
    );
    expect(item.glide).toEqual({ combo: 'ie', from: 'i', to: 'e', audioUrl: 'https://cdn/glide-ie.mp3' });
  });

  it('honors review state stage/reps', () => {
    const item = pairRowToReviewItem(pair(), reviewState({ item_type: 'pair', stage: 'review', reps: 4 }));
    expect(item.stage).toBe('review');
    expect(item.reps).toBe(4);
  });

  it('defaults C2 rung fields to 0/0/auto', () => {
    const item = pairRowToReviewItem(pair());
    expect(item.receptiveReps).toBe(0);
    expect(item.productiveReps).toBe(0);
    expect(item.translationVisibility).toBe('auto');
  });

  it('carries the glide for diphthong rows', () => {
    const row = pair({ glide: { combo: 'ie', from: 'i', to: 'e' } });
    const item = pairRowToReviewItem(row, reviewState({ item_type: 'pair', stage: 'learning', reps: 0 }));
    expect(item.glide).toEqual({ combo: 'ie', from: 'i', to: 'e' });
  });

  it('leaves glide undefined for a plain minimal pair', () => {
    expect(pairRowToReviewItem(pair()).glide).toBeUndefined();
  });

  it('maps the RMS envelope onto audio.envelope when present, undefined when absent', () => {
    expect(pairRowToReviewItem(pair({ envelope: [0.1, 0.5, 0.9] })).audio?.envelope).toEqual([
      0.1, 0.5, 0.9,
    ]);
    expect(pairRowToReviewItem(pair({ envelope: null })).audio?.envelope).toBeUndefined();
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

// --- SRS records misses (lapses) --------------------------------------------
// Spec §4: a missed graded card must demote (Rating.Again) and, on an already-learned card,
// record a lapse + pull the due date in. These pin that the algorithm picks misses up.
describe('records misses (lapses)', () => {
  const now = new Date('2026-06-19T00:00:00Z');

  it('a first-try miss on a drill maps to Rating.Again', () => {
    expect(cardResultToRating({ itemId: 'x', cardKind: 'drill', correct: false, spoke: true })).toBe(Rating.Again);
  });

  it("phrase/sayit self-rating 'again' maps to Rating.Again", () => {
    expect(cardResultToRating({ itemId: 'x', cardKind: 'phrase/sayit', spoke: true, selfRating: 'again' })).toBe(Rating.Again);
  });

  it('Again on a learned (review) card lapses: shorter interval AND lapse count up vs Good', () => {
    // A genuinely learned card: real stability/difficulty so a miss is a true lapse (not a
    // degenerate stability-0 row, which would make the interval comparison meaningless).
    const prior = {
      reps: 3,
      stage: 'review' as const,
      stability: 10,
      difficulty: 5,
      due: new Date('2026-06-18T00:00:00Z'),
      last_review: new Date('2026-06-08T00:00:00Z'),
    };
    const again = schedule(prior, Rating.Again, now);
    const good = schedule(prior, Rating.Good, now);
    expect(again.due.getTime()).toBeLessThan(good.due.getTime());
    expect(again.lapses).toBeGreaterThan(good.lapses);
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

describe('rowToPrior', () => {
  it('rebuilds the prior from a review_state row', () => {
    const prior = rowToPrior(reviewState({ stability: 10, reps: 3, lapses: 1, stage: 'review' }));
    expect(prior.stability).toBe(10);
    expect(prior.reps).toBe(3);
    expect(prior.lapses).toBe(1);
    expect(prior.stage).toBe('review');
    expect(prior.due).toEqual(new Date('2026-06-20T00:00:00Z'));
  });

  it('defaults a missing row to a fresh new card', () => {
    const prior = rowToPrior(undefined);
    expect(prior).toEqual({ reps: 0, stage: 'new' });
  });
});

describe('projectReviewLabels', () => {
  const now = new Date('2026-06-14T12:00:00Z');

  it('returns the REAL interval for both outcomes, with pass strictly longer than miss', () => {
    // A matured card: a Good rating pushes the next review far out; an Again rating (lapse) pulls
    // it right back in. The labels must be the true projected intervals, not a fabricated string.
    const prior = rowToPrior(reviewState({ stability: 30, stage: 'mature', reps: 8, lapses: 0 }));
    const { pass, miss } = projectReviewLabels(prior, now);
    expect(pass).toMatch(/^Next review in \d+ days?$/);
    expect(miss).toMatch(/^Next review (later today|in 1 day|in \d+ days)$/);
    const passDays = Number(pass.match(/(\d+)/)?.[1] ?? 0);
    const missDays = Number(miss.match(/(\d+)/)?.[1] ?? 0);
    expect(passDays).toBeGreaterThan(missDays);
  });

  it('matches what submit would write — same prior + Good rating yields the pass label', () => {
    const prior = rowToPrior(reviewState({ stability: 12, stage: 'review' }));
    const { pass } = projectReviewLabels(prior, now);
    expect(pass).toBe(nextReviewLabel(schedule(prior, Rating.Good, now).due, now));
  });
});
