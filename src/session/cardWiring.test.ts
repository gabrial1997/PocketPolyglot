// Unit tests for the card<->service wiring (the data-in/events-out boundary, BACKEND_INTEGRATION
// §5). These prove the core loop reaches every injected service WITHOUT rendering: pure logic,
// same style as renderFor.test.ts. Fakes stand in for AudioService/RecorderService/SrsService.
import {
  resolvePlay,
  withRecording,
  createCardHandlers,
  SLOW_RATE,
  type RecordingStore,
} from './cardWiring';
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';
import type { AudioService, RecorderService } from '../services';

function item(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'maja',
    type: 'word',
    stage: 'review',
    reps: 3,
    target: 'māja',
    gloss: 'house',
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3' },
    media: { imageUrl: 'house.png' },
    choices: [
      { value: 'māja', gloss: 'house', correct: true },
      { value: 'maize', gloss: 'bread', correct: false },
    ],
    ...overrides,
  };
}

// Hand-rolled fakes (real behavior, not jest.fn mocks of a module) that record their calls.
function fakeAudio() {
  const calls: { url: string; opts?: { rate?: number } }[] = [];
  const audio: AudioService = {
    async play(url, opts) {
      calls.push({ url, opts });
    },
    async stop() {},
    isPlaying() {
      return false;
    },
  };
  return { audio, calls };
}

function fakeRecorder(blob: Blob | string = 'rec://abc') {
  const events: string[] = [];
  const recorder: RecorderService = {
    async start() {
      events.push('start');
    },
    async stop() {
      events.push('stop');
      return blob;
    },
    isRecording() {
      return false;
    },
  };
  return { recorder, events };
}

describe('resolvePlay', () => {
  it('native -> the native url, no rate', () => {
    expect(resolvePlay(item(), 'native')).toEqual({ url: 'native.mp3' });
  });
  it('slow -> the slow url at SLOW_RATE', () => {
    expect(resolvePlay(item(), 'slow')).toEqual({ url: 'slow.mp3', rate: SLOW_RATE });
  });
  it('slow falls back to native when no slowUrl', () => {
    expect(resolvePlay(item({ audio: { nativeUrl: 'native.mp3' } }), 'slow')).toEqual({
      url: 'native.mp3',
      rate: SLOW_RATE,
    });
  });
  it('number -> the matching example audio url', () => {
    const it2 = item({
      examples: [
        { pre: '', w: 'uz', post: '', en: '', audioUrl: 'ex0.mp3' },
        { pre: '', w: 'uz', post: '', en: '', audioUrl: 'ex1.mp3' },
      ],
    });
    expect(resolvePlay(it2, 1)).toEqual({ url: 'ex1.mp3' });
  });
  it('number with no such example -> null', () => {
    expect(resolvePlay(item(), 2)).toBeNull();
  });
});

describe('withRecording', () => {
  const base: CardResult = { itemId: 'maja', cardKind: 'word/pic-review', correct: true, spoke: true };
  it('merges a captured recording', () => {
    expect(withRecording(base, 'rec://abc')).toEqual({ ...base, recording: 'rec://abc' });
  });
  it('leaves the result unchanged when there is no recording', () => {
    expect(withRecording(base, null)).toEqual(base);
  });
});

describe('createCardHandlers — the core loop reaches every service', () => {
  function setup() {
    const { audio, calls } = fakeAudio();
    const { recorder, events } = fakeRecorder('rec://take1');
    const store: RecordingStore = { current: null };
    const submitted: CardResult[] = [];
    const handlers = createCardHandlers({
      item: item(),
      audio,
      recorder,
      store,
      submit: (r) => {
        submitted.push(r);
      },
    });
    return { handlers, calls, events, store, submitted };
  }

  it('onPlay("native") plays the native audio', () => {
    const { handlers, calls } = setup();
    handlers.onPlay('native');
    expect(calls).toEqual([{ url: 'native.mp3', opts: undefined }]);
  });

  it('onPlay("slow") plays the slow audio at SLOW_RATE', () => {
    const { handlers, calls } = setup();
    handlers.onPlay('slow');
    expect(calls).toEqual([{ url: 'slow.mp3', opts: { rate: SLOW_RATE } }]);
  });

  it('onRecordStart starts the recorder and clears any prior take', () => {
    const { handlers, events, store } = setup();
    store.current = 'rec://stale';
    handlers.onRecordStart();
    expect(events).toEqual(['start']);
    expect(store.current).toBeNull();
  });

  it('onRecordStop stops the recorder and captures the take', async () => {
    const { handlers, events, store } = setup();
    handlers.onRecordStop();
    await store.pending; // let recorder.stop() resolve and the take be stored
    expect(events).toEqual(['stop']);
    expect(store.current).toBe('rec://take1');
  });

  it('onPlayCompare("you") plays the captured take; ("native") plays the native audio', () => {
    const { handlers, calls, store } = setup();
    store.current = 'rec://take1';
    handlers.onPlayCompare('you');
    handlers.onPlayCompare('native');
    expect(calls).toEqual([{ url: 'rec://take1', opts: undefined }, { url: 'native.mp3', opts: undefined }]);
  });

  it('onComplete submits the result with the captured recording merged in', () => {
    const { handlers, store, submitted } = setup();
    store.current = 'rec://take1';
    handlers.onComplete({ itemId: 'maja', cardKind: 'word/pic-review', correct: false, spoke: true });
    expect(submitted).toEqual([
      { itemId: 'maja', cardKind: 'word/pic-review', correct: false, spoke: true, recording: 'rec://take1' },
    ]);
  });

  it('onComplete waits for an in-flight recorder.stop() so the take is never dropped', async () => {
    const { audio } = fakeAudio();
    let resolveStop!: (take: string) => void;
    const recorder: RecorderService = {
      async start() {},
      stop: () => new Promise<string>((res) => (resolveStop = res)),
      isRecording: () => false,
    };
    const store: RecordingStore = { current: null };
    const submitted: CardResult[] = [];
    const handlers = createCardHandlers({
      item: item(),
      audio,
      recorder,
      store,
      submit: (r) => {
        submitted.push(r);
      },
    });

    handlers.onRecordStop(); // stop is in flight, not resolved yet
    handlers.onComplete({ itemId: 'maja', cardKind: 'word/pic-review', correct: true, spoke: true });
    expect(submitted).toHaveLength(0); // must not submit before the take is captured

    resolveStop('rec://late');
    await store.pending; // the stop resolves and the take is stored
    await Promise.resolve(); // let onComplete's continuation run
    expect(submitted).toEqual([
      { itemId: 'maja', cardKind: 'word/pic-review', correct: true, spoke: true, recording: 'rec://late' },
    ]);
  });
});
