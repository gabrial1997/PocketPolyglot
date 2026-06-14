// Stub service implementations — no-op / in-memory placeholders so the app boots and the
// boundary is exercised before real wiring. Replace each with Expo-audio / Supabase-backed
// impls (BACKEND_INTEGRATION §5, database-schema-seed §5). Cards never see these directly.
import type {
  AudioService,
  RecorderService,
  SrsService,
  KnownWordsStore,
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

/** Default bundle of stubs for local dev / tests. */
export function createStubServices(): ServiceBundle {
  return {
    audio: new StubAudioService(),
    recorder: new StubRecorderService(),
    srs: new StubSrsService(),
    known: new StubKnownWordsStore(),
  };
}
