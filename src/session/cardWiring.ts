// Card <-> service wiring — the controller side of the data-in/events-out boundary
// (BACKEND_INTEGRATION §1, §5). Cards stay pure: they emit events; THIS maps those events onto
// the injected AudioService / RecorderService and assembles the CardResult posted to SrsService.
//
// Kept as pure functions (no React) so the whole boundary is unit-testable in node, exactly like
// renderFor(). The thin React adapter is useReviewCardHandlers (composes this with useServices).
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';
import type { PlayWhich } from '../screens/cardProps';
import type { AudioService, RecorderService } from '../services';

/** Slow-replay rate for the SpeedChip "slow" mode. */
export const SLOW_RATE = 0.7;

/** Resolve a card's onPlay(which) request to a concrete audio source. null = nothing to play. */
export function resolvePlay(item: ReviewItem, which: PlayWhich): { url: string; rate?: number } | null {
  if (which === 'native') return item.audio.nativeUrl ? { url: item.audio.nativeUrl } : null;
  if (which === 'slow') {
    const url = item.audio.slowUrl ?? item.audio.nativeUrl;
    return url ? { url, rate: SLOW_RATE } : null;
  }
  // number = example index (function learn card).
  const url = item.examples?.[which]?.audioUrl;
  return url ? { url } : null;
}

/** Merge the captured recording into the card's result before it goes to SRS. */
export function withRecording(result: CardResult, recording: Blob | string | null): CardResult {
  return recording != null ? { ...result, recording } : result;
}

/** The callback bundle a Tier-A card receives. Cards never see the services behind it. */
export interface CardHandlers {
  onPlay: (which: PlayWhich) => void;
  onAnswer: (value: string, correct: boolean) => void;
  onRecordStart: () => void;
  onRecordStop: (recording?: Blob | string) => void;
  onPlayCompare: (which: 'native' | 'you') => void;
  onComplete: (result: CardResult) => void;
}

/**
 * Holds the take captured by RecorderService between onRecordStop and onComplete/onPlayCompare.
 * The recorder — not the pure card — is the source of truth for the blob/URI (a pure, snapshot-
 * testable card cannot produce real audio data), so the card calls onRecordStop() as a signal.
 */
export interface RecordingStore {
  current: Blob | string | null;
}

export function createCardHandlers(deps: {
  item: ReviewItem;
  audio: AudioService;
  recorder: RecorderService;
  store: RecordingStore;
  submit: (result: CardResult) => void | Promise<void>;
}): CardHandlers {
  const { item, audio, recorder, store, submit } = deps;
  return {
    onPlay: (which) => {
      const p = resolvePlay(item, which);
      if (p) void audio.play(p.url, p.rate != null ? { rate: p.rate } : undefined);
    },
    onAnswer: () => {
      // Distractors are pre-supplied in item.choices, so an answer needs no service call here;
      // first-try correctness is tracked in the card's local state and arrives via onComplete.
    },
    onRecordStart: () => {
      store.current = null; // drop any prior take before a new attempt
      void recorder.start();
    },
    onRecordStop: () => {
      void Promise.resolve(recorder.stop()).then((take) => {
        store.current = take;
      });
    },
    onPlayCompare: (which) => {
      const url = which === 'you' ? store.current : item.audio.nativeUrl;
      if (typeof url === 'string' && url) void audio.play(url);
    },
    onComplete: (result) => {
      void submit(withRecording(result, store.current));
    },
  };
}
