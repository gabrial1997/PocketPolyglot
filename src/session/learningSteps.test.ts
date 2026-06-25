import { expandLearningSteps } from './learningSteps';
import type { ReviewItem } from '../types/reviewItem';

function word(id: string, stage: ReviewItem['stage'] = 'new'): ReviewItem {
  return {
    id, type: 'word', stage, reps: 0, target: id, gloss: id,
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
  };
}
function phrase(id: string): ReviewItem {
  return {
    id, type: 'phrase', stage: 'new', reps: 0, target: id, gloss: id,
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
  };
}

describe('expandLearningSteps', () => {
  it('groups 3 new words: 3 intros then 3 retest quizzes, same ids', () => {
    const out = expandLearningSteps([word('a'), word('b'), word('c')], 3);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    expect(out.slice(0, 3).every((i) => !i.retest)).toBe(true);
    expect(out.slice(3).every((i) => i.retest === true)).toBe(true);
  });

  it('handles a remainder group smaller than groupSize', () => {
    const out = expandLearningSteps([word('a'), word('b'), word('c'), word('d'), word('e')], 3);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'd', 'e', 'd', 'e']);
    // The retest copies (positions 3-5 and 8-9) carry retest:true.
    expect(out[3]!.retest).toBe(true);
    expect(out[8]!.retest).toBe(true);
  });

  it('preserves the original item fields on the retest copy', () => {
    const w = word('a');
    const out = expandLearningSteps([w], 3);
    expect(out[1]).toMatchObject({ id: 'a', type: 'word', target: 'a', retest: true });
  });

  it('passes non-new words through unchanged (already quizzes)', () => {
    const review = word('r', 'review');
    const out = expandLearningSteps([review], 3);
    expect(out).toEqual([review]); // no retest copy
  });

  it('passes phrases through unchanged and only groups the new-word runs', () => {
    const out = expandLearningSteps([word('a'), phrase('p'), word('b')], 3);
    expect(out.map((i) => i.id)).toEqual(['a', 'a', 'p', 'b', 'b']);
    expect(out[1]!.retest).toBe(true); // a's quiz
    expect(out[2]!.type).toBe('phrase'); // phrase untouched, no quiz copy
    expect(out[4]!.retest).toBe(true); // b's quiz
  });

  it('returns [] for an empty batch', () => {
    expect(expandLearningSteps([], 3)).toEqual([]);
  });
});
