import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';
import { renderFor } from './renderFor';
import { lockState } from './phraseGate';

// Decides the card kind for an item given the EARNED-lemma set (correct recognition/recall in a
// DIFFERENT round or day than a word's own intro — never the same sitting; see
// `src/session/earned.ts`) and the set of phrase ids whose unlock reveal has already been shown
// this session. Phrases consult the i+1 gate; everything else falls through to renderFor.
//
// Building blocks (beta decision 2026-07-05): EVERY new phrase opens with the one-time
// 'phrase/unlock' reveal (chime) — a phrase arriving in the loop IS an unlock, whether its final
// word was earned on an earlier round or an earlier day. The reveal shows once per session
// (`revealed`); the arc copies the controller inserts after it carry a `retest` marker and are
// never treated as a first arrival.
//
// No-re-lock rule (2026-07-23 earned-phrase gating): the lock/unlock gate applies ONLY to
// `item.stage === 'new'` phrases. Once a phrase has advanced past 'new' (i.e. it has been
// unlocked at least once) it is never re-evaluated against the gate again, even if one of its
// components would somehow no longer read as earned — a review-stage phrase always renders its
// normal review kind.
export function decideKind(
  item: ReviewItem,
  known: ReadonlySet<string>,
  revealed: ReadonlySet<string>,
): { kind: CardKind } {
  if (item.type === 'phrase' && item.componentLemmaIds && item.stage === 'new') {
    const { locked } = lockState(item.componentLemmaIds, known);
    if (locked) return { kind: 'phrase/locked' };
    if (!item.retest && !revealed.has(item.id)) return { kind: 'phrase/unlock' };
  }
  return { kind: renderFor(item) };
}
