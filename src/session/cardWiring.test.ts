// Unit tests for the card<->service wiring (the data-in/events-out boundary, BACKEND_INTEGRATION
// §5). These prove the core loop reaches every injected service WITHOUT rendering: pure logic,
// same style as renderFor.test.ts. Fakes stand in for AudioService/RecorderService/SrsService.
import {
  resolvePlay,
  withRecording,
  createCardHandlers,
  SLOW_RATE,
  UNLOCK_CHIME_URL,
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
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
    ...overrides,
  };
}

// Hand-rolled fakes (real behavior, not jest.fn mocks of a module) that record their calls.
function fakeAudio() {
  const calls: { url: string; opts?: { rate?: number } }[] = [];
  const preloads: string[] = [];
  let stops = 0;
  const audio: AudioService = {
    async play(url, opts) {
      calls.push({ url, opts });
    },
    async stop() {
      stops += 1;
    },
    isPlaying() {
      return false;
    },
    preload(url) {
      preloads.push(url);
    },
    subscribe() {
      return () => {};
    },
  };
  return { audio, calls, preloads, stops: () => stops };
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
  it('glide -> the isolated-glide clip when present', () => {
    const it2 = item({ glide: { combo: 'ie', from: 'i', to: 'e', audioUrl: 'glide-ie.mp3' } });
    expect(resolvePlay(it2, 'glide')).toEqual({ url: 'glide-ie.mp3' });
  });
  it('glide falls back to the native url when the glide has no clip', () => {
    const it2 = item({ glide: { combo: 'ie', from: 'i', to: 'e' } });
    expect(resolvePlay(it2, 'glide')).toEqual({ url: 'native.mp3' });
  });
  it('glide -> null when there is neither a glide clip nor a native url', () => {
    expect(resolvePlay(item({ glide: { combo: 'ie', from: 'i', to: 'e' }, audio: { nativeUrl: '' } }), 'glide')).toBeNull();
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
    const { audio, calls, preloads, stops } = fakeAudio();
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
      advance: () => undefined,
    });
    return { handlers, calls, preloads, stops, events, store, submitted };
  }

  it('onStop stops the injected audio service', () => {
    const { handlers, stops } = setup();
    handlers.onStop();
    expect(stops()).toBe(1);
  });

  it('onPlay passes a rate override through to audio.play (SpeedChip slow)', () => {
    const { handlers, calls } = setup();
    handlers.onPlay('native', 0.7);
    expect(calls).toEqual([{ url: 'native.mp3', opts: { rate: 0.7 } }]);
  });

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

  it('onPreload("native") warms the native clip without playing it (bug 1)', () => {
    const { handlers, preloads, calls } = setup();
    handlers.onPreload('native');
    expect(preloads).toEqual(['native.mp3']);
    expect(calls).toEqual([]); // preload must not start playback
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

  it('onAdvance calls the injected advance() without submitting a review', () => {
    const { audio } = fakeAudio();
    const { recorder } = fakeRecorder();
    const store: RecordingStore = { current: null };
    const submitted: CardResult[] = [];
    let advanced = 0;
    const handlers = createCardHandlers({
      item: item(),
      audio,
      recorder,
      store,
      submit: (r) => {
        submitted.push(r);
      },
      advance: () => {
        advanced += 1;
      },
    });
    handlers.onAdvance();
    expect(advanced).toBe(1);
    expect(submitted).toHaveLength(0);
  });

  it('onUnlocked plays the unlock chime (when configured), advances after the readable delay, and never submits a review', () => {
    jest.useFakeTimers();
    try {
      const { audio, calls } = fakeAudio();
      const { recorder } = fakeRecorder();
      const store: RecordingStore = { current: null };
      const submitted: CardResult[] = [];
      let advanced = 0;
      const handlers = createCardHandlers({
        item: item(),
        audio,
        recorder,
        store,
        submit: (r) => {
          submitted.push(r);
        },
        advance: () => {
          advanced += 1;
        },
      });

      const cancel = handlers.onUnlocked();
      // The chime is the one celebratory beat: when UNLOCK_CHIME_URL resolves (env set) it plays
      // exactly once; when it's null (env unset) there's no play. Either way advance is deferred,
      // not immediate. Branching on the imported const keeps this deterministic in any jest env.
      if (UNLOCK_CHIME_URL) {
        expect(calls).toEqual([{ url: UNLOCK_CHIME_URL, opts: undefined }]);
      } else {
        expect(calls).toHaveLength(0);
      }
      expect(advanced).toBe(0);

      jest.advanceTimersByTime(2000);
      expect(advanced).toBe(1);
      expect(submitted).toHaveLength(0);

      // The returned canceller clears the pending timer (used on unmount).
      expect(typeof cancel).toBe('function');
    } finally {
      jest.useRealTimers();
    }
  });

  it('onUnlocked returns a canceller that prevents a late advance after unmount', () => {
    jest.useFakeTimers();
    try {
      const { audio } = fakeAudio();
      const { recorder } = fakeRecorder();
      const store: RecordingStore = { current: null };
      let advanced = 0;
      const handlers = createCardHandlers({
        item: item(),
        audio,
        recorder,
        store,
        submit: () => undefined,
        advance: () => {
          advanced += 1;
        },
      });

      const cancel = handlers.onUnlocked();
      cancel(); // unmounted before the delay elapsed
      jest.advanceTimersByTime(5000);
      expect(advanced).toBe(0);
    } finally {
      jest.useRealTimers();
    }
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
      advance: () => undefined,
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

describe('onUnlocked haptics', () => {
  it('fires the unlock haptic alongside the chime', () => {
    jest.useFakeTimers();
    try {
      const { audio } = fakeAudio();
      const unlock = jest.fn();
      const store: RecordingStore = { current: null };
      const handlers = createCardHandlers({
        item: item(),
        audio,
        recorder: fakeRecorder().recorder,
        store,
        submit: jest.fn(),
        advance: jest.fn(),
        haptics: { unlock },
      });
      const cancel = handlers.onUnlocked();
      expect(unlock).toHaveBeenCalledTimes(1);
      cancel();
    } finally {
      jest.useRealTimers();
    }
  });

  it('omitting the haptics dep is safe (logic callers, older tests)', () => {
    jest.useFakeTimers();
    try {
      const { audio } = fakeAudio();
      const store: RecordingStore = { current: null };
      const handlers = createCardHandlers({
        item: item(),
        audio,
        recorder: fakeRecorder().recorder,
        store,
        submit: jest.fn(),
        advance: jest.fn(),
      });
      expect(() => handlers.onUnlocked()()).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
});
