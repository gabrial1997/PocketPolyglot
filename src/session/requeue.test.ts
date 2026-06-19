import { requeuePhraseAfterComponents, requeueNext, lockHint } from './requeue';
import type { ReviewItem } from '../types/reviewItem';

const word = (id: string): ReviewItem => ({ id, type: 'word', stage: 'new', reps: 0, target: id, gloss: id, audio: { nativeUrl: `${id}.mp3` } });
const phrase: ReviewItem = { id: 'p1', type: 'phrase', stage: 'new', reps: 0, target: 'P', gloss: 'P', audio: { nativeUrl: 'p.mp3' }, componentLemmaIds: ['labdien', 'es', 'esmu'] };

it('re-queues a phrase right after the last of its component words ahead', () => {
  const q = [phrase, word('labdien'), word('es'), word('esmu'), word('ka')];
  // from pos 0 (the locked phrase), insert after 'esmu' (index 3)
  const out = requeuePhraseAfterComponents(q, 0, phrase);
  expect(out.map((i) => i.id)).toEqual(['p1', 'labdien', 'es', 'esmu', 'p1', 'ka']);
});

it('re-queues immediately next when no component words remain ahead', () => {
  const q = [phrase, word('ka')];
  const out = requeueNext(q, 0, phrase);
  expect(out.map((i) => i.id)).toEqual(['p1', 'p1', 'ka']);
});

it('lockHint reports words-remaining and the next word to learn (its lemma text from the queue)', () => {
  const q = [phrase, word('labdien'), word('es'), word('esmu')];
  expect(lockHint(q, phrase, new Set(['labdien']))).toEqual({ lockRemaining: 2, lockLemma: 'es' });
  expect(lockHint(q, phrase, new Set())).toEqual({ lockRemaining: 3, lockLemma: 'labdien' });
});
