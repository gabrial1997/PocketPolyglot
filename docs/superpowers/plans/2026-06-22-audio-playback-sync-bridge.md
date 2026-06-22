# Audio Playback Sync Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge the real audio playback position/status from `ExpoAudioService` into the card UI so the soundbar tracks the actual voice (bug 2), animations scale with playback rate (bug 5), the PlayOrb is a true play/pause toggle (bug 3), and the first-play latency is reduced via preload (bug 1).

**Architecture:** `ExpoAudioService` already owns real playback control (position, `didJustFinish`, pitch-corrected rate) but the cards never see it — `usePlayClip` drives the soundbar on a blind 1×-only timer. We add a publish/subscribe `subscribe()` surface to `AudioService`, expose the live status to cards through a **read-model React context** (`PlaybackContext`) populated on the controller side from `audio.subscribe` — analogous to `useTheme`, NOT a service instance, so the pure-card boundary holds. `usePlayClip` reads that context: when real audio with a known duration is playing it drives `playing`+`positionMs` from the real stream; otherwise it falls back to a rate-scaled timer (tests / stub / web preview). `LiveWaveform` interpolates between real position anchors with its existing rAF loop, scaled by rate. A new `onStop` event makes the orb a play/pause toggle, and an `AudioService.preload()` warms the next clip.

**Tech Stack:** Expo / React Native (TypeScript), `expo-audio` (SDK 54), Jest (ts-jest "logic" project for node-side services/wiring; `@testing-library/react-native` + fake timers for hooks/components).

## Global Constraints

- **The pure-card boundary is sacred (CLAUDE.md "do not break this"):** cards never import a service (`AudioService`, `RecorderService`, `SrsService`, `KnownWordsStore`). Services are injected via context/props; cards are data-in / events-out. `PlaybackContext` is a UI **read-model** (a plain status value), not a service — cards/`usePlayClip` may read it exactly as they read `useTheme`. The context is *populated* on the controller side (which may use `useServices`).
- **Live audio visualizer (CLAUDE.md):** the waveform must move with the real audio amplitude (precomputed envelope synced to playback position) — never a static/timer fill that fabricates motion. When no real amplitude/position is available, ease honestly to rest; do not fake motion.
- **`expo-audio` `AudioStatus` units are SECONDS:** `status.currentTime` and `status.duration` are in seconds → multiply by 1000 for `positionMs`/`durationMs`. (`status.playing`, `status.didJustFinish` are booleans.)
- **Preserve the `gen` race guard:** `ExpoAudioService` uses a monotonic `gen` token so two fire-and-forget taps never leave two players sounding (the "multiple voices" device bug). Every change must keep exactly one live player and must not emit status for a superseded player. The existing test `ExpoAudioService.test.ts` must stay green.
- **TypeScript everywhere; no `any` in card/controller contracts.** Keep `lint`, `typecheck`, `test`, `build` green on every commit.
- **Frame size constant:** envelope frames are spaced `FRAME_MS = 30` ms of **media** time (must match `content-pipeline/tts.mjs`). `clipMs(envelope) = envelope.length * 30 + 200` (200 ms tail), fallback `1600` ms.
- **`SLOW_RATE = 0.7`** is the existing slow-replay rate (`cardWiring.ts`).

---

## File Structure

- `src/types/playback.ts` (**new**) — the neutral `PlaybackStatus` type shared by the service layer and the UI context (avoids a components→services type import).
- `src/services/index.ts` (modify) — add `subscribe()` to `AudioService`, re-export `PlaybackStatus`.
- `src/services/device/ExpoAudioService.ts` (modify) — listener set + emit real status; gen-guarded.
- `src/services/stubs.ts` (modify) — `StubAudioService.subscribe()` + `emitStatus()` test helper.
- `src/components/PlaybackContext.tsx` (**new**) — `PlaybackStatusContext` + `usePlaybackStatus()` read-model hook (inert default).
- `src/session/PlaybackProvider.tsx` (**new**) — controller-side provider that subscribes to `audio` and feeds the context.
- `src/components/usePlayClip.ts` (modify) — read the context; real-position vs rate-scaled-timer; return `positionMs` + `rate`.
- `src/components/LiveWaveform.tsx` (modify) — optional `positionMs` anchor + `rate`; rAF interpolation.
- `src/session/cardWiring.ts` (modify) — `onStop` handler; `onPlay(which, rate?)` rate override.
- `src/screens/cardProps.ts` (modify) — add `onStop?` to `BaseCardProps`; widen `onPlay` signature.
- `src/session/useReviewCardHandlers.ts` — no change (handlers flow through unchanged).
- `src/navigation/index.tsx` (modify) — mount `PlaybackProvider`; spread `onStop` onto cards.
- Card screens (modify, mechanical): `WordHear`, `PhraseHear`, `WordSay`, `WordLearnConcrete`, `WordLearnFunction`, `WordLearnAbstract`, `WordPicReview`, `PhraseMeaning`, `DrillScreen`, `DiphthongDrillScreen`, `PronounceScreen` — pass `positionMs`+`rate` to `LiveWaveform`; SpeedChip→rate; orb play/pause toggle.

---

### Task 1: Playback status in the service layer

**Files:**
- Create: `src/types/playback.ts`
- Modify: `src/services/index.ts:8-12` (AudioService interface), add re-export
- Modify: `src/services/device/ExpoAudioService.ts`
- Modify: `src/services/stubs.ts:16-27` (StubAudioService)
- Test: `src/services/device/ExpoAudioService.test.ts` (extend)

**Interfaces:**
- Produces:
  - `PlaybackStatus = { playing: boolean; positionMs: number; durationMs: number }` (in `src/types/playback.ts`)
  - `AudioService.subscribe(listener: (s: PlaybackStatus) => void): () => void` (returns an unsubscribe fn)
  - `StubAudioService.emitStatus(s: PlaybackStatus): void` (test helper; pushes a status to subscribers)

