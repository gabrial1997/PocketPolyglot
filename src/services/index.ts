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

export type EditableTable = 'lemmas' | 'phrases' | 'minimal_pairs';
export type QaStatus = 'draft' | 'native_ok' | 'locked';

export interface ContentEditRequest {
  table: EditableTable;
  id: string; // uuid of the row
  /** Field patches — only whitelisted columns for the table are honored server-side. */
  fields?: Partial<Record<'gloss_en' | 'target' | 'usage_note' | 'literal_gloss', string>>;
  qa_status?: QaStatus;
}

/** Founder-only content editor. Reads the founder flag; submits edits via the content-edit Edge Function. */
export interface EditorService {
  /** True iff profiles.settings.editor === true for the signed-in user. */
  isEditor(): Promise<boolean>;
  /** Apply a field/qa_status edit to one content row through the service_role Edge Function. */
  edit(req: ContentEditRequest): Promise<void>;
}

/** A bug report filed from the in-app beta reporter (BugReportLayer). */
export interface BugReportInput {
  description: string;
  /** Coarse screen tag the report was filed from (e.g. 'home', 'session', 'onboarding'). */
  screen?: string;
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  /** Local file uri of the captured screenshot; uploaded best-effort (optional). */
  screenshotUri?: string;
  /** Arbitrary extra diagnostics (jsonb). */
  extra?: Record<string, unknown>;
}

/** Beta tooling: store a tester's bug report (note + optional screenshot + context). */
export interface BugReportService {
  /** Upload the optional screenshot, then insert the report row. Throws only on insert failure. */
  submit(input: BugReportInput): Promise<void>;
}

/** A minimal projection of the user's profile row that onboarding needs. */
export interface ProfileSnapshot {
  recConsent: boolean;
  trainingConsent: boolean;
  seenDiacritics: boolean;
}

/** Tier-B `settings` screen: GDPR recording consent + deletion (CLAUDE.md). NOT a card. */
export interface ProfileService {
  /** Current GDPR recording-consent flag for the signed-in user. */
  getRecConsent(): Promise<boolean>;
  /** Set the consent flag; stamps rec_consent_at when enabling, clears it when disabling. */
  setRecConsent(value: boolean): Promise<void>;
  /** Honor GDPR deletion: remove all of the user's recording rows. */
  deleteRecordings(): Promise<void>;
  /** Read rec_consent, training_consent, and settings.seenDiacritics for the signed-in user.
   *  Returns null when no profile row exists yet. */
  getProfile(): Promise<ProfileSnapshot | null>;
  /** Insert the user's own profile row if missing (fallback for pre-trigger accounts). Idempotent. */
  ensureProfile(): Promise<void>;
  /** Mark that the user has seen the diacritics intro. Merges seenDiacritics=true into settings
   *  WITHOUT clobbering other keys (esp. settings.editor — Module F's gate). */
  setSeenDiacritics(): Promise<void>;
  /** Onboarding write: set both rec_consent + training_consent in one update, stamping/clearing
   *  rec_consent_at. Keep setRecConsent for the Settings tab (single flag). */
  setConsent(input: { rec: boolean; training: boolean }): Promise<void>;
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
  /** Founder-only content editor (Module F). */
  editor: EditorService;
  /** Beta tooling: in-app bug reporter. */
  bugReport: BugReportService;
}

export * from './stubs';
export * from './ServiceProvider';
export * from './EditorProvider';
export { supabase } from './supabaseClient';
export * from './supabase';
