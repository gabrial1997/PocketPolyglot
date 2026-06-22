// Shared card prop shapes — the data-in / events-out boundary (BACKEND_INTEGRATION §1, §4).
// Every Tier-A card takes { item, ...callbacks }. Cards NEVER import services — the controller
// injects behaviour through these callbacks. Cards own ONLY ephemeral UI state.
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';
import type { Speed } from '../components';

/**
 * Which audio variant to play. (number = example index for the function learn card.)
 * 'glide' = the isolated-glide clip played by the diphthong drill's "meet the glide" step.
 */
export type PlayWhich = 'native' | 'slow' | 'glide' | number;

/** Base props common to every Tier-A card. */
export interface BaseCardProps {
  item: ReviewItem;
  /** Play a clip. An explicit `rate` (the SpeedChip selection) overrides the default. */
  onPlay: (which: PlayWhich, rate?: number) => void;
  /** Stop current playback — backs the PlayOrb play/pause toggle. */
  onStop?: () => void;
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
  /**
   * Signal that recording stopped. The injected RecorderService produces the actual take
   * (a pure card cannot), so the card calls this with no argument; the controller captures the
   * recording and merges it into the CardResult (see session/cardWiring.ts).
   */
  onRecordStop: (recording?: Blob | string) => void;
  /** Play a compare clip. An explicit `rate` (the SpeedChip) slows the native model only. */
  onPlayCompare?: (which: 'native' | 'you', rate?: number) => void;
}

/** Multiple-choice cards (pic-review, hear, say, phrase/meaning). */
export interface ChoiceCardProps extends BaseCardProps {
  onAnswer: (value: string, correct: boolean) => void;
}

/**
 * Phrase gating cards (phrase/locked, phrase/unlock). These are NOT reviews — they advance the
 * deck WITHOUT a CardResult. The controller wires the advance behind these callbacks.
 */
export interface PhraseGateProps extends BaseCardProps {
  /** phrase/locked's Continue: advance past the locked glimpse without posting a review. */
  onAdvance?: () => void;
  /**
   * phrase/unlock fires this on reveal; the controller plays the chime then auto-advances.
   * Returns a canceller the card runs on unmount (as a useEffect cleanup) so a late auto-advance
   * never fires after the card is gone. May return void when there is nothing to cancel.
   */
  onUnlocked?: () => (() => void) | void;
}
