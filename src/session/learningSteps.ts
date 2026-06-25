// In-session "learning steps": interleave new-word INTRODUCTION with immediate RECOGNITION
// quizzing. For each run of consecutive new words, present them in groups of `groupSize`, then
// append a retest copy of each word in the group (renderFor routes retest words to word/hear).
// Pure — no clock, no services. Non-new and non-word items pass through unchanged (they are
// already their own tests / have their own flow, e.g. due reviews and phrase gating).
import type { ReviewItem } from '../types/reviewItem';

function isNewWord(item: ReviewItem): boolean {
  return item.type === 'word' && item.stage === 'new';
}

export function expandLearningSteps(batch: ReviewItem[], groupSize: number): ReviewItem[] {
  const out: ReviewItem[] = [];
  let i = 0;
  while (i < batch.length) {
    const item = batch[i]!;
    if (!isNewWord(item)) {
      out.push(item);
      i++;
      continue;
    }
    // Gather the next group of up to `groupSize` consecutive new words.
    const group: ReviewItem[] = [];
    while (i < batch.length && isNewWord(batch[i]!) && group.length < groupSize) {
      group.push(batch[i]!);
      i++;
    }
    for (const w of group) out.push(w); // intros first
    for (const w of group) out.push({ ...w, retest: true }); // then quiz each
  }
  return out;
}
