import type { ReviewItem } from '../types/reviewItem';

/** Insert `phrase` right after the LAST of its component words that appears after `fromPos`.
 *  If none appear ahead, append to the end. Returns a new array (pure). */
export function requeuePhraseAfterComponents(
  queue: ReviewItem[],
  fromPos: number,
  phrase: ReviewItem,
): ReviewItem[] {
  const ids = new Set(phrase.componentLemmaIds ?? []);
  let lastCompIdx = -1;
  for (let i = fromPos + 1; i < queue.length; i++) {
    const q = queue[i];
    if (q && ids.has(q.id)) lastCompIdx = i;
  }
  const insertAt = lastCompIdx === -1 ? queue.length : lastCompIdx + 1;
  return [...queue.slice(0, insertAt), phrase, ...queue.slice(insertAt)];
}

/** Insert `phrase` as the very next item after `fromPos`. Returns a new array (pure). */
export function requeueNext(queue: ReviewItem[], fromPos: number, phrase: ReviewItem): ReviewItem[] {
  const at = fromPos + 1;
  return [...queue.slice(0, at), phrase, ...queue.slice(at)];
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
