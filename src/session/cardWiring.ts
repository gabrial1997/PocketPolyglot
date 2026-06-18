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

/** How long the 'phrase/unlock' reveal stays on screen before auto-advancing, so "New phrase
 *  unlocked" is actually read (BACKEND_INTEGRATION §4). */
export const UNLOCK_DELAY_MS = 1800;

/**
 * The unlock chime is the one celebratory beat (DECISIONS.md). BACKEND_INTEGRATION §7: a bounced
 * unlock-chime asset ships and is played through AudioService. The asset is now vendored at
 * `content-pipeline/assets/unlock-chime.wav` and uploaded by the seeder to the public
 * `content-audio` bucket at the stable key `sfx/unlock-chime.wav`. The URL below is derived from
 * the public Supabase URL + that key (decoupled from the project ref), so it's `null` only when
 * EXPO_PUBLIC_SUPABASE_URL is unset — in which case the chime is a no-op (reveal + auto-advance
 * still work).
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const UNLOCK_CHIME_URL: string | null = SUPABASE_URL
  ? `${SUPABASE_URL}/storage/v1/object/public/content-audio/sfx/unlock-chime.wav`
  : null;

/** Resolve a card's onPlay(which) request to a concrete audio source. null = nothing to play. */
export function resolvePlay(item: ReviewItem, which: PlayWhich): { url: string; rate?: number } | null {
  if (which === 'native') return item.audio.nativeUrl ? { url: item.audio.nativeUrl } : null;
  if (which === 'slow') {
    const url = item.audio.slowUrl ?? item.audio.nativeUrl;
    return url ? { url, rate: SLOW_RATE } : null;
  }
  if (which === 'glide') {
    // The diphthong "meet the glide" step wants the isolated-glide clip; before that clip is
    // seeded it falls back to the stimulus (native) clip so the orb is never silent.
    const url = item.glide?.audioUrl ?? item.audio.nativeUrl;
    return url ? { url } : null;
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
  // --- Gate cards (phrase/locked, phrase/unlock): NOT reviews — they advance WITHOUT a CardResult.
  /** Advance to the next item without posting a review (phrase/locked's Continue). */
  onAdvance: () => void;
  /**
   * phrase/unlock fired on reveal: play the unlock chime, then auto-advance after a readable delay.
   * Returns a canceller the card MUST call on unmount so a late advance never fires after the card
   * is gone (avoids a state-update-after-unmount warning).
   */
  onUnlocked: () => () => void;
}

/**
 * Holds the take captured by RecorderService between onRecordStop and onComplete/onPlayCompare.
 * The recorder — not the pure card — is the source of truth for the blob/URI (a pure, snapshot-
 * testable card cannot produce real audio data), so the card calls onRecordStop() as a signal.
 * `pending` is the in-flight recorder.stop() so onComplete can await it before submitting.
 */
export interface RecordingStore {
  current: Blob | string | null;
  pending?: Promise<void> | null;
}

export function createCardHandlers(deps: {
  item: ReviewItem;
  audio: AudioService;
  recorder: RecorderService;
  store: RecordingStore;
  submit: (result: CardResult) => void | Promise<void>;
  /** Step to the next item WITHOUT posting a review — the gate-card path (locked/unlock). */
  advance: () => void;
}): CardHandlers {
  const { item, audio, recorder, store, submit, advance } = deps;
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
      store.pending = null;
      void recorder.start();
    },
    onRecordStop: () => {
      store.pending = Promise.resolve(recorder.stop()).then((take) => {
        store.current = take;
      });
    },
    onPlayCompare: (which) => {
      const url = which === 'you' ? store.current : item.audio.nativeUrl;
      if (typeof url === 'string' && url) void audio.play(url);
    },
    onComplete: (result) => {
      // If a recorder.stop() is still in flight, wait for the take so it is never dropped. A
      // failed stop() (mic error / interrupted recording) must NOT deadlock the deck or leak an
      // unhandled rejection — still submit (without a recording) so the session advances.
      const finish = () => submit(withRecording(result, store.current));
      if (store.pending) void store.pending.then(finish, finish);
      else void finish();
    },
    // Gate advance: locked/unlock are NOT reviews — step the deck without touching SRS.
    onAdvance: () => {
      advance();
    },
    onUnlocked: () => {
      // The card owns the chime via AudioService (never an audio context directly). Plays the
      // vendored/uploaded chime when UNLOCK_CHIME_URL resolves; a no-op only if it's null
      // (EXPO_PUBLIC_SUPABASE_URL unset — see its declaration).
      if (UNLOCK_CHIME_URL) void audio.play(UNLOCK_CHIME_URL);
      // Hold the reveal briefly so "New phrase unlocked" is read, then advance (no review posted).
      const timer = setTimeout(advance, UNLOCK_DELAY_MS);
      return () => clearTimeout(timer);
    },
  };
}
