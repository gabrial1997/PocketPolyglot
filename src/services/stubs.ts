// Stub service implementations — no-op / in-memory placeholders so the app boots and the
// boundary is exercised before real wiring. Replace each with Expo-audio / Supabase-backed
// impls (BACKEND_INTEGRATION §5, database-schema-seed §5). Cards never see these directly.
import type {
  AudioService,
  PlaybackStatus,
  RecorderService,
  SrsService,
  KnownWordsStore,
  ProgressService,
  ProgressCoverage,
  PodcastService,
  ProfileService,
  ProfileSnapshot,
  EditorService,
  ContentEditRequest,
  BugReportService,
  BugReportInput,
  ServiceBundle,
} from './index';
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';

export class StubAudioService implements AudioService {
  private playing = false;
  private listeners = new Set<(s: PlaybackStatus) => void>();
  async play(_url: string, _opts?: { rate?: number }): Promise<void> {
    this.playing = true;
    this.emit({ playing: true, positionMs: 0, durationMs: 0 });
  }
  async stop(): Promise<void> {
    this.playing = false;
    this.emit({ playing: false, positionMs: 0, durationMs: 0 });
  }
  isPlaying(): boolean {
    return this.playing;
  }
  preload(_url: string): void {
    /* no-op: nothing to warm in the stub (web preview / tests) */
  }
  subscribe(listener: (s: PlaybackStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Test/dev helper: push an arbitrary status to subscribers. Not part of AudioService.
   *  durationMs is deliberately 0 in play() so usePlayClip uses its timer fallback (web preview). */
  emitStatus(s: PlaybackStatus): void {
    this.emit(s);
  }
  private emit(s: PlaybackStatus): void {
    for (const l of this.listeners) l(s);
  }
}

export class StubRecorderService implements RecorderService {
  private recording = false;
  async start(): Promise<void> {
    this.recording = true;
  }
  async stop(): Promise<Blob | string> {
    this.recording = false;
    return 'stub://recording'; // placeholder URI
  }
  isRecording(): boolean {
    return this.recording;
  }
}

export class StubSrsService implements SrsService {
  async getDueBatch(): Promise<ReviewItem[]> {
    return []; // real impl: select from review_state where due_at <= now (schema §5)
  }
  async submit(_result: CardResult): Promise<{ nextReviewLabel: string; rung: import('../session/ladder').Rung }> {
    return { nextReviewLabel: 'First review tomorrow', rung: 'recognition' };
  }
  async getDueSummary(): Promise<{ newCount: number; reviewCount: number }> {
    return { newCount: 0, reviewCount: 0 };
  }
}

export class StubKnownWordsStore implements KnownWordsStore {
  private ids = new Set<string>();
  has(lemmaId: string): boolean {
    return this.ids.has(lemmaId);
  }
  all(): ReadonlySet<string> {
    return this.ids;
  }
  async refresh(): Promise<void> {
    // real impl: select from known_lemmas view (schema §3)
  }
}

export class StubProgressService implements ProgressService {
  async getCoverage(): Promise<ProgressCoverage> {
    return { total: 1000, knownRanks: [] }; // real impl: known_lemmas ranks vs core list (schema §3)
  }
}

export class StubPodcastService implements PodcastService {
  async getEpisode(): Promise<{ title: string; transcript: string; audioUrl: string }> {
    // real impl: PodcastService builds an episode from the known-word set (WIRING_MAP §3).
    return { title: 'Today’s episode', transcript: '', audioUrl: 'stub://episode' };
  }
}

export class StubProfileService implements ProfileService {
  private consent = false;
  private trainingConsent = false;
  private seenDiacritics = false;

  async getRecConsent(): Promise<boolean> {
    return this.consent;
  }
  async setRecConsent(value: boolean): Promise<void> {
    this.consent = value;
  }
  async deleteRecordings(): Promise<void> {
    // real impl: delete recordings rows + storage objects for the user (schema §6)
  }

  // D1b: getProfile + ensureProfile
  async getProfile(): Promise<ProfileSnapshot | null> {
    return {
      recConsent: this.consent,
      trainingConsent: this.trainingConsent,
      seenDiacritics: this.seenDiacritics,
    };
  }
  async ensureProfile(): Promise<void> {
    // no-op: stub has no DB row to create
  }

  // D2a: setSeenDiacritics (settings-merge, editor-safe — in-memory only for stub)
  async setSeenDiacritics(): Promise<void> {
    this.seenDiacritics = true;
  }

  // D3a: setConsent (rec + training)
  async setConsent(input: { rec: boolean; training: boolean }): Promise<void> {
    this.consent = input.rec;
    this.trainingConsent = input.training;
  }

  // D4: deleteAccount (Apple-mandated in-app deletion)
  async deleteAccount(): Promise<void> {
    // real impl: call the delete_account RPC (migration 0018)
  }
}

export class StubEditorService implements EditorService {
  // Stub never grants editor rights.
  async isEditor(): Promise<boolean> {
    return false;
  }
  // Stub must never silently no-op a content write — reject loudly.
  async edit(_req: ContentEditRequest): Promise<void> {
    return Promise.reject(new Error('editor: stub cannot write content'));
  }
}

export class StubBugReportService implements BugReportService {
  /** Records the last submitted report so tests/dev can assert without a backend. */
  public last: BugReportInput | null = null;
  async submit(input: BugReportInput): Promise<void> {
    this.last = input;
  }
}

/** Default bundle of stubs for local dev / tests. */
export function createStubServices(): ServiceBundle {
  return {
    audio: new StubAudioService(),
    recorder: new StubRecorderService(),
    srs: new StubSrsService(),
    known: new StubKnownWordsStore(),
    progress: new StubProgressService(),
    podcast: new StubPodcastService(),
    profile: new StubProfileService(),
    editor: new StubEditorService(),
    bugReport: new StubBugReportService(),
  };
}
