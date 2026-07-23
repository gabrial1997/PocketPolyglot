import type { ReviewItem } from '../types/reviewItem';

/** Insert the phrase's full learning arc (hear → MC → speak) immediately after `fromPos`.
 *  Used by the unlock path: the freshly-unlocked phrase gets the same teach→MC→speak arc
 *  a batch-admitted phrase gets from expandLearningSteps. Returns a new array (pure). */
export function requeueArcNext(
  queue: ReviewItem[],
  fromPos: number,
  phrase: ReviewItem,
): ReviewItem[] {
  const arc: ReviewItem[] = [
    { ...phrase, retest: undefined },
    { ...phrase, retest: 'mc' },
    { ...phrase, retest: 'speak' },
  ];
  const at = fromPos + 1;
  return [...queue.slice(0, at), ...arc, ...queue.slice(at)];
}

/** Lock-card hint: how many component words remain unknown, and the lemma TEXT of the next one to
 *  learn (looked up from the word item already in the queue). Pure — drives the "N words to go —
 *  learn X" copy on phrase/locked. */
export function lockHint(
  queue: ReviewItem[],
  phrase: ReviewItem,
  known: ReadonlySet<string>,
): { lockRemaining: number; lockLemma?: string } {
  const unknownIds = (phrase.componentLemmaIds ?? []).filter((id) => !known.has(id));
  const nextId = unknownIds[0];
  const lockLemma = nextId ? queue.find((i) => i.id === nextId)?.target : undefined;
  return { lockRemaining: unknownIds.length, lockLemma };
}
