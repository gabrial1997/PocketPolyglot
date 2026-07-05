import { expandLearningSteps } from './learningSteps';
import type { ReviewItem } from '../types/reviewItem';

function word(id: string, stage: ReviewItem['stage'] = 'new', imageUrl?: string): ReviewItem {
  return {
    id, type: 'word', stage, reps: 0, target: id, gloss: id,
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
    ...(imageUrl ? { media: { imageUrl } } : {}),
  };
}
function phrase(id: string, componentLemmaIds: string[] = []): ReviewItem {
  return {
    id, type: 'phrase', stage: 'new', reps: 0, target: id, gloss: id,
    receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
    componentLemmaIds,
  };
}

describe('expandLearningSteps', () => {
  it('expands 3 new words into intros, MC retests, then speak retests', () => {
    const out = expandLearningSteps([word('a'), word('b'), word('c')], 3);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual([
      'a:intro', 'b:intro', 'c:intro',
      'a:mc', 'b:mc', 'c:mc',
      'a:speak', 'b:speak', 'c:speak',
    ]);
  });

  it('handles a remainder group smaller than groupSize', () => {
    const out = expandLearningSteps([word('a'), word('b'), word('c'), word('d')], 3);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual([
      'a:intro', 'b:intro', 'c:intro', 'a:mc', 'b:mc', 'c:mc', 'a:speak', 'b:speak', 'c:speak',
      'd:intro', 'd:mc', 'd:speak',
    ]);
  });

  it('passes non-new words through unchanged (already quizzes)', () => {
    const out = expandLearningSteps([word('r', 'review')], 3);
    expect(out).toHaveLength(1);
    expect(out[0]!.retest).toBeUndefined();
  });

  it('passes picture words through single — pic-review is already a full loop', () => {
    const out = expandLearningSteps([word('img', 'new', 'https://x/img.png')], 3);
    expect(out).toHaveLength(1);
    expect(out[0]!.retest).toBeUndefined();
  });

  it('passes every new phrase through single — the unlock reveal + requeueArcNext own its arc', () => {
    // Both a fully-known phrase and a locked teaser: no expansion here, no retest copies.
    const out = expandLearningSteps([phrase('p', ['w1', 'w2']), phrase('q', ['w9'])], 3);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual(['p:intro', 'q:intro']);
  });

  it('emits a new phrase in place without splitting the word group around it', () => {
    // phrase p sits between w1 and w2 — the word run stays one group
    const out = expandLearningSteps([word('w1'), phrase('p', ['w2']), word('w2'), word('w3')], 3);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual([
      'p:intro',
      'w1:intro', 'w2:intro', 'w3:intro',
      'w1:mc', 'w2:mc', 'w3:mc',
      'w1:speak', 'w2:speak', 'w3:speak',
    ]);
  });
});
