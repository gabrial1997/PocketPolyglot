import { decideKind } from './decideKind';
import type { ReviewItem } from '../types/reviewItem';

const phrase: ReviewItem = {
  id: 'ph1',
  type: 'phrase',
  stage: 'new',
  reps: 0,
  target: 'Vienu kafiju, lūdzu.',
  gloss: 'One coffee, please.',
  audio: { nativeUrl: 'x' },
  componentLemmaIds: ['viens', 'kafija', 'ludzu'],
};

test('locked phrase → phrase/locked', () => {
  const r = decideKind(phrase, new Set(['ludzu']), new Set());
  expect(r.kind).toBe('phrase/locked');
});

test('a phrase seen locked, now available → phrase/unlock', () => {
  const r = decideKind(phrase, new Set(['viens', 'ludzu']), new Set(['ph1']));
  expect(r.kind).toBe('phrase/unlock');
  expect(r.nowUnlocked).toBe(true);
});

test('available phrase never seen locked → normal review kind', () => {
  const r = decideKind(phrase, new Set(['viens', 'kafija', 'ludzu']), new Set());
  expect(r.kind).toBe('phrase/hear');
});
