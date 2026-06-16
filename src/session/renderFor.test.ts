// Unit test for renderFor — the CI smoke test (jest). Covers new/word/phrase/pair branches.
// Verifies the BACKEND_INTEGRATION §2 contract holds.
import { renderFor } from './renderFor';
import type { ReviewItem } from '../types/reviewItem';

// Minimal valid ReviewItem factory; override per case.
function item(overrides: Partial<ReviewItem>): ReviewItem {
  return {
    id: 'x',
    type: 'word',
    stage: 'review',
    reps: 0,
    target: 'māja',
    gloss: 'house',
    audio: { nativeUrl: 'a.mp3' },
    ...overrides,
  };
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
        renderFor(item({ stage: 'review', media: { imageUrl: 'house.png' } })),
      ).toBe('word/pic-review');
    });
    it('non-picture word, reps < 3 -> word/hear (recognition)', () => {
      expect(renderFor(item({ stage: 'review', reps: 1 }))).toBe('word/hear');
    });
    it('non-picture word, reps >= 3 -> word/say (production)', () => {
      expect(renderFor(item({ stage: 'mature', reps: 5 }))).toBe('word/say');
    });
    it('new picturable word still learns first (learn before pic-review)', () => {
      expect(
        renderFor(item({ stage: 'new', wordClass: 'concrete', media: { imageUrl: 'house.png' } })),
      ).toBe('word/learn-concrete');
    });
  });

  describe('phrases', () => {
    it('new phrase -> phrase/hear', () => {
      expect(renderFor(item({ type: 'phrase', stage: 'new' }))).toBe('phrase/hear');
    });
    it('early phrase review -> phrase/meaning', () => {
      expect(renderFor(item({ type: 'phrase', stage: 'review', reps: 1 }))).toBe('phrase/meaning');
    });
    it('mature phrase -> phrase/sayit', () => {
      expect(renderFor(item({ type: 'phrase', stage: 'mature', reps: 4 }))).toBe('phrase/sayit');
    });
  });

  describe('pair', () => {
    it('minimal pair -> drill', () => {
      expect(
        renderFor(
          item({ type: 'pair', pair: { a: 'lapa', b: 'ļauj', correct: 'a', audioUrl: 'p.mp3' } }),
        ),
      ).toBe('drill');
    });
  });
});

function pairItem(extra: Partial<ReviewItem>): ReviewItem {
  return {
    id: 'p1', type: 'pair', stage: 'learning', reps: 0,
    target: 'lieta', gloss: 'thing',
    audio: { nativeUrl: 'x' },
    pair: { a: 'lieta', b: 'lēta', correct: 'a', audioUrl: 'x' },
    ...extra,
  };
}

test('renderFor routes a pair WITH a glide to diphthong', () => {
  expect(renderFor(pairItem({ glide: { combo: 'ie', from: 'i', to: 'e' } }))).toBe('diphthong');
});

test('renderFor routes a pair WITHOUT a glide to drill', () => {
  expect(renderFor(pairItem({}))).toBe('drill');
});