- [ ] **Step 1: Create the shared type**

`src/types/playback.ts`:

```typescript
// Live playback status published by AudioService and consumed by the UI read-model
// (PlaybackContext). Units are milliseconds. Defined here — not in services or components — so
// both layers share it without a cross-layer import.
export interface PlaybackStatus {
  /** True while a clip is actively sounding; false at rest / on finish / on stop. */
  playing: boolean;
  /** Current media position in ms (0 when unknown, e.g. the stub). */
  positionMs: number;
  /** Total clip duration in ms (0 when unknown/not-yet-determined). */
  durationMs: number;
}
```

- [ ] **Step 2: Extend the AudioService interface + re-export the type**

In `src/services/index.ts`, add the import and the `subscribe` method, and re-export the type:

```typescript
import type { PlaybackStatus } from '../types/playback';
export type { PlaybackStatus } from '../types/playback';

/** Playback. Cards call this via their onPlay callbacks; the orb visual follows the promise. */
export interface AudioService {
  play(url: string, opts?: { rate?: number }): Promise<void>;
  stop(): Promise<void>;
  isPlaying(): boolean;
  /** Subscribe to live playback status (position/duration/playing). Returns an unsubscribe fn.
   *  Used by the controller-side PlaybackProvider to feed the soundbar — cards never call this. */
  subscribe(listener: (status: PlaybackStatus) => void): () => void;
}
```

- [ ] **Step 3: Write the failing tests (ExpoAudioService emits real status)**

Append to `src/services/device/ExpoAudioService.test.ts`. The expo-audio mock's `addListener` is a `jest.fn()` — capture the registered `playbackStatusUpdate` callback so the test can feed it a status. Add a helper near the top of the `describe`:

```typescript
// Pull the playbackStatusUpdate callback the service registered on the most recent player.
function lastStatusCb(): (status: Record<string, unknown>) => void {
  const player = createdPlayers().at(-1) as unknown as { addListener: jest.Mock };
  const call = player.addListener.mock.calls.find((c) => c[0] === 'playbackStatusUpdate');
  return call?.[1] as (status: Record<string, unknown>) => void;
}
```

Then the tests:

```typescript
describe('ExpoAudioService.subscribe', () => {
  it('emits playing + ms-converted position/duration from expo-audio status (seconds → ms)', async () => {
    const svc = new ExpoAudioService();
    const seen: Array<{ playing: boolean; positionMs: number; durationMs: number }> = [];
    svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');

    lastStatusCb()({ playing: true, didJustFinish: false, currentTime: 0.5, duration: 2 });
    expect(seen.at(-1)).toEqual({ playing: true, positionMs: 500, durationMs: 2000 });
  });

  it('emits playing:false on didJustFinish', async () => {
    const svc = new ExpoAudioService();
    const seen: Array<{ playing: boolean }> = [];
    svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');

    lastStatusCb()({ playing: false, didJustFinish: true, currentTime: 2, duration: 2 });
    expect(seen.at(-1)?.playing).toBe(false);
  });

  it('emits playing:false when stop() is called', async () => {
    const svc = new ExpoAudioService();
    const seen: Array<{ playing: boolean }> = [];
    svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');
    await svc.stop();
    expect(seen.at(-1)?.playing).toBe(false);
  });

  it('does not emit for a superseded player (gen guard)', async () => {
    const svc = new ExpoAudioService();
    const seen: unknown[] = [];
    svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');
    const stale = lastStatusCb(); // first player's callback
    await svc.play('b.mp3'); // supersedes; bumps gen
    seen.length = 0;
    stale({ playing: true, didJustFinish: false, currentTime: 1, duration: 2 });
    expect(seen).toHaveLength(0); // stale player must not leak status
  });

  it('unsubscribe stops delivery', async () => {
    const svc = new ExpoAudioService();
    const seen: unknown[] = [];
    const off = svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');
    off();
    lastStatusCb()({ playing: true, didJustFinish: false, currentTime: 0.1, duration: 2 });
    expect(seen).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx jest ExpoAudioService -i`
Expected: FAIL — `svc.subscribe is not a function` (and the gen/status assertions).

- [ ] **Step 5: Implement status emission in ExpoAudioService**

Edit `src/services/device/ExpoAudioService.ts`. Add the import, a listeners set + emit/subscribe, capture `myGen` for the status callback, and emit on stop:

```typescript
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { AudioService, PlaybackStatus } from '../index';

// ... ensureAudioMode unchanged ...

export class ExpoAudioService implements AudioService {
  private player: AudioPlayer | null = null;
  private playing = false;
  private gen = 0;
  private listeners = new Set<(s: PlaybackStatus) => void>();

  subscribe(listener: (s: PlaybackStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(status: PlaybackStatus): void {
    for (const l of this.listeners) l(status);
  }

  async play(url: string, opts?: { rate?: number }): Promise<void> {
    const myGen = ++this.gen;
    this.teardown();
    await ensureAudioMode();
    if (this.gen !== myGen) return;
    const rate = opts?.rate ?? 1.0;
    const player = createAudioPlayer({ uri: url });
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(rate, 'high');
    this.player = player;
    this.playing = true;
    player.addListener('playbackStatusUpdate', (status) => {
      if (this.gen !== myGen) return; // a newer tap superseded this player — do not leak its status
      if (status.didJustFinish) {
        this.playing = false;
        if (this.player === player) this.player = null;
        this.emit({ playing: false, positionMs: status.duration * 1000, durationMs: status.duration * 1000 });
        player.remove();
        return;
      }
      this.emit({
        playing: status.playing,
        positionMs: status.currentTime * 1000,
        durationMs: status.duration * 1000,
      });
    });
    player.play();
  }

  async stop(): Promise<void> {
    this.gen++; // cancel any in-flight play() that is mid-await
    this.teardown();
    this.emit({ playing: false, positionMs: 0, durationMs: 0 });
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private teardown(): void {
    this.playing = false;
    const current = this.player;
    this.player = null;
    if (current) {
      try {
        current.remove();
      } catch {
        /* already removed */
      }
    }
  }
}
```

