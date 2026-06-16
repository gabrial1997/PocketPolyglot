import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';
import { renderFor } from './renderFor';
import { lockState } from './phraseGate';

// Decides the card kind for an item given the known-lemma set and the set of phrase ids already
// seen LOCKED this session. Returns the kind plus whether this render is a fresh unlock (so the
// caller can record it). Phrases consult the i+1 gate; everything else falls through to renderFor.
export function decideKind(
  item: ReviewItem,
  known: ReadonlySet<string>,
  seenLocked: ReadonlySet<string>,
): { kind: CardKind; nowUnlocked: boolean } {
  if (item.type === 'phrase' && item.componentLemmaIds) {
    const { locked } = lockState(item.componentLemmaIds, known);
    if (locked) return { kind: 'phrase/locked', nowUnlocked: false };
    if (seenLocked.has(item.id)) return { kind: 'phrase/unlock', nowUnlocked: true };
  }
  return { kind: renderFor(item), nowUnlocked: false };
}
