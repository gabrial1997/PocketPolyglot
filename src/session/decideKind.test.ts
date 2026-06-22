import { decideKind } from './decideKind';
import type { ReviewItem } from '../types/reviewItem';

const phrase = (overrides: Partial<ReviewItem> = {}): ReviewItem => ({
  id: 'p1', type: 'phrase', stage: 'new', reps: 0,
  target: 'Labdien, es esmu ___.', gloss: 'Hello, I am ___.',
  audio: { nativeUrl: 'p1.mp3', envelope: [0.2, 0.6, 1] }, componentLemmaIds: ['labdien', 'es', 'esmu'],
  receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
  ...overrides,
});
const empty = new Set<string>();

it('locked while any word unknown', () => {
  const k = new Set(['labdien']);
  expect(decideKind(phrase(), k, empty, empty).kind).toBe('phrase/locked');
});

it('reveals unlock ONCE when all words known and it was seen locked', () => {
  const k = new Set(['labdien', 'es', 'esmu']);
  const seen = new Set(['p1']);
  const r = decideKind(phrase(), k, seen, empty);
  expect(r.kind).toBe('phrase/unlock');
  expect(r.nowUnlocked).toBe(true);
});

it('after the unlock is revealed, resolves to the review kind (hear for a new phrase)', () => {
  const k = new Set(['labdien', 'es', 'esmu']);
  const seen = new Set(['p1']);
  const revealed = new Set(['p1']);
  expect(decideKind(phrase(), k, seen, revealed).kind).toBe('phrase/hear');
});