- [ ] **Step 6: Implement subscribe in StubAudioService**

Edit `src/services/stubs.ts`. Add the import and extend `StubAudioService`:

```typescript
import type {
  AudioService,
  PlaybackStatus,
  // ...existing imports...
} from './index';

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
  subscribe(listener: (s: PlaybackStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Test/dev helper: push an arbitrary status to subscribers. Not part of AudioService. */
  emitStatus(s: PlaybackStatus): void {
    this.emit(s);
  }
  private emit(s: PlaybackStatus): void {
    for (const l of this.listeners) l(s);
  }
}
```

> NOTE: the stub deliberately reports `durationMs: 0` — `usePlayClip` (Task 3) treats "playing with `durationMs === 0`" as "no real timeline available" and uses the rate-scaled timer fallback, so the web-preview/stub soundbar keeps animating exactly as it does today.

- [ ] **Step 7: Run all touched tests + typecheck**

Run: `npx jest ExpoAudioService -i && npm run typecheck`
Expected: PASS — including the pre-existing race-gate tests (unchanged behavior).

- [ ] **Step 8: Commit**

```bash
git add src/types/playback.ts src/services/index.ts src/services/device/ExpoAudioService.ts src/services/device/ExpoAudioService.test.ts src/services/stubs.ts
git commit -m "feat(audio): publish live playback status from AudioService"
```

---

### Task 2: Read-model context + controller bridge + onStop event

**Files:**
- Create: `src/components/PlaybackContext.tsx`
- Create: `src/session/PlaybackProvider.tsx`
- Create: `src/session/PlaybackProvider.test.tsx`
- Modify: `src/session/cardWiring.ts` (CardHandlers + createCardHandlers + resolvePlay rate override is Task 5; here only `onStop`)
- Modify: `src/session/cardWiring.test.ts` (extend — confirm onStop proxies audio.stop)
- Modify: `src/screens/cardProps.ts:15-24` (add `onStop?`)
- Modify: `src/navigation/index.tsx` (mount `PlaybackProvider`; spread `onStop` onto cards)

**Interfaces:**
- Consumes: `PlaybackStatus`, `AudioService.subscribe` (Task 1).
- Produces:
  - `usePlaybackStatus(): PlaybackStatus` (from `src/components/PlaybackContext`) — inert default `{ playing:false, positionMs:0, durationMs:0 }`.
  - `PlaybackStatusContext` (React context) exported for the provider.
  - `<PlaybackProvider>{children}</PlaybackProvider>` — subscribes to the injected `audio` and feeds the context.
  - `CardHandlers.onStop: () => void` and `BaseCardProps.onStop?: () => void`.

- [ ] **Step 1: Create the read-model context**

`src/components/PlaybackContext.tsx`:

```tsx
// PlaybackContext — a UI read-model carrying the live audio status to the soundbar. This is NOT a
// service (cards may read it like useTheme); it is populated on the controller side by
// PlaybackProvider from AudioService.subscribe. Default is inert so any tree without a provider
// (tests, the card gallery) degrades to usePlayClip's timer fallback.
import React, { createContext, useContext } from 'react';
import type { PlaybackStatus } from '../types/playback';

const INERT: PlaybackStatus = { playing: false, positionMs: 0, durationMs: 0 };

export const PlaybackStatusContext = createContext<PlaybackStatus>(INERT);

/** Live playback status for the current clip. Inert when no PlaybackProvider is mounted. */
export function usePlaybackStatus(): PlaybackStatus {
  return useContext(PlaybackStatusContext);
}
```

- [ ] **Step 2: Write the failing provider test**

`src/session/PlaybackProvider.test.tsx`:

```tsx
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices, StubAudioService } from '../services/stubs';
import { PlaybackProvider } from './PlaybackProvider';
import { usePlaybackStatus } from '../components/PlaybackContext';

function Probe(): React.JSX.Element {
  const s = usePlaybackStatus();
  return <Text>{`${s.playing}:${s.positionMs}:${s.durationMs}`}</Text>;
}

it('feeds AudioService status into the playback context', () => {
  const audio = new StubAudioService();
  const services = { ...createStubServices(), audio };
  const u = render(
    <ServiceProvider services={services}>
      <PlaybackProvider>
        <Probe />
      </PlaybackProvider>
    </ServiceProvider>,
  );
  expect(u.getByText('false:0:0')).toBeTruthy();
  act(() => audio.emitStatus({ playing: true, positionMs: 750, durationMs: 1800 }));
  expect(u.getByText('true:750:1800')).toBeTruthy();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest PlaybackProvider -i`
Expected: FAIL — `Cannot find module './PlaybackProvider'`.

- [ ] **Step 4: Implement the provider**

`src/session/PlaybackProvider.tsx`:

```tsx
// PlaybackProvider — controller-side bridge. Subscribes to the injected AudioService and pushes
// its live status into PlaybackStatusContext so the soundbar (via usePlayClip) tracks the real
// voice. Mounted around the card host; uses useServices (controller-only), never a card.
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { PlaybackStatusContext } from '../components/PlaybackContext';
import type { PlaybackStatus } from '../types/playback';

const INERT: PlaybackStatus = { playing: false, positionMs: 0, durationMs: 0 };

export function PlaybackProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { audio } = useServices();
  const [status, setStatus] = useState<PlaybackStatus>(INERT);
  useEffect(() => audio.subscribe(setStatus), [audio]);
  return <PlaybackStatusContext.Provider value={status}>{children}</PlaybackStatusContext.Provider>;
}
```

- [ ] **Step 5: Run the provider test to verify it passes**

