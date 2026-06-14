// Service interfaces + the ServiceBundle injected via context (BACKEND_INTEGRATION §5).
// Cards receive ONLY the *results* of these (e.g. a "next review in 5 days" string),
// never the service instances — that keeps cards pure and snapshot-testable.
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';

/** Playback. Cards call this via their onPlay callbacks; the orb visual follows the promise. */
export interface AudioService {
  play(url: string, opts?: { rate?: number }): Promise<void>;
  stop(): Promise<void>;
  isPlaying(): boolean;
}

/** Recording. Backs MicOrb. Handles mic permission. */
export interface RecorderService {
  start(): Promise<void>;
  stop(): Promise<Blob | string>; // returns blob (web) or file URI (native)
  isRecording(): boolean;
}

/** SRS. Lives in the controller, NOT the card. */
export interface SrsService {
  getDueBatch(): Promise<ReviewItem[]>;
  submit(result: CardResult): Promise<{ nextReviewLabel: string }>;
  /** Tier-B home summary (WIRING_MAP §3). */
  getDueSummary(): Promise<{ newCount: number; reviewCount: number }>;
}

/** Set of known lemma ids — gates phrase unlocking (BACKEND_INTEGRATION §5). */
export interface KnownWordsStore {
  has(lemmaId: string): boolean;
  all(): ReadonlySet<string>;
  refresh(): Promise<void>;
}

/** Everything injected through ServiceProvider. */
export interface ServiceBundle {
  audio: AudioService;
  recorder: RecorderService;
  srs: SrsService;
  known: KnownWordsStore;
}

export * from './stubs';
export * from './ServiceProvider';
export { supabase } from './supabaseClient';
