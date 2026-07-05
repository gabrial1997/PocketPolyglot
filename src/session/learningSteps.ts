// In-session "learning steps": interleave INTRODUCTION with immediate quizzing.
// Each run of consecutive new words is presented in groups of `groupSize`:
// intros first, then an MC (recognition) retest of each, then a speak (production)
// retest of each — the full teach → MC → speak arc within one session.
// Fully-known new phrases get the same arc as a single-item group. Locked-phrase
// teasers (a new phrase with an unknown component) are emitted in place and are
// transparent to word grouping — the unlock requeue path gives them their arc later.
// Picture words pass through single: word/pic-review already runs a full loop.
// Pure — no clock, no services.
import type { ReviewItem } from '../types/reviewItem';

function isGroupableNewWord(item: ReviewItem): boolean {
  return item.type === 'word' && item.stage === 'new' && !item.media?.imageUrl;
}

function isFullyKnownNewPhrase(item: ReviewItem, known: ReadonlySet<string>): boolean {
  return (
    item.type === 'phrase' &&
    item.stage === 'new' &&
    (item.componentLemmaIds ?? []).every((id) => known.has(id))
  );
}

function isLockedTeaser(item: ReviewItem, known: ReadonlySet<string>): boolean {
  return item.type === 'phrase' && item.stage === 'new' && !isFullyKnownNewPhrase(item, known);
}

export function expandLearningSteps(
  batch: ReviewItem[],
  groupSize: number,
  knownLemmaIds: ReadonlySet<string> = new Set<string>(),
): ReviewItem[] {
  const out: ReviewItem[] = [];
  let i = 0;
  while (i < batch.length) {
    const item = batch[i]!;
    if (isFullyKnownNewPhrase(item, knownLemmaIds)) {
      out.push(item, { ...item, retest: 'mc' }, { ...item, retest: 'speak' });
      i++;
      continue;
    }
    if (!isGroupableNewWord(item)) {
      out.push(item);
      i++;
      continue;
    }
    // Gather up to groupSize new words; locked teasers between them are emitted
    // in place (transparent) so a phrase+word unit doesn't split the word run.
    const group: ReviewItem[] = [];
    while (i < batch.length && group.length < groupSize) {
      const next = batch[i]!;
      if (isGroupableNewWord(next)) {
        group.push(next);
        i++;
        continue;
      }
      if (isLockedTeaser(next, knownLemmaIds)) {
        out.push(next);
        i++;
        continue;
      }
      break;
    }
    for (const w of group) out.push(w); // intros
    for (const w of group) out.push({ ...w, retest: 'mc' }); // MC meaning
    for (const w of group) out.push({ ...w, retest: 'speak' }); // speak it
  }
  return out;
}
