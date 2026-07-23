import { requeueArcNext, lockHint } from './requeue';
import type { ReviewItem } from '../types/reviewItem';

const word = (id: string): ReviewItem => ({ id, type: 'word', stage: 'new', reps: 0, target: id, gloss: id, audio: { nativeUrl: `${id}.mp3` }, receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' });
const phrase: ReviewItem = { id: 'p1', type: 'phrase', stage: 'new', reps: 0, target: 'P', gloss: 'P', audio: { nativeUrl: 'p.mp3' }, componentLemmaIds: ['labdien', 'es', 'esmu'], receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' };
const phraseItem = (id: string): ReviewItem => ({ id, type: 'phrase', stage: 'new', reps: 0, target: id, gloss: id, audio: { nativeUrl: `${id}.mp3` }, receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto' });

describe('requeueArcNext', () => {
  it('inserts the full hear→mc→speak arc immediately after fromPos', () => {
    const q = [word('a'), phraseItem('p'), word('b')]; // p at pos 1 = the unlock card
    const out = requeueArcNext(q, 1, q[1]!);
    expect(out.map((i) => `${i.id}:${i.retest ?? 'intro'}`)).toEqual([
      'a:intro', 'p:intro', 'p:intro', 'p:mc', 'p:speak', 'b:intro',
    ]);
    // the inserted intro copy carries no retest marker
    expect(out[2]!.retest).toBeUndefined();
  });
});

it('lockHint reports words-remaining and the next word to learn (its lemma text from the queue)', () => {
  const q = [phrase, word('labdien'), word('es'), word('esmu')];
  expect(lockHint(q, phrase, new Set(['labdien']))).toEqual({ lockRemaining: 2, lockLemma: 'es' });
  expect(lockHint(q, phrase, new Set())).toEqual({ lockRemaining: 3, lockLemma: 'labdien' });
});
