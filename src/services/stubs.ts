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
  PodcastService,
  ProfileService,
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
  async getCoverage(): Promise<{ known: number; total: number }> {
    return { known: 0, total: 1000 }; // real impl: known_lemmas count vs core list (schema §3)
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
  async getRecConsent(): Promise<boolean> {
    return this.consent;
  }
  async setRecConsent(value: boolean): Promise<void> {
    this.consent = value;
  }
  async deleteRecordings(): Promise<void> {
    // real impl: delete recordings rows + storage objects for the user (schema §6)
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
  };
}
