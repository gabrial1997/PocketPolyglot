// Unit tests for the full-loop UI state machine. Both locked answer rules live here, so they are
// tested here once (not re-tested per card): correct -> green confirm THEN advance; wrong -> stay,
// redden, remember, never reveal. Uses fake timers to drive the CONFIRM_MS confirm beat.
import { act, renderHook } from '@testing-library/react-native';
import { useLoopStage, CONFIRM_MS } from './useLoopStage';

describe('useLoopStage', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('starts on the choose stage with nothing picked', () => {
    const { result } = renderHook(() => useLoopStage());
    expect(result.current.stage).toBe('choose');
    expect(result.current.rightValue).toBeNull();
    expect(result.current.wrongValue).toBeNull();
    expect(result.current.missed).toBe(false);
  });

  it('on a correct pick: sets rightValue immediately, HOLDS on choose, then advances after CONFIRM_MS', () => {
    const { result } = renderHook(() => useLoopStage());

    act(() => result.current.pick('māja', true));
    // Green confirm is visible immediately, but the stage has NOT advanced yet.
    expect(result.current.rightValue).toBe('māja');
    expect(result.current.picked).toBe('māja');
    expect(result.current.stage).toBe('choose');

    // Just before the confirm window closes, still on choose.
    act(() => jest.advanceTimersByTime(CONFIRM_MS - 1));
    expect(result.current.stage).toBe('choose');

    // After CONFIRM_MS, it advances to speak.
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.stage).toBe('speak');
  });

  it('a wrong pick is unchanged: redden the chosen option, remember the miss, never advance or reveal', () => {
    const { result } = renderHook(() => useLoopStage());

    act(() => result.current.pick('maize', false));
    expect(result.current.wrongValue).toBe('maize');
    expect(result.current.missed).toBe(true);
    expect(result.current.rightValue).toBeNull(); // correct answer never exposed
    expect(result.current.stage).toBe('choose');

    // It never advances, even after the confirm window would have elapsed.
    act(() => jest.advanceTimersByTime(CONFIRM_MS * 2));
    expect(result.current.stage).toBe('choose');
  });

  it('ignores a wrong tap that lands during the confirm beat (the correct choice is locked)', () => {
    const { result } = renderHook(() => useLoopStage());
    act(() => result.current.pick('māja', true));
    act(() => result.current.pick('maize', false)); // late tap on a wrong option
    expect(result.current.missed).toBe(false); // must NOT be marked a miss
    expect(result.current.wrongValue).toBeNull();
    act(() => jest.advanceTimersByTime(CONFIRM_MS));
    expect(result.current.stage).toBe('speak');
  });

  it('reset clears rightValue and cancels a pending advance (no stage flip after reset)', () => {
    const { result } = renderHook(() => useLoopStage());
    act(() => result.current.pick('māja', true));
    act(() => result.current.reset());
    expect(result.current.rightValue).toBeNull();
    expect(result.current.stage).toBe('choose');
    // The pending advance timer must have been cancelled — no flip to speak.
    act(() => jest.advanceTimersByTime(CONFIRM_MS * 2));
    expect(result.current.stage).toBe('choose');
  });
});
