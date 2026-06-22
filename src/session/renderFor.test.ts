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
    // Below production floor (productiveReps:5, floor=6) -> still word/hear
    it('non-picture word, rung=recall (receptiveReps:5, productiveReps:5, not yet at production floor 6) -> word/hear', () => {
      expect(
        renderFor(audioItem({ stage: 'review', receptiveReps: 5, productiveReps: 5 })),
      ).toBe('word/hear');
    });
    // At/above production floor (productiveReps:6) -> word/say
    it('non-picture word, rung=production (receptiveReps:5, productiveReps:6) -> word/say', () => {
      expect(
        renderFor(audioItem({ stage: 'mature', receptiveReps: 5, productiveReps: 6 })),
      ).toBe('word/say');
    });
    it('new picturable word still learns first (learn before pic-review)', () => {
      expect(
        renderFor(item({ stage: 'new', wordClass: 'concrete', media: { imageUrl: 'house.png' } })),
      ).toBe('word/learn-concrete');
    });
  });

  describe('audio-less word routing (B3 guard)', () => {
    it('audio-less word with image -> word/pic-review (visual fallback)', () => {
      expect(
        renderFor(noAudioItem({ stage: 'review', media: { imageUrl: 'house.png' } })),
      ).toBe('word/pic-review');
    });
    it('audio-less word without image, concrete class -> word/learn-concrete (introduce-only)', () => {
      const result = renderFor(noAudioItem({ stage: 'review', wordClass: 'concrete' }));
      expect(result).toBe('word/learn-concrete');
      expect(result).not.toMatch(/word\/hear|word\/say/);
    });
    it('audio-less word without image, abstract class -> word/learn-abstract', () => {
      expect(
        renderFor(noAudioItem({ stage: 'review', wordClass: 'abstract' })),
      ).toBe('word/learn-abstract');
    });
    it('audio-less word without image, function class -> word/learn-function', () => {
      expect(
        renderFor(noAudioItem({ stage: 'review', wordClass: 'function' })),
      ).toBe('word/learn-function');
    });
    it('audio-less word without image, no wordClass -> word/learn-concrete (default)', () => {
      const result = renderFor(noAudioItem({ stage: 'review', wordClass: undefined }));
      expect(result).toBe('word/learn-concrete');
      expect(result).not.toMatch(/word\/hear|word\/say/);
    });
    it('audio-less word, high reps -> never word/hear or word/say', () => {
      const result = renderFor(noAudioItem({ stage: 'mature', reps: 10 }));
      expect(result).not.toBe('word/hear');
      expect(result).not.toBe('word/say');
    });
  });

  describe('phrases', () => {
    it('new phrase (with audio) -> phrase/hear', () => {
      expect(renderFor(audioItem({ type: 'phrase', stage: 'new' }))).toBe('phrase/hear');
    });
    // Rung-based routing: non-idiom phrase, below production floor -> phrase/hear (receptive)
    it('non-new non-idiom phrase (with audio, productiveReps:0, below production floor) -> phrase/hear', () => {
      expect(
        renderFor(audioItem({ type: 'phrase', stage: 'review', productiveReps: 0 })),
      ).toBe('phrase/hear');
    });
    // Rung-based routing: non-idiom phrase, at production floor (productiveReps:6) -> phrase/sayit
    it('non-new non-idiom phrase (with audio, productiveReps:6, at production floor) -> phrase/sayit', () => {
      expect(
        renderFor(audioItem({ type: 'phrase', stage: 'mature', productiveReps: 6 })),
      ).toBe('phrase/sayit');
    });
    it('non-new idiom phrase (with audio) -> phrase/meaning (comprehension check)', () => {
      expect(
        renderFor(audioItem({ type: 'phrase', stage: 'review', productiveReps: 0, isIdiom: true })),
      ).toBe('phrase/meaning');
    });
    it('idiom phrase at production rung (with audio) -> phrase/meaning (idioms always meaning check)', () => {
      expect(
        renderFor(audioItem({ type: 'phrase', stage: 'mature', productiveReps: 6, isIdiom: true })),
      ).toBe('phrase/meaning');
    });
  });

  describe('audio-less phrase routing (B3 guard)', () => {
    it('audio-less new phrase -> phrase/meaning (never phrase/hear)', () => {
      const result = renderFor(noAudioItem({ type: 'phrase', stage: 'new' }));
      expect(result).toBe('phrase/meaning');
      expect(result).not.toBe('phrase/hear');
    });
    it('audio-less non-idiom phrase -> phrase/meaning (never phrase/sayit)', () => {
      const result = renderFor(noAudioItem({ type: 'phrase', stage: 'review', reps: 1 }));
      expect(result).toBe('phrase/meaning');
      expect(result).not.toBe('phrase/sayit');
    });
    it('audio-less mature phrase -> phrase/meaning (never phrase/hear or phrase/sayit)', () => {
      const result = renderFor(noAudioItem({ type: 'phrase', stage: 'mature', reps: 5 }));
      expect(result).toBe('phrase/meaning');
      expect(result).not.toMatch(/phrase\/hear|phrase\/sayit/);
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
    it('pair without audio -> word/learn-concrete (guard: audio-less pair must not reach a gated kind)', () => {
      // B2 should never produce an audio-less pair, but renderFor guards defensively.
      // Must NOT route to drill, diphthong, or pron (all gated kinds requiring audio).
      const result = renderFor(
        noAudioItem({ type: 'pair', pair: { a: 'lapa', b: 'ļauj', correct: 'a', audioUrl: 'p.mp3' } }),
      );
      expect(result).toBe('word/learn-concrete');
      expect(result).not.toBe('drill');
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
