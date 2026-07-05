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
const allKnown = new Set(['labdien', 'es', 'esmu']);

it('locked while any word unknown', () => {
  const k = new Set(['labdien']);
  expect(decideKind(phrase(), k, empty).kind).toBe('phrase/locked');
});

it('reveals unlock ONCE for ANY new unlocked phrase — building blocks: arriving IS the unlock', () => {
  // No prior locked sighting required: a phrase admitted with already-known blocks
  // (learned on earlier days) still opens with the chime + reveal.
  const r = decideKind(phrase(), allKnown, empty);
  expect(r.kind).toBe('phrase/unlock');
  expect(r.nowUnlocked).toBe(true);
});

it('after the unlock is revealed, resolves to the review kind (hear for a new phrase)', () => {
  const revealed = new Set(['p1']);
  expect(decideKind(phrase(), allKnown, revealed).kind).toBe('phrase/hear');
});

it('arc retest copies never re-trigger the unlock', () => {
  const revealed = new Set(['p1']);
  const mc = phrase({ retest: 'mc', choices: [
    { value: 'a', correct: true }, { value: 'b', correct: false },
  ] });
  expect(decideKind(mc, allKnown, revealed).kind).toBe('phrase/meaning');
  // Defensive: even if revealed were somehow empty, a retest copy is not a first arrival.
  expect(decideKind(phrase({ retest: 'speak' }), allKnown, empty).kind).toBe('phrase/sayit');
});

it('a due (non-new) phrase never shows the unlock', () => {
  const due = phrase({ stage: 'review', receptiveReps: 2, productiveReps: 0, choices: [
    { value: 'a', correct: true }, { value: 'b', correct: false },
  ] });
  expect(decideKind(due, allKnown, empty).kind).toBe('phrase/meaning');
});
