// In-session "learning steps": interleave INTRODUCTION with immediate quizzing.
// Each run of consecutive new words is presented in groups of `groupSize`:
// intros first, then an MC (recognition) retest of each, then a speak (production)
// retest of each — the full teach → MC → speak arc within one session.
//
// New PHRASES are NOT expanded here: every new phrase first renders the one-time
// 'phrase/unlock' reveal (decideKind), and the controller's unlock advance inserts the
// phrase's own hear → MC → speak arc (requeueArcNext). They pass through in place and are
// transparent to word grouping — a teaser-before-word unit must not split a word run.
// Picture words pass through single: word/pic-review already runs a full loop.
// Pure — no clock, no services.
import type { ReviewItem } from '../types/reviewItem';

function isGroupableNewWord(item: ReviewItem): boolean {
  return item.type === 'word' && item.stage === 'new' && !item.media?.imageUrl;
}

function isNewPhrase(item: ReviewItem): boolean {
  return item.type === 'phrase' && item.stage === 'new';
}

export function expandLearningSteps(batch: ReviewItem[], groupSize: number): ReviewItem[] {
  const out: ReviewItem[] = [];
  let i = 0;
  while (i < batch.length) {
    const item = batch[i]!;
    if (!isGroupableNewWord(item)) {
      out.push(item);
      i++;
      continue;
    }
    // Gather up to groupSize new words; new phrases between them (locked teasers or
    // batch-admitted unlocks) are emitted in place (transparent) so they don't split the run.
    const group: ReviewItem[] = [];
    while (i < batch.length && group.length < groupSize) {
      const next = batch[i]!;
      if (isGroupableNewWord(next)) {
        group.push(next);
        i++;
        continue;
      }
      if (isNewPhrase(next)) {
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
