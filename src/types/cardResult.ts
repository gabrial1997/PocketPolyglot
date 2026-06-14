// CardResult — the events-out shape a card reports via onComplete (BACKEND_INTEGRATION.md §3).
// The controller posts this to SrsService.submit(); the card never computes intervals.
import type { CardKind } from './cardKind';

export interface CardResult {
  itemId: string;
  cardKind: CardKind;
  correct?: boolean; // multiple-choice outcome (undefined for learn cards)
  spoke?: boolean; // did the user record an attempt
  recording?: Blob | string; // audio blob or uploaded URL, for pron scoring
  selfRating?: 'good' | 'again'; // phrase say-it self rating
  latencyMs?: number;
}
