// Stub service implementations — no-op / in-memory placeholders so the app boots and the
// boundary is exercised before real wiring. Replace each with Expo-audio / Supabase-backed
// impls (BACKEND_INTEGRATION §5, database-schema-seed §5). Cards never see these directly.
import type {
  AudioService,
  RecorderService,
  SrsService,
  KnownWordsStore,
  ProgressService,
  PodcastService,
  ServiceBundle,
} from './index';
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';

export class StubAudioService implements AudioService {
  private playing = false;
  async play(_url: string, _opts?: { rate?: number }): Promise<void> {
    this.playing = true;
  }
  async stop(): Promise<void> {
    this.playing = false;
  }
  isPlaying(): boolean {
    return this.playing;
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
  async submit(_result: CardResult): Promise<{ nextReviewLabel: string }> {
    return { nextReviewLabel: 'First review tomorrow' };
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

/** Default bundle of stubs for local dev / tests. */
export function createStubServices(): ServiceBundle {
  return {
    audio: new StubAudioService(),
    recorder: new StubRecorderService(),
    srs: new StubSrsService(),
    known: new StubKnownWordsStore(),
    progress: new StubProgressService(),
    podcast: new StubPodcastService(),
  };
}
