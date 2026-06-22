// usePlayClip drives the soundbar gate every audio card shares. Verified with fake timers:
// play() fires the callback + lights the bar, the bar auto-settles after the clip length, replay
// restarts cleanly, and stop()/unmount never flip state late (the no-loop guarantee cards depend on).
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { usePlayClip, clipMs, FRAME_MS } from './usePlayClip';
import { PlaybackStatusContext } from './PlaybackContext';
import type { PlaybackStatus } from '../types/playback';

jest.useFakeTimers();

function withStatus(status: PlaybackStatus) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <PlaybackStatusContext.Provider value={status}>{children}</PlaybackStatusContext.Provider>
  );
  Wrapper.displayName = 'StatusWrapper';
  return Wrapper;
}

describe('clipMs', () => {
  it('times the gate off the real envelope length (+ a small tail)', () => {
    expect(clipMs([0.1, 0.2, 0.3])).toBe(3 * FRAME_MS + 200);
  });
  it('falls back to a single-beat length when no envelope is seeded', () => {
    expect(clipMs(undefined)).toBe(1600);
    expect(clipMs([])).toBe(1600);
  });
});

describe('usePlayClip', () => {
  it('play() fires the callback and lights the bar, then settles after the clip length', () => {
    const env = new Array(10).fill(0.5); // 10 * 30 + 200 = 500ms
    const fire = jest.fn();
    const { result } = renderHook(() => usePlayClip(env));

    expect(result.current.playing).toBe(false);
    act(() => result.current.play(fire));
    expect(fire).toHaveBeenCalledTimes(1);
    expect(result.current.playing).toBe(true);

    act(() => { jest.advanceTimersByTime(499); });
    expect(result.current.playing).toBe(true); // still within the clip
    act(() => { jest.advanceTimersByTime(2); });
    expect(result.current.playing).toBe(false); // settled — not looping
  });

  it('replay restarts the gate instead of stacking a second timer', () => {
    const env = new Array(10).fill(0.5); // 500ms
    const { result } = renderHook(() => usePlayClip(env));

    act(() => result.current.play());
    act(() => { jest.advanceTimersByTime(300); });
    act(() => result.current.play()); // replay — gate restarts from 0
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current.playing).toBe(true); // old timer would have fired at 500; restart pushes it out
    act(() => { jest.advanceTimersByTime(220); });
    expect(result.current.playing).toBe(false);
  });

  it('stop() clears the gate immediately', () => {
    const { result } = renderHook(() => usePlayClip([0.5, 0.5]));
    act(() => result.current.play());
    expect(result.current.playing).toBe(true);
    act(() => result.current.stop());
    expect(result.current.playing).toBe(false);
  });

  it('does not flip state after unmount (no post-unmount setState)', () => {
    const { result, unmount } = renderHook(() => usePlayClip([0.5, 0.5]));
    act(() => result.current.play());
    unmount();
    expect(() => act(() => { jest.advanceTimersByTime(2000); })).not.toThrow();
  });
});

describe('usePlayClip real-position bridge', () => {
  it('uses real position when the context reports a clip with a known duration', () => {
    const env = new Array(10).fill(0.5);
    const status: PlaybackStatus = { playing: true, positionMs: 333, durationMs: 1000 };
    const { result } = renderHook(() => usePlayClip(env), { wrapper: withStatus(status) });
    act(() => result.current.play());
    expect(result.current.playing).toBe(true);
    expect(result.current.positionMs).toBe(333); // real media position, not the timer
  });

  it('ignores a foreign clip: real status while THIS hook never called play() does not light the bar', () => {
    // Single global status + no clip identity: another card (or the unlock chime) is what's sounding.
    // A card that didn't start playback must stay at rest, not animate the wrong envelope.
    const env = new Array(10).fill(0.5);
    const status: PlaybackStatus = { playing: true, positionMs: 333, durationMs: 1000 };
    const { result } = renderHook(() => usePlayClip(env), { wrapper: withStatus(status) });
    expect(result.current.playing).toBe(false); // did not call play() → not our clip
    expect(result.current.positionMs).toBeUndefined();
  });

  it('a toggle-stop (stop()) drops out of real mode immediately, even while real status still reports playing', () => {
    const env = new Array(10).fill(0.5);
    const status: PlaybackStatus = { playing: true, positionMs: 333, durationMs: 1000 };
    const { result } = renderHook(() => usePlayClip(env), { wrapper: withStatus(status) });
    act(() => result.current.play());
    expect(result.current.playing).toBe(true); // real mode
    act(() => result.current.stop()); // the PlayOrb toggle-stop path
    expect(result.current.playing).toBe(false); // settles at once, not on the audio.stop() round-trip
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
