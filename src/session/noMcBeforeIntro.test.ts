// Pins the headline guarantee of the core-loop reset: a learner is never quizzed on an
// item before they've seen it. Composes expandLearningSteps (which interleaves intro → MC → speak
// for new words) with renderFor/decideKind (which picks the actual card kind) over a
// representative day-0 batch, and asserts the FIRST rendered occurrence of every item id is a
// non-quiz (first-exposure) kind. Every new phrase's first render is the unlock reveal (or the
// locked teaser) — its hear→mc→speak arc is inserted by the controller after the reveal.
// Pure-module test — no React, no clock, no services.
import { expandLearningSteps } from './learningSteps';
import { renderFor } from './renderFor';
import { decideKind } from './decideKind';
import { LEARNING_STEP_GROUP_SIZE } from './pacing';
import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';

function word(
  id: string,
  overrides: Partial<ReviewItem> = {},
): ReviewItem {
  return {
    id,
    type: 'word',
    stage: 'new',
    reps: 0,
    target: id,
    gloss: id,
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
    ...overrides,
  };
}

function phrase(
  id: string,
  componentLemmaIds: string[],
  overrides: Partial<ReviewItem> = {},
): ReviewItem {
  return {
    id,
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: id,
    gloss: id,
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
    componentLemmaIds,
    ...overrides,
  };
}

// The first-exposure kinds a learner may land on before ever being quizzed.
const NON_QUIZ_KINDS = new Set<CardKind>([
  'word/learn-concrete',
  'word/learn-abstract',
  'word/learn-function',
  'word/pic-review',
  'phrase/hear',
  'phrase/locked',
  'phrase/unlock',
]);

describe('headline guarantee: no MC/speak before first exposure (Fix 6)', () => {
  it('the first occurrence of every item id renders a non-quiz kind over a representative day-0 batch', () => {
    const wc = word('wc', { wordClass: 'concrete' });
    const wa = word('wa', { wordClass: 'abstract' });
    const wf = word('wf', { wordClass: 'function' });
    const wp = word('wp', { wordClass: 'concrete', media: { imageUrl: 'wp.png' } }); // picture word

    // Teaser: locked because 'wc' (a new, not-yet-known word) is an unknown component.
    const teaser = phrase('teaser', ['wc']);
    // Fully-known phrase: its only component is already known.
    const known = phrase('known-phrase', ['already-known']);

    const knownLemmaIds = new Set<string>(['already-known']);
    const batch: ReviewItem[] = [teaser, wc, wa, wf, wp, known];

    const steps = expandLearningSteps(batch, LEARNING_STEP_GROUP_SIZE);

    // Sanity: expandLearningSteps must actually have produced retest copies (mc/speak) somewhere,
    // otherwise this test would trivially pass by having no quiz occurrences at all.
    expect(steps.some((s) => s.retest === 'mc' || s.retest === 'speak')).toBe(true);

    const ids = new Set(batch.map((b) => b.id));
    for (const id of ids) {
      const first = steps.find((s) => s.id === id);
      expect(first).toBeDefined();
      const kind: CardKind =
        first!.type === 'phrase' && first!.componentLemmaIds
          ? decideKind(first!, knownLemmaIds, new Set()).kind
          : renderFor(first!);
      expect(NON_QUIZ_KINDS.has(kind)).toBe(true);
    }
  });
});