Run: `npx jest PlaybackProvider -i`
Expected: PASS.

- [ ] **Step 6: Add the `onStop` event (failing test first)**

Append to `src/session/cardWiring.test.ts` (match the existing test's `createCardHandlers` setup — reuse its fake `audio`/`recorder`/`store`):

```typescript
it('onStop stops the injected audio service', () => {
  const audio = { play: jest.fn(), stop: jest.fn(), isPlaying: () => false, subscribe: () => () => {} };
  const handlers = createCardHandlers({
    item: makeItem(), // reuse the test file's existing item factory / fixture
    audio: audio as unknown as AudioService,
    recorder: { start: jest.fn(), stop: jest.fn(), isRecording: () => false } as unknown as RecorderService,
    store: { current: null },
    submit: jest.fn(),
    advance: jest.fn(),
  });
  handlers.onStop();
  expect(audio.stop).toHaveBeenCalledTimes(1);
});
```

> If `cardWiring.test.ts` already has an item fixture and typed fakes, reuse them rather than the inline fakes above. The fake `audio` must now include `subscribe` to satisfy the type.

- [ ] **Step 7: Run it to verify it fails**

Run: `npx jest cardWiring -i`
Expected: FAIL — `handlers.onStop is not a function`.

- [ ] **Step 8: Implement `onStop` in cardWiring**

In `src/session/cardWiring.ts`, add to the `CardHandlers` interface (after `onPlayCompare`):

```typescript
  /** Stop the currently-playing clip (the PlayOrb play/pause toggle). */
  onStop: () => void;
```

And in `createCardHandlers`'s returned object (after `onPlayCompare`):

```typescript
    onStop: () => {
      void audio.stop();
    },
```

- [ ] **Step 9: Thread `onStop` into card props + the card host**

In `src/screens/cardProps.ts`, add to `BaseCardProps`:

```typescript
  /** Stop current playback — backs the PlayOrb play/pause toggle. */
  onStop?: () => void;
```

In `src/navigation/index.tsx`, find where `CardHost` spreads the handlers from `useReviewCardHandlers` onto the card element and ensure `onStop` is included in the spread (the handlers object now carries it; if props are passed explicitly rather than via `{...handlers}`, add `onStop={handlers.onStop}`).

- [ ] **Step 10: Mount `PlaybackProvider` around the card host**

In `src/navigation/index.tsx`, wrap the session/card-host subtree (the part that renders Tier-A cards, inside `ServiceProvider`) with `<PlaybackProvider>…</PlaybackProvider>`. Import it from `../session/PlaybackProvider`. Place it high enough that every card screen is a descendant, but it must be inside `ServiceProvider` (it calls `useServices`).

- [ ] **Step 11: Run touched tests + typecheck**

Run: `npx jest PlaybackProvider cardWiring -i && npm run typecheck`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/components/PlaybackContext.tsx src/session/PlaybackProvider.tsx src/session/PlaybackProvider.test.tsx src/session/cardWiring.ts src/session/cardWiring.test.ts src/screens/cardProps.ts src/navigation/index.tsx
git commit -m "feat(audio): playback read-model context + onStop event"
```

---

### Task 3: usePlayClip reads real position; rate-scaled timer fallback

**Files:**
- Modify: `src/components/usePlayClip.ts`
- Modify: `src/components/usePlayClip.test.tsx` (extend)

**Interfaces:**
- Consumes: `usePlaybackStatus()` (Task 2).
- Produces: `usePlayClip(envelope?: number[]): { playing: boolean; positionMs?: number; rate: number; play: (fire?: () => void, rate?: number) => void; stop: () => void }`.
  - `positionMs` is the real media position when real audio drives the bar; `undefined` in timer-fallback mode (LiveWaveform then runs its own rate-scaled clock).
  - `rate` is the rate the last `play()` was invoked with (default 1); LiveWaveform uses it to interpolate/scale.
  - `play(fire, rate)` fires the callback, records the rate, and starts the fallback gate scaled to `clipMs/rate`.

**Behavior contract:**
- "Real mode" = the context reports `playing === true && durationMs > 0`. Then `playing` follows the context and `positionMs` is the context's `positionMs`; the fallback timer is suppressed.
- "Timer mode" = anything else after `play()` (stub reports `durationMs:0`, or no provider). `playing` is held for `clipMs(envelope)/rate`; `positionMs` is `undefined`.
- `stop()` clears the gate immediately and forces `playing:false`.
- Never flips state after unmount.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/usePlayClip.test.tsx`. These need to drive the context, so render the hook inside a `PlaybackStatusContext.Provider` wrapper with a controllable value:

```tsx
import { PlaybackStatusContext } from './PlaybackContext';
import type { PlaybackStatus } from '../types/playback';

function withStatus(status: PlaybackStatus) {
  return ({ children }: { children: React.ReactNode }) => (
    <PlaybackStatusContext.Provider value={status}>{children}</PlaybackStatusContext.Provider>
  );
}

describe('usePlayClip real-position bridge', () => {
  it('uses real position when the context reports a clip with a known duration', () => {
    const env = new Array(10).fill(0.5);
    const status: PlaybackStatus = { playing: true, positionMs: 333, durationMs: 1000 };
    const { result } = renderHook(() => usePlayClip(env), { wrapper: withStatus(status) });
    act(() => result.current.play());
    expect(result.current.playing).toBe(true);
    expect(result.current.positionMs).toBe(333); // real media position, not the timer
  });

  it('falls back to the timer when the context has no real duration (stub: durationMs 0)', () => {
    const env = new Array(10).fill(0.5); // 500ms gate at 1x
    const status: PlaybackStatus = { playing: true, positionMs: 0, durationMs: 0 };
    const { result } = renderHook(() => usePlayClip(env), { wrapper: withStatus(status) });
    act(() => result.current.play());
    expect(result.current.playing).toBe(true);
    expect(result.current.positionMs).toBeUndefined(); // timer mode → LiveWaveform runs its own clock
    act(() => { jest.advanceTimersByTime(520); });
    expect(result.current.playing).toBe(false);
  });

  it('scales the fallback gate by 1/rate (bug 5): 0.7x runs ~1.43x longer', () => {
    const env = new Array(10).fill(0.5); // clipMs = 500ms at 1x
    const { result } = renderHook(() => usePlayClip(env)); // no provider → inert → timer mode
    act(() => result.current.play(undefined, 0.7)); // 500 / 0.7 ≈ 714ms
    act(() => { jest.advanceTimersByTime(600); });
    expect(result.current.playing).toBe(true); // a 1x gate (500) would have closed already
    act(() => { jest.advanceTimersByTime(150); });
    expect(result.current.playing).toBe(false);
  });

  it('exposes the rate the clip was played at', () => {
    const { result } = renderHook(() => usePlayClip([0.5, 0.5]));
    act(() => result.current.play(undefined, 0.7));
    expect(result.current.rate).toBe(0.7);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest usePlayClip -i`
Expected: FAIL — `positionMs`/`rate` undefined on the result; rate arg ignored.

- [ ] **Step 3: Reimplement usePlayClip**

Replace the hook body in `src/components/usePlayClip.ts` (keep `FRAME_MS`, `clipMs`, and the file header comment; update the doc comment to describe the real-position bridge):

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaybackStatus } from './PlaybackContext';

