import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';
import { renderFor } from './renderFor';
import { lockState } from './phraseGate';

// Decides the card kind for an item given the known-lemma set and the set of phrase ids whose
// unlock reveal has already been shown this session. Phrases consult the i+1 gate; everything
// else falls through to renderFor.
//
// Building blocks (beta decision 2026-07-05): EVERY new phrase opens with the one-time
// 'phrase/unlock' reveal (chime) — a phrase arriving in the loop IS an unlock, whether its final
// word was learned seconds ago (the locked-teaser arc) or on an earlier day (admitted fully
// known). The reveal shows once per session (`revealed`); the arc copies the controller inserts
// after it carry a `retest` marker and are never treated as a first arrival.
export function decideKind(
  item: ReviewItem,
  known: ReadonlySet<string>,
  revealed: ReadonlySet<string>,
): { kind: CardKind; nowUnlocked: boolean } {
  if (item.type === 'phrase' && item.componentLemmaIds) {
    const { locked } = lockState(item.componentLemmaIds, known);
    if (locked) return { kind: 'phrase/locked', nowUnlocked: false };
    if (item.stage === 'new' && !item.retest && !revealed.has(item.id)) {
      return { kind: 'phrase/unlock', nowUnlocked: true };
    }
  }
  return { kind: renderFor(item), nowUnlocked: false };
}
