// StageFade — wraps a card's per-stage body and fades the new stage in when `stageKey` changes.
// It must keep children live (always render the latest), animate on a real stage change, and swap
// instantly under reduced motion. Opacity is read off the testID'd Animated.View: a literal 1 means
// static (no fade), an Animated.Value object means a fade is in flight.
import React from 'react';
import { Text } from 'react-native';
import { AccessibilityInfo } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { StageFade } from './StageFade';

describe('StageFade', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders its children and does not fade on first appearance', () => {
    const u = render(
      <StageFade stageKey="choose">
        <Text>choose-body</Text>
      </StageFade>,
    );
    expect(u.getByText('choose-body')).toBeTruthy();
    // First mount is static — no fade.
    expect(u.getByTestId('stage-fade').props.style.opacity).toBe(1);
  });

  it('fades in the new stage body when stageKey changes (motion enabled)', async () => {
    const u = render(
      <StageFade stageKey="choose">
        <Text>choose-body</Text>
      </StageFade>,
    );
    await act(async () => {}); // let the reduce-motion probe resolve (defaults to false)

    act(() => {
      u.rerender(
        <StageFade stageKey="speak">
          <Text>speak-body</Text>
        </StageFade>,
      );
    });
    // New children are live...
    expect(u.getByText('speak-body')).toBeTruthy();
    expect(u.queryByText('choose-body')).toBeNull();
    // ...and a fade is in flight (animated opacity, not a static 1).
    expect(u.getByTestId('stage-fade').props.style.opacity).not.toBe(1);

    // After the fade completes it settles back to a static, fully-opaque 1.
    act(() => jest.advanceTimersByTime(300));
    expect(u.getByTestId('stage-fade').props.style.opacity).toBe(1);
  });

  it('swaps instantly with no fade when reduced motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const u = render(
      <StageFade stageKey="choose">
        <Text>choose-body</Text>
      </StageFade>,
    );
    await act(async () => {}); // reduce-motion probe resolves true before the next change

    act(() => {
      u.rerender(
        <StageFade stageKey="speak">
          <Text>speak-body</Text>
        </StageFade>,
      );
    });
    expect(u.getByText('speak-body')).toBeTruthy();
    // Instant swap: opacity is the static 1, never an animated value.
    expect(u.getByTestId('stage-fade').props.style.opacity).toBe(1);
  });
});