export const FRAME_MS = 30; // must match content-pipeline/tts.mjs envelope frame size
const TAIL_MS = 200; // small pad so the bar doesn't cut off on the final syllable
const FALLBACK_MS = 1600; // no envelope: run the bar for a plausible single-word beat

/** Gate length for a clip: its envelope's real duration, or a short fallback when none was seeded. */
export function clipMs(envelope?: number[]): number {
  return envelope && envelope.length ? envelope.length * FRAME_MS + TAIL_MS : FALLBACK_MS;
}

export function usePlayClip(envelope?: number[]): {
  playing: boolean;
  positionMs?: number;
  rate: number;
  play: (fire?: () => void, rate?: number) => void;
  stop: () => void;
} {
  const status = usePlaybackStatus();
  const [timerPlaying, setTimerPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback((): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const play = useCallback(
    (fire?: () => void, playRate = 1): void => {
      fire?.();
      clear();
      setRate(playRate);
      setTimerPlaying(true);
      // Fallback gate (timer mode). Scaled by 1/rate so a slowed clip lights the bar longer (bug 5).
      // When real audio reports a known duration the render below ignores this flag.
      timer.current = setTimeout(() => {
        setTimerPlaying(false);
        timer.current = null;
      }, clipMs(envelope) / playRate);
    },
    [envelope, clear],
  );

  const stop = useCallback((): void => {
    clear();
    setTimerPlaying(false);
  }, [clear]);

  useEffect(() => clear, [clear]);

  // Real mode: the controller's PlaybackProvider is reporting an actual clip (known duration).
  // Trust the real stream for both playing and position. Otherwise hold the rate-scaled timer gate.
  const realDriven = status.playing && status.durationMs > 0;
  return {
    playing: realDriven ? true : timerPlaying,
    positionMs: realDriven ? status.positionMs : undefined,
    rate,
    play,
    stop,
  };
}
```

> The existing tests call `play(fire)` with one arg — still valid (`playRate` defaults to 1). The replay/stop/unmount tests stay green because timer mode is unchanged at rate 1.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest usePlayClip -i`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/components/usePlayClip.ts src/components/usePlayClip.test.tsx
git commit -m "feat(audio): usePlayClip tracks real position, rate-scaled fallback gate"
```

---

### Task 4: LiveWaveform interpolates from real position anchors

**Files:**
- Modify: `src/components/LiveWaveform.tsx`
- Modify: `src/components/LiveWaveform.test.tsx` (extend)

**Interfaces:**
- Consumes: `positionMs?` + `rate` from `usePlayClip` (Task 3).
- Produces: `LiveWaveform` accepts two new optional props:
  - `positionMs?: number` — a real media-position anchor (ms). When provided, the rAF loop interpolates from it (`anchor + (now - anchorWall) * rate`) instead of from its own play-start clock.
  - `rate?: number` (default 1) — playback rate; scales the wall-clock advance in both anchored and unanchored modes (fixes bug 5 for the timer path too).
- Back-compat: when `positionMs` is omitted, behavior matches today except the wall clock is multiplied by `rate` (default 1 ⇒ identical).

- [ ] **Step 1: Write the failing test**

LiveWaveform's animation is imperative (rAF + `Animated.Value`), hard to assert frame-by-frame — the existing tests only check render/labelling. Add a prop-acceptance test that proves the new props are wired without crashing (matching the file's established testing depth):

```tsx
it('accepts a real-position anchor + rate without crashing', () => {
  const env = [0.1, 0.5, 1, 0.8, 0.3, 0.05, 0.2, 0.6];
  const u = renderBars({ playing: true, envelope: env, count: 16, positionMs: 120, rate: 0.7 });
  expect(u.getByLabelText('Audio waveform').children).toHaveLength(16);
});
```

(`renderBars` already spreads arbitrary props, so no helper change is needed.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest LiveWaveform -i`
Expected: FAIL — TypeScript rejects unknown props `positionMs`/`rate` (typecheck) — the test won't compile until the props exist.

- [ ] **Step 3: Add the props + anchored interpolation**

Edit `src/components/LiveWaveform.tsx`. Add `positionMs` and `rate` to the props type and destructuring:

```tsx
export function LiveWaveform({
  envelope,
  playing,
  positionMs,
  rate = 1,
  frameMs = 30,
  height = 54,
  count = 40,
  gap = 3,
  color,
  radius = 3,
}: {
  envelope?: number[];
  playing: boolean;
  /** Real media-position anchor (ms). When set, the bar interpolates from it instead of a local clock. */
  positionMs?: number;
  /** Playback rate; scales the wall-clock advance so the bar matches a slowed voice (bug 5). */
  rate?: number;
  frameMs?: number;
  height?: number;
  count?: number;
  gap?: number;
  color?: string;
  radius?: number;
}): React.JSX.Element {
```

In the playing branch of the effect, compute the media position from the anchor when present, else from the local start clock — both scaled by `rate`. Replace the `const startedAt = Date.now();` line and the `idx` computation:

```tsx
    // Anchor the bar to real playback position when the bridge supplies one; otherwise run a local
    // clock. Either way advance by `rate` so a 0.7x clip scrolls ~0.7x as fast (bug 5).
    const startedAt = Date.now();
    const anchorMs = positionMs;
    const loop = (): void => {
      if (env) {
        const elapsed = Date.now() - startedAt;
        const mediaMs = anchorMs != null ? anchorMs + elapsed * rate : elapsed * rate;
        const idx = Math.floor(mediaMs / frameMs);
        for (let i = 0; i < count; i++) {
          const sampleIdx = idx - (count - 1) + i;
          const target = sampleIdx >= 0 && sampleIdx < env.length ? env[sampleIdx] ?? REST : REST;
          const prev = smooth.current[i] ?? REST;
          set(i, prev + (target - prev) * (target > prev ? 0.6 : 0.16));
        }
      } else {
        for (let i = 0; i < count; i++) {
          const prev = smooth.current[i] ?? REST;
          set(i, prev + (REST - prev) * 0.16);
        }
      }
      raf.current = requestAnimationFrame(loop);
    };
```

Add `positionMs` and `rate` to the effect dependency array:

```tsx
  }, [playing, envelope, count, frameMs, positionMs, rate]);
```

> When `positionMs` updates (a new real anchor arrives ~ every status tick), the effect re-runs and re-anchors `startedAt`/`anchorMs` — so the bar snaps to the true position and interpolates smoothly between ticks instead of waiting for the next discrete update.

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `npx jest LiveWaveform -i && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LiveWaveform.tsx src/components/LiveWaveform.test.tsx
git commit -m "feat(audio): LiveWaveform interpolates from real position, scales by rate"
```

---

### Task 5: Wire cards to real position + live SpeedChip (bugs 2 & 5 land end-to-end)

**Files (modify):**
- `src/session/cardWiring.ts` (widen `onPlay` to accept a rate override) + `src/session/cardWiring.test.ts`
- `src/screens/cardProps.ts` (widen `onPlay` signature)
- Card screens that own an audio hero: `WordHear`, `PhraseHear`, `WordSay`, `WordLearnConcrete`, `WordLearnFunction`, `WordLearnAbstract`, `WordPicReview`, `PhraseMeaning`, `DrillScreen`, `DiphthongDrillScreen`, `PronounceScreen`
- Their snapshot/unit tests as needed.

**Interfaces:**
- Consumes: `usePlayClip` returns `{ playing, positionMs, rate, play, stop }` (Task 3); `LiveWaveform` accepts `positionMs`+`rate` (Task 4).
- Produces: `onPlay: (which: PlayWhich, rate?: number) => void` — when a rate is supplied it overrides `resolvePlay`'s rate, so the SpeedChip selection actually slows playback.

**Pattern (apply to every audio-hero card):**
1. Destructure the extra hook outputs: `const { playing, positionMs, rate, play } = usePlayClip(item.audio.envelope);`
2. Pass them to the bar: `<LiveWaveform envelope={...} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} ... />`
3. Make playback honor `speed`: the play callback fires `onPlay('native', speed)` and gates at `speed`: `play(() => onPlay('native', speed ?? 1), speed ?? 1)`.

- [ ] **Step 1: Widen `onPlay` to accept a rate override (failing test)**

Append to `src/session/cardWiring.test.ts`:

```typescript
it('onPlay passes a rate override through to audio.play', () => {
  const audio = { play: jest.fn(), stop: jest.fn(), isPlaying: () => false, subscribe: () => () => {} };
  const handlers = createCardHandlers({
    item: makeItemWithNative('n.mp3'), // reuse fixture; item.audio.nativeUrl = 'n.mp3'
    audio: audio as unknown as AudioService,
    recorder: { start: jest.fn(), stop: jest.fn(), isRecording: () => false } as unknown as RecorderService,
    store: { current: null },
    submit: jest.fn(),
    advance: jest.fn(),
  });
  handlers.onPlay('native', 0.7);
  expect(audio.play).toHaveBeenCalledWith('n.mp3', { rate: 0.7 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest cardWiring -i`
Expected: FAIL — `onPlay` ignores the second arg; called with `'n.mp3'` and `undefined`.

- [ ] **Step 3: Implement the rate override**

In `src/session/cardWiring.ts`, update the `CardHandlers.onPlay` signature and the implementation:

```typescript
// interface CardHandlers:
  onPlay: (which: PlayWhich, rate?: number) => void;

// createCardHandlers return:
    onPlay: (which, rate) => {
      const p = resolvePlay(item, which);
      if (!p) return;
      const r = rate ?? p.rate; // an explicit rate (SpeedChip) overrides resolvePlay's default
      void audio.play(p.url, r != null ? { rate: r } : undefined);
    },
```

In `src/screens/cardProps.ts`, widen the `BaseCardProps.onPlay` type:

```typescript
  onPlay: (which: PlayWhich, rate?: number) => void;
```

- [ ] **Step 4: Wire `WordHear` (worked example)**

In `src/screens/WordHear.tsx`:

```tsx
export function WordHear({ item, onPlay, onAnswer, onComplete, speed, onSpeedChange }: ChoiceCardProps): React.JSX.Element {
  const { playing, positionMs, rate, play } = usePlayClip(item.audio.envelope);
  // ...unchanged state...
  const replay = (): void => play(() => onPlay('native', speed ?? 1), speed ?? 1);
  // ...
        <View style={styles.wave}>
          <LiveWaveform envelope={item.audio.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={48} count={42} />
        </View>
        <PlayOrb size={64} playing={playing} onPress={replay} />
        <SpeedChip value={speed} onChange={onSpeedChange} />
```

- [ ] **Step 5: Wire `PhraseHear` (auto-play + repeat)**

In `src/screens/PhraseHear.tsx`, the same three edits. The auto-play effect keeps using `clipMs(env)` for the repeat schedule but should also honor speed:

```tsx
  const { playing, positionMs, rate, play } = usePlayClip(env);
  const playClip = (): void => play(() => onPlay('native', speed ?? 1), speed ?? 1);
  // ...
  useEffect(() => {
    playClip();
    const t = setTimeout(() => playClip(), clipMs(env) / (speed ?? 1) + REPEAT_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ...
          <LiveWaveform envelope={env} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={58} count={44} />
```

- [ ] **Step 6: Wire the remaining audio-hero cards**

Apply the same three-edit pattern (hook destructure → `LiveWaveform positionMs/rate` → `play(() => onPlay(which, speed ?? 1), speed ?? 1)`) to: `WordSay`, `WordLearnConcrete`, `WordLearnFunction`, `WordLearnAbstract`, `WordPicReview`, `PhraseMeaning`, `DrillScreen`, `DiphthongDrillScreen`, `PronounceScreen`. For cards whose `onPlay` uses a non-`'native'` `which` (e.g. the diphthong drill's `'glide'`, or function-card example indices), keep that `which`; pass `speed ?? 1` as the rate only where a SpeedChip is present in that card (cards without a SpeedChip play at rate 1 — call `play(() => onPlay(which))`, leaving the rate defaulted). Do NOT invent a SpeedChip where the mockup has none.

> Some of these cards may not currently read `speed` from props. Add `speed` to the destructure only for cards that render a `SpeedChip`. Cards without one stay at rate 1.

- [ ] **Step 7: Run the full card test suite + typecheck + lint**

Run: `npm run typecheck && npm run lint && npx jest src/screens -i`
Expected: PASS. If any snapshot changed only by the new `positionMs`/`rate` props, update the snapshot intentionally and eyeball the diff.

- [ ] **Step 8: Commit**

```bash
git add src/session/cardWiring.ts src/session/cardWiring.test.ts src/screens/cardProps.ts src/screens/
git commit -m "feat(audio): cards drive soundbar from real position; SpeedChip slows playback"
```

---

### Task 6: PlayOrb play/pause toggle (bug 3)

**Files (modify):**
- Card screens with a tap-to-replay PlayOrb (same audio-hero list as Task 5).
- Add/extend a small unit test on the toggle decision where a card already has a test; otherwise rely on the controller-level wiring + manual device check.

**Interfaces:**
- Consumes: `onStop` (Task 2), `playing` from `usePlayClip` (Task 3).
- Produces: the orb's `onPress` becomes a toggle — `playing ? onStop?.() : play(...)`.

- [ ] **Step 1: Convert `WordHear`'s orb to a toggle (worked example)**

In `src/screens/WordHear.tsx`, destructure `onStop` from props and make the orb toggle:

```tsx
export function WordHear({ item, onPlay, onStop, onAnswer, onComplete, speed, onSpeedChange }: ChoiceCardProps): React.JSX.Element {
  const { playing, positionMs, rate, play } = usePlayClip(item.audio.envelope);
  // ...
  const toggle = (): void => {
    if (playing) onStop?.();
    else play(() => onPlay('native', speed ?? 1), speed ?? 1);
  };
  // ...
        <PlayOrb size={64} playing={playing} onPress={toggle} />
```

> When `onStop` fires, `audio.stop()` emits `playing:false` (Task 1) → the context updates → `usePlayClip` returns `playing:false` → the orb flips to the play glyph. In timer-fallback mode (no real audio, e.g. preview) `onStop` still calls `usePlayClip`'s gate? No — `onStop` only stops the service. For the stub/preview path, also call the hook's `stop()` so the local gate clears: `if (playing) { onStop?.(); stopGate(); }` where `stopGate` is `usePlayClip().stop`. Destructure it: `const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(...)`.

Final toggle:

```tsx
  const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(item.audio.envelope);
  const toggle = (): void => {
    if (playing) {
      onStop?.();
      stopGate();
    } else {
      play(() => onPlay('native', speed ?? 1), speed ?? 1);
    }
  };
```

- [ ] **Step 2: Apply the toggle to the remaining replay-orb cards**

Apply the same `onStop` + `stopGate` toggle to every audio-hero card from Task 5 whose orb is currently tap-to-replay. For `PhraseHear` (auto-plays on mount), the orb also becomes a toggle: tapping while playing stops; tapping at rest replays.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npx jest src/screens -i`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/
git commit -m "feat(audio): PlayOrb is a true play/pause toggle (bug 3)"
```

> **DEVICE CHECK (user):** on a real iPhone, confirm tapping the orb mid-clip pauses the voice (and the bar settles), tapping again replays, and rapid taps never stack overlapping voices.

---

### Task 7: Preload the current clip to cut first-play latency (bug 1)

**Files:**
- Modify: `src/services/index.ts` (add `preload` to `AudioService`)
- Modify: `src/services/device/ExpoAudioService.ts` (implement preload)
- Modify: `src/services/stubs.ts` (no-op `preload`)
- Modify: `src/session/cardWiring.ts` (expose `onPreload`) + `src/screens/cardProps.ts`
- Modify: card screens — preload the native clip on mount
- Test: `src/services/device/ExpoAudioService.test.ts` (extend)

**Interfaces:**
- Produces:
  - `AudioService.preload(url: string): void` — warm a player for `url` so the next `play(url)` starts without a network/decode stall. Idempotent; safe to call with the URL about to be played.
  - `CardHandlers.onPreload(which: PlayWhich): void` and `BaseCardProps.onPreload?: (which: PlayWhich) => void`.

**Design:** keep a single cached "warm" player keyed by URL. `play(url)` reuses the warm player if its URL matches (and the gen guard still applies); otherwise it creates one as today. This avoids `createAudioPlayer({uri})` decoding the remote MP3 on the play tap.

- [ ] **Step 1: Write the failing test (preload warms a player reused by play)**

Append to `src/services/device/ExpoAudioService.test.ts`:

```typescript
describe('ExpoAudioService.preload', () => {
  it('preload warms a player so play(sameUrl) does not create a second one', async () => {
    const svc = new ExpoAudioService();
    svc.preload('a.mp3');
    expect(createdPlayers()).toHaveLength(1); // warmed
    await svc.play('a.mp3');
    expect(createdPlayers()).toHaveLength(1); // reused, not recreated
    expect(svc.isPlaying()).toBe(true);
  });

  it('play(differentUrl) after preload creates a fresh player', async () => {
    const svc = new ExpoAudioService();
    svc.preload('a.mp3');
    await svc.play('b.mp3');
    expect(createdPlayers().length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest ExpoAudioService -i`
Expected: FAIL — `svc.preload is not a function`.

- [ ] **Step 3: Implement preload + warm-player reuse**

In `src/services/index.ts`, add to `AudioService`:

```typescript
  /** Warm a player for `url` so the next play(url) starts without a load stall. Idempotent. */
  preload(url: string): void;
```

In `src/services/device/ExpoAudioService.ts`, add a warm-player cache and reuse it in `play()`:

```typescript
  private warm: { url: string; player: AudioPlayer } | null = null;

  preload(url: string): void {
    if (this.warm?.url === url || this.player) return; // already warm or actively playing
    try {
      const player = createAudioPlayer({ uri: url });
      this.warm = { url, player };
    } catch {
      this.warm = null;
    }
  }
```

In `play()`, after the gen/await guard, reuse the warm player when the URL matches instead of always creating one:

```typescript
    const rate = opts?.rate ?? 1.0;
    let player: AudioPlayer;
    if (this.warm && this.warm.url === url) {
      player = this.warm.player;
      this.warm = null;
    } else {
      // a stale warm player for a different url is discarded so it can't leak
      if (this.warm) { try { this.warm.player.remove(); } catch { /* */ } this.warm = null; }
      player = createAudioPlayer({ uri: url });
    }
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(rate, 'high');
    // ...rest unchanged (this.player = player; listener; player.play())...
```

Ensure `teardown()` and `stop()` also clear `this.warm` if it equals the torn-down player is unnecessary (warm is separate), but on `stop()` leave `warm` intact so a subsequent replay is still fast. (Do NOT remove the warm player on stop.)

- [ ] **Step 4: Implement the stub no-op + thread onPreload**

In `src/services/stubs.ts`, add to `StubAudioService`:

```typescript
  preload(_url: string): void {
    /* no-op: nothing to warm in the stub */
  }
```

In `src/session/cardWiring.ts`, add to `CardHandlers` and `createCardHandlers`:

```typescript
  onPreload: (which: PlayWhich) => void;
// ...
    onPreload: (which) => {
      const p = resolvePlay(item, which);
      if (p) audio.preload(p.url);
    },
```

In `src/screens/cardProps.ts`, add `onPreload?: (which: PlayWhich) => void;` to `BaseCardProps`, and include it in the `CardHost` handler spread in `src/navigation/index.tsx`.

- [ ] **Step 5: Preload on card mount**

In each audio-hero card, preload the native clip on mount so the first tap is instant:

```tsx
  useEffect(() => {
    onPreload?.('native');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(For `PhraseHear`, which auto-plays, preload still helps the first auto-play — call `onPreload?.('native')` before `playClip()` in the existing mount effect.)

- [ ] **Step 6: Typecheck, lint, full test**

Run: `npm run typecheck && npm run lint && npx jest -i`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/index.ts src/services/device/ExpoAudioService.ts src/services/device/ExpoAudioService.test.ts src/services/stubs.ts src/session/cardWiring.ts src/screens/cardProps.ts src/navigation/index.tsx src/screens/
git commit -m "feat(audio): preload current clip to cut first-play latency (bug 1)"
```

> **DEVICE CHECK (user):** on a real iPhone, confirm the first tap of a card's audio now starts promptly (no ~1s stall), and that preload never causes a clip to start on its own.

---

## Self-Review notes

- **Spec coverage:** bug 2 (waveform desync) → Tasks 3+4+5; bug 5 (rate sync) → Tasks 3+4+5 (real-position is inherently rate-correct; the SpeedChip wiring in Task 5 makes a non-1× rate reachable, and the timer fallback is rate-scaled); bug 3 (play/pause) → Tasks 2 (`onStop`) + 6; bug 1 (latency) → Task 7. Bug 4 (freeze) is explicitly out of this plan's scope (needs a device repro; systematic-debugging Iron Law).
- **Boundary:** `PlaybackContext` is a read-model, not a service; populated controller-side by `PlaybackProvider`. Cards read it only indirectly through `usePlayClip`. Documented in Global Constraints — the final reviewer should confirm this is not treated as a boundary break.
- **Type consistency:** `PlaybackStatus` is defined once in `src/types/playback.ts` and imported by both layers. `usePlayClip` returns `{ playing, positionMs?, rate, play, stop }`; `LiveWaveform` consumes `positionMs?`+`rate`; `onPlay(which, rate?)` and `onStop`/`onPreload` are added to both `CardHandlers` and `BaseCardProps` in lockstep.
- **Device-dependent verification:** bugs 1 and 3 carry explicit user device-check callouts; the controller can ship the code-side change and unit tests, but on-device confirmation is the user's.
```
