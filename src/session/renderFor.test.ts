// Unit test for renderFor — the CI smoke test (jest). Covers new/word/phrase/pair branches.
// Verifies the BACKEND_INTEGRATION §2 contract holds.
import { renderFor } from './renderFor';
import type { ReviewItem } from '../types/reviewItem';

// Minimal valid ReviewItem factory; override per case.
// NB: default item has audio (nativeUrl only, no envelope) — use audioItem() for a gated-ok item.
function item(overrides: Partial<ReviewItem>): ReviewItem {
  return {
    id: 'x',
    type: 'word',
    stage: 'review',
    reps: 0,
    target: 'māja',
    gloss: 'house',
    audio: { nativeUrl: 'a.mp3' },
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
    ...overrides,
  };
}

// Item with a full audio payload (nativeUrl + envelope) — passes the hasAudio gate.
function audioItem(overrides: Partial<ReviewItem>): ReviewItem {
  return item({ audio: { nativeUrl: 'a.mp3', envelope: [0.1, 0.5, 0.8] }, ...overrides });
}

// Item with no audio at all — fails the hasAudio gate.
function noAudioItem(overrides: Partial<ReviewItem>): ReviewItem {
  return item({ audio: undefined, ...overrides });
}

describe('renderFor', () => {
  describe('new words pick the learn template by word class', () => {
    it('concrete -> word/learn-concrete', () => {
      expect(renderFor(item({ stage: 'new', wordClass: 'concrete' }))).toBe('word/learn-concrete');
    });
    it('abstract -> word/learn-abstract', () => {
      expect(renderFor(item({ stage: 'new', wordClass: 'abstract' }))).toBe('word/learn-abstract');
    });
    it('function -> word/learn-function', () => {
      expect(renderFor(item({ stage: 'new', wordClass: 'function' }))).toBe('word/learn-function');
    });
  });

  describe('word reviews', () => {
    it('picturable word -> word/pic-review (full loop)', () => {
      expect(
        renderFor(audioItem({ stage: 'review', media: { imageUrl: 'house.png' } })),
      ).toBe('word/pic-review');
    });
    // Rung-based routing: recognition rung (receptiveReps:0, productiveReps:0) -> word/hear
    it('non-picture word, rung=recognition (receptiveReps:0, productiveReps:0) -> word/hear', () => {
      expect(
        renderFor(audioItem({ stage: 'review', receptiveReps: 0, productiveReps: 0 })),
      ).toBe('word/hear');
    });
    // No choices -> word/say's choose stage is uncompletable, so even/odd parity both fall back.
    it('non-picture word, no choices, even total reps -> word/hear', () => {
      expect(
        renderFor(audioItem({ stage: 'review', receptiveReps: 5, productiveReps: 5 })),
      ).toBe('word/hear');
    });
    it('new picturable word still learns first (learn before pic-review)', () => {
      expect(
        renderFor(item({ stage: 'new', wordClass: 'concrete', media: { imageUrl: 'house.png' } })),
      ).toBe('word/learn-concrete');
    });
  });

  describe('audio-less word routing (recognition quiz is audio-optional)', () => {
    it('audio-less word with image -> word/pic-review (visual fallback)', () => {
      expect(
        renderFor(noAudioItem({ stage: 'review', media: { imageUrl: 'house.png' } })),
      ).toBe('word/pic-review');
    });
    it('audio-less word without image, concrete class -> word/hear (quizzable; play button silent)', () => {
      const result = renderFor(noAudioItem({ stage: 'review', wordClass: 'concrete' }));
      expect(result).toBe('word/hear');
      expect(result).not.toBe('word/say');
    });
    it('audio-less word without image, abstract class -> word/hear', () => {
      expect(
        renderFor(noAudioItem({ stage: 'review', wordClass: 'abstract' })),
      ).toBe('word/hear');
    });
    it('audio-less word without image, function class -> word/hear', () => {
      expect(
        renderFor(noAudioItem({ stage: 'review', wordClass: 'function' })),
      ).toBe('word/hear');
    });
    it('audio-less word without image, no wordClass -> word/hear', () => {
      const result = renderFor(noAudioItem({ stage: 'review', wordClass: undefined }));
      expect(result).toBe('word/hear');
      expect(result).not.toBe('word/say');
    });
  });

  describe('phrases', () => {
    it('new phrase (with audio) -> phrase/hear', () => {
      expect(renderFor(audioItem({ type: 'phrase', stage: 'new' }))).toBe('phrase/hear');
    });
    // Rung-based routing: non-idiom phrase, below production floor -> phrase/meaning (recognition quiz)
    it('non-new non-idiom phrase (with audio, productiveReps:0, below production floor) -> phrase/meaning', () => {
      expect(
        renderFor(audioItem({ type: 'phrase', stage: 'review', productiveReps: 0,
          choices: [{ value: 'a', gloss: 'x', correct: true }, { value: 'b', gloss: 'y', correct: false }] })),
      ).toBe('phrase/meaning');
    });
    it('non-new idiom phrase (with audio) -> phrase/meaning (comprehension check)', () => {
      expect(
        renderFor(audioItem({ type: 'phrase', stage: 'review', productiveReps: 0, isIdiom: true,
          choices: [{ value: 'a', gloss: 'x', correct: true }, { value: 'b', gloss: 'y', correct: false }] })),
      ).toBe('phrase/meaning');
    });
    it('idiom phrase, odd total reps (with audio) -> phrase/sayit (is_idiom no longer special; parity routes to sayit)', () => {
      expect(
        renderFor(audioItem({ type: 'phrase', stage: 'mature', receptiveReps: 0, productiveReps: 1, isIdiom: true })),
      ).toBe('phrase/sayit');
    });
  });

  // Task 4: new routing — new→hear, recognition→meaning, production(audio)→sayit
  it('a new phrase routes to phrase/hear (first exposure)', () => {
    const item = { id: 'p', type: 'phrase' as const, stage: 'new' as const, reps: 0, target: 'labrīt', gloss: 'good morning',
      receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' as const };
    expect(renderFor(item)).toBe('phrase/hear');
  });

  it('a phrase review with even total reps routes to phrase/meaning (the meaning quiz)', () => {
    const item = { id: 'p', type: 'phrase' as const, stage: 'review' as const, reps: 2, target: 'labrīt', gloss: 'good morning',
      receptiveReps: 2, productiveReps: 0, translationVisibility: 'auto' as const,
      choices: [{ value: 'a', gloss: 'x', correct: true as const }, { value: 'b', gloss: 'y', correct: false as const }] };
    expect(renderFor(item)).toBe('phrase/meaning');
  });

  it('a phrase with odd total reps (audio present) routes to phrase/sayit', () => {
    const item = { id: 'p', type: 'phrase' as const, stage: 'review' as const, reps: 9, target: 'labrīt', gloss: 'good morning',
      audio: { envelope: [0.5] }, receptiveReps: 3, productiveReps: 6, translationVisibility: 'auto' as const };
    expect(renderFor(item)).toBe('phrase/sayit');
  });

  describe('audio-less phrase routing (recognition quiz is audio-optional)', () => {
    it('audio-less new phrase -> phrase/hear (first exposure; stage=new always routes to hear)', () => {
      const result = renderFor(noAudioItem({ type: 'phrase', stage: 'new' }));
      expect(result).toBe('phrase/hear');
      expect(result).not.toBe('phrase/meaning');
    });
    // Non-new audio-less phrases now route to phrase/meaning (recognition quiz is audio-optional).
    // Even total reps (default receptiveReps/productiveReps: 0) -> the MC step, not sayit.
    it('audio-less non-idiom phrase (review), even total reps -> phrase/meaning', () => {
      const result = renderFor(noAudioItem({ type: 'phrase', stage: 'review', reps: 1,
        choices: [{ value: 'a', gloss: 'x', correct: true }, { value: 'b', gloss: 'y', correct: false }] }));
      expect(result).toBe('phrase/meaning');
      expect(result).not.toBe('phrase/sayit');
      expect(result).not.toBe('phrase/hear');
    });
    it('audio-less mature phrase, even total reps -> phrase/meaning (parity picks the MC step, not audio)', () => {
      const result = renderFor(noAudioItem({ type: 'phrase', stage: 'mature', reps: 5,
        choices: [{ value: 'a', gloss: 'x', correct: true }, { value: 'b', gloss: 'y', correct: false }] }));
      expect(result).toBe('phrase/meaning');
      expect(result).not.toBe('phrase/sayit');
    });
    it('an audio-less NEW phrase routes to phrase/hear (stage=new always hear, not meaning)', () => {
      const item = { id: 'p', type: 'phrase' as const, stage: 'new' as const, reps: 0, target: 'labrīt', gloss: 'good morning',
        receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' as const };
      expect(renderFor(item)).toBe('phrase/hear');
    });
  });

  describe('phrase/meaning choices guard — fewer than 2 choices falls back to phrase/hear', () => {
    it('non-new phrase WITH >=2 choices -> phrase/meaning (normal production state)', () => {
      const result = renderFor(item({ type: 'phrase', stage: 'review', reps: 2,
        choices: [{ value: 'a', gloss: 'x', correct: true }, { value: 'b', gloss: 'y', correct: false }] }));
      expect(result).toBe('phrase/meaning');
    });

    it('non-new phrase with NO choices (distractors failed to load) -> phrase/hear (soft-lock guard)', () => {
      const result = renderFor(item({ type: 'phrase', stage: 'review', reps: 2, choices: undefined }));
      expect(result).toBe('phrase/hear');
      expect(result).not.toBe('phrase/meaning');
    });

    it('non-new phrase with only 1 choice -> phrase/hear (insufficient for a meaningful quiz)', () => {
      const result = renderFor(item({ type: 'phrase', stage: 'review', reps: 2,
        choices: [{ value: 'a', gloss: 'x', correct: true }] }));
      expect(result).toBe('phrase/hear');
      expect(result).not.toBe('phrase/meaning');
    });
  });

  describe('pair', () => {
    it('minimal pair (with audio) -> drill', () => {
      expect(
        renderFor(
          audioItem({ type: 'pair', pair: { a: 'lapa', b: 'ļauj', correct: 'a', audioUrl: 'p.mp3' } }),
        ),
      ).toBe('drill');
    });
    it('pair without audio -> drill (defensive fallback stays pair-shaped)', () => {
      // B2 should never produce an audio-less pair, but renderFor guards defensively.
      // The fallback must stay pair-shaped: a word/learn-* kind would render a word card with an
      // empty gloss AND its submitted cardKind would corrupt the introducedToday
      // LIKE 'word/learn-%' new-word budget with a pair id.
      const result = renderFor(
        noAudioItem({ type: 'pair', pair: { a: 'lapa', b: 'ļauj', correct: 'a', audioUrl: 'p.mp3' } }),
      );
      expect(result).toBe('drill');
      expect(result).not.toMatch(/^word\/learn-/);
      expect(result).not.toBe('diphthong');
      expect(result).not.toBe('pron');
    });
  });
});

// pairItem: audio includes envelope so it passes the hasAudio gate (drill/diphthong require audio).
function pairItem(extra: Partial<ReviewItem>): ReviewItem {
  return {
    id: 'p1', type: 'pair', stage: 'learning', reps: 0,
    target: 'lieta', gloss: 'thing',
    audio: { nativeUrl: 'x', envelope: [0.1, 0.5, 0.8] },
    pair: { a: 'lieta', b: 'lēta', correct: 'a', audioUrl: 'x' },
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
    ...extra,
  };
}

test('renderFor routes a pair WITH a glide to diphthong', () => {
  expect(renderFor(pairItem({ glide: { combo: 'ie', from: 'i', to: 'e' } }))).toBe('diphthong');
});

test('renderFor routes a pair WITHOUT a glide to drill', () => {
  expect(renderFor(pairItem({}))).toBe('drill');
});

describe('renderFor — learning-step retest + audio-optional recognition', () => {
  const base = {
    reps: 0, target: 'vārds', gloss: 'word',
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' as const,
  };

  it('a retest new word (no audio) routes to word/hear, not a learn card', () => {
    const item = { ...base, id: 'a', type: 'word' as const, stage: 'new' as const, wordClass: 'concrete' as const, retest: 'mc' as const };
    expect(renderFor(item)).toBe('word/hear');
  });

  it('a retest word with an image routes to word/pic-review', () => {
    const item = { ...base, id: 'a', type: 'word' as const, stage: 'new' as const, retest: 'mc' as const, media: { imageUrl: 'x.png' } };
    expect(renderFor(item)).toBe('word/pic-review');
  });

  it('an audio-less word REVIEW routes to word/hear (quizzable without audio)', () => {
    const item = { ...base, id: 'a', type: 'word' as const, stage: 'review' as const, wordClass: 'concrete' as const };
    expect(renderFor(item)).toBe('word/hear');
  });

  it('an odd-total-reps word with choices routes to word/say (audio not required)', () => {
    const item = {
      ...base, id: 'a', type: 'word' as const, stage: 'review' as const,
      audio: { envelope: [0.5] }, receptiveReps: 3, productiveReps: 6,
      choices: [{ value: 'a', correct: true }, { value: 'b', correct: false }],
    };
    expect(renderFor(item)).toBe('word/say');
  });

  it('a genuine new word (no retest) still routes to its learn card', () => {
    const item = { ...base, id: 'a', type: 'word' as const, stage: 'new' as const, wordClass: 'concrete' as const };
    expect(renderFor(item)).toBe('word/learn-concrete');
  });
});

const twoChoices = [{ value: 'a', correct: true }, { value: 'b', correct: false }];
const newWord: ReviewItem = { id: 'nw', type: 'word', stage: 'new', reps: 0, target: 'vārds', gloss: 'word',
  receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' };
const dueWord: ReviewItem = { id: 'dw', type: 'word', stage: 'review', reps: 3, target: 'vārds', gloss: 'word',
  audio: { nativeUrl: 'a.mp3' }, receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' };
const newPhrase: ReviewItem = { id: 'np', type: 'phrase', stage: 'new', reps: 0, target: 'labrīt', gloss: 'good morning',
  receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' };
const duePhrase: ReviewItem = { id: 'dp', type: 'phrase', stage: 'review', reps: 3, target: 'labrīt', gloss: 'good morning',
  audio: { nativeUrl: 'p.mp3' }, receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' };

describe('renderFor — retest step routing', () => {
  it("routes a word retest:'mc' to word/hear", () => {
    expect(renderFor({ ...newWord, retest: 'mc' })).toBe('word/hear');
  });
  it("routes a word retest:'speak' to word/say even without audio", () => {
    const w = { ...newWord, retest: 'speak' as const, audio: undefined, choices: twoChoices };
    expect(renderFor(w)).toBe('word/say');
  });
  it("routes a phrase retest:'mc' to phrase/meaning when choices exist", () => {
    const p = { ...newPhrase, retest: 'mc' as const, choices: twoChoices };
    expect(renderFor(p)).toBe('phrase/meaning');
  });
  it("falls back to phrase/hear for retest:'mc' with <2 choices", () => {
    expect(renderFor({ ...newPhrase, retest: 'mc' as const, choices: [] })).toBe('phrase/hear');
  });
  it("routes a phrase retest:'speak' to phrase/sayit even without audio", () => {
    expect(renderFor({ ...newPhrase, retest: 'speak' as const, audio: undefined })).toBe('phrase/sayit');
  });
});

describe('renderFor — recall probe (no-FSRS word/recall; spec 2026-07-23 §4)', () => {
  it('a probe word routes to word/hear even though it would otherwise render a learn card', () => {
    const w = { ...newWord, probe: true as const, stage: 'new' as const, wordClass: 'concrete' as const };
    expect(renderFor(w)).toBe('word/hear');
  });

  it('a probe word routes to word/hear even when picturable (overrides word/pic-review)', () => {
    const w = { ...dueWord, probe: true as const, media: { imageUrl: 'x.png' } };
    expect(renderFor(w)).toBe('word/hear');
  });

  it('a probe word with choices still routes to word/hear (never word/say)', () => {
    const w = { ...dueWord, probe: true as const, choices: twoChoices, receptiveReps: 3, productiveReps: 3 };
    expect(renderFor(w)).toBe('word/hear');
  });
});

describe('renderFor — review rotation (MC ↔ speak by rep parity)', () => {
  it('even totalReps → word/hear', () => {
    const w = { ...dueWord, receptiveReps: 1, productiveReps: 1, choices: twoChoices };
    expect(renderFor(w)).toBe('word/hear');
  });
  it('odd totalReps → word/say (audio not required)', () => {
    const w = { ...dueWord, receptiveReps: 2, productiveReps: 1, audio: undefined, choices: twoChoices };
    expect(renderFor(w)).toBe('word/say');
  });
  it('odd totalReps but <2 choices → word/hear (word/say needs its choose stage)', () => {
    const w = { ...dueWord, receptiveReps: 2, productiveReps: 1, choices: [] };
    expect(renderFor(w)).toBe('word/hear');
  });
  it('picture words always word/pic-review regardless of parity', () => {
    const w = { ...dueWord, receptiveReps: 2, productiveReps: 1, media: { imageUrl: 'x' } };
    expect(renderFor(w)).toBe('word/pic-review');
  });
  it('even totalReps → phrase/meaning; odd → phrase/sayit', () => {
    const even = { ...duePhrase, receptiveReps: 2, productiveReps: 0, choices: twoChoices };
    const odd = { ...duePhrase, receptiveReps: 2, productiveReps: 1, choices: twoChoices };
    expect(renderFor(even)).toBe('phrase/meaning');
    expect(renderFor(odd)).toBe('phrase/sayit');
  });
});
