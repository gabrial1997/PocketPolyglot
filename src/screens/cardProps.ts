// Shared card prop shapes — the data-in / events-out boundary (BACKEND_INTEGRATION §1, §4).
// Every Tier-A card takes { item, ...callbacks }. Cards NEVER import services — the controller
// injects behaviour through these callbacks. Cards own ONLY ephemeral UI state.
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';
import type { Speed } from '../components';

/** Which audio variant to play. (number = example index for the function learn card.) */
export type PlayWhich = 'native' | 'slow' | number;

/** Base props common to every Tier-A card. */
export interface BaseCardProps {
  item: ReviewItem;
  onPlay: (which: PlayWhich) => void;
  onComplete: (result: CardResult) => void;
  /** Optional: current slow-speed selection, surfaced by SpeedChip. */
  speed?: Speed;
  onSpeedChange?: (s: Speed) => void;
  /** The "next review in N days" label handed back by the controller (cards only display it). */
  nextReviewLabel?: string | null;
}

/** Cards that capture a recording (pic-review, say, sayit, drill, pron). */
export interface RecordingCardProps extends BaseCardProps {
  onRecordStart: () => void;
  onRecordStop: (recording: Blob | string) => void;
  onPlayCompare?: (which: 'native' | 'you') => void;
}

/** Multiple-choice cards (pic-review, hear, say, phrase/meaning). */
export interface ChoiceCardProps extends BaseCardProps {
  onAnswer: (value: string, correct: boolean) => void;
}

/** Phrase gating cards. */
export interface PhraseGateProps extends BaseCardProps {
  onUnlocked?: () => void; // phrase/unlock fires this then auto-advances
}
