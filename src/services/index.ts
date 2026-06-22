// Service interfaces + the ServiceBundle injected via context (BACKEND_INTEGRATION §5).
// Cards receive ONLY the *results* of these (e.g. a "next review in 5 days" string),
// never the service instances — that keeps cards pure and snapshot-testable.
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';
import type { PlaybackStatus } from '../types/playback';
import type { Rung } from '../session/ladder';

export type { PlaybackStatus } from '../types/playback';

/** Playback. Cards call this via their onPlay callbacks; the orb visual follows the promise. */
export interface AudioService {
  play(url: string, opts?: { rate?: number }): Promise<void>;
  stop(): Promise<void>;
  isPlaying(): boolean;
  /** Warm a player for `url` so the next play(url) starts without a load/decode stall. Idempotent. */
  preload(url: string): void;
  /** Subscribe to live playback status (position/duration/playing). Returns an unsubscribe fn.
   *  Used by the controller-side PlaybackProvider to feed the soundbar — cards never call this. */
  subscribe(listener: (status: PlaybackStatus) => void): () => void;
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
  /** Returns the next-review label and the derived post-retrieval rung (graduation floor, C4). */
  submit(result: CardResult): Promise<{ nextReviewLabel: string; rung: Rung }>;
  /** Tier-B home summary (WIRING_MAP §3). */
  getDueSummary(): Promise<{ newCount: number; reviewCount: number }>;
}

/** Set of known lemma ids — gates phrase unlocking (BACKEND_INTEGRATION §5). */
export interface KnownWordsStore {
  has(lemmaId: string): boolean;
  all(): ReadonlySet<string>;
  refresh(): Promise<void>;
}

/** Tier-B `prog` screen: coverage of the ~1,000 core words (WIRING_MAP §3). NOT a card. */
export interface ProgressService {
  getCoverage(): Promise<{ known: number; total: number }>;
}

/** Tier-B `pod` screen: a generated episode built from the known-word set (WIRING_MAP §3). */
export interface PodcastService {
  getEpisode(): Promise<{ title: string; transcript: string; audioUrl: string }>;
}

/** Tier-B `settings` screen: GDPR recording consent + deletion (CLAUDE.md). NOT a card. */
export interface ProfileService {
  /** Current GDPR recording-consent flag for the signed-in user. */
  getRecConsent(): Promise<boolean>;
  /** Set the consent flag; stamps rec_consent_at when enabling, clears it when disabling. */
  setRecConsent(value: boolean): Promise<void>;
  /** Honor GDPR deletion: remove all of the user's recording rows. */
  deleteRecordings(): Promise<void>;
}

/** Everything injected through ServiceProvider. */
export interface ServiceBundle {
  audio: AudioService;
  recorder: RecorderService;
  srs: SrsService;
  known: KnownWordsStore;
  /** Tier-B standalone-screen services (home reuses srs.getDueSummary). */
  progress: ProgressService;
  podcast: PodcastService;
  /** Tier-B settings screen: GDPR consent + recording deletion. */
  profile: ProfileService;
}

export * from './stubs';
export * from './ServiceProvider';
export { supabase } from './supabaseClient';
export * from './supabase';
