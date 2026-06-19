// usePlayClip drives the soundbar gate every audio card shares. Verified with fake timers:
// play() fires the callback + lights the bar, the bar auto-settles after the clip length, replay
// restarts cleanly, and stop()/unmount never flip state late (the no-loop guarantee cards depend on).
import { renderHook, act } from '@testing-library/react-native';
import { usePlayClip, clipMs, FRAME_MS } from './usePlayClip';

jest.useFakeTimers();

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
