// HapticsProvider + createTriggers. Triggers must be fire-and-forget (disabled/web = silent
// no-op), the toggle must persist to AsyncStorage (pp.hapticsEnabled), and useHaptics() must
// degrade gracefully OUTSIDE the provider (pure-card tests render cards without app chrome).
import React from 'react';
import { Text, Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { HapticsProvider, useHaptics, createTriggers, type HapticTriggers } from './HapticsProvider';

const impact = Haptics.impactAsync as jest.Mock;
const notify = Haptics.notificationAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  void AsyncStorage.clear();
});

describe('createTriggers', () => {
  it('maps the locked vocabulary (Light/Error/Success/Medium/Light)', () => {
    const t = createTriggers(() => true);
    t.correct();
    expect(impact).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Light);
    t.recStart();
    expect(impact).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    t.recStop();
    expect(impact).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Light);
    t.wrong();
    expect(notify).toHaveBeenLastCalledWith(Haptics.NotificationFeedbackType.Error);
    t.unlock();
    expect(notify).toHaveBeenLastCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('is silent when disabled', () => {
    const t = createTriggers(() => false);
    t.correct();
    t.wrong();
    t.unlock();
    t.recStart();
    t.recStop();
    expect(impact).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('is silent on web', () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    const t = createTriggers(() => true);
    t.correct();
    expect(impact).not.toHaveBeenCalled();
    os.restore();
  });

  it('swallows native rejections (never an unhandled rejection)', async () => {
    impact.mockRejectedValueOnce(new Error('no engine'));
    const t = createTriggers(() => true);
    expect(() => t.correct()).not.toThrow();
    await act(async () => {}); // flush the rejected promise — must not surface
  });
});

function Probe(): React.JSX.Element {
  const h = useHaptics();
  return (
    <Text testID="probe" onPress={() => h.correct()} onLongPress={() => h.setEnabled(!h.enabled)}>
      {h.enabled ? 'on' : 'off'}
    </Text>
  );
}

// Records the `correct` trigger reference on every render — used to pin that trigger identity
// survives an `enabled` toggle flip (downstream memo/effect deps, e.g. PhraseUnlock's
// onUnlocked effect, rely on this).
function CaptureProbe({ captured }: { captured: Array<HapticTriggers['correct']> }): React.JSX.Element {
  const h = useHaptics();
  captured.push(h.correct);
  return (
    <Text testID="capture-probe" onLongPress={() => h.setEnabled(!h.enabled)}>
      {h.enabled ? 'on' : 'off'}
    </Text>
  );
}

describe('HapticsProvider', () => {
  it('defaults to enabled and fires', () => {
    const u = render(
      <HapticsProvider>
        <Probe />
      </HapticsProvider>,
    );
    expect(u.getByTestId('probe').props.children).toBe('on');
    fireEvent.press(u.getByTestId('probe'));
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it('persists the toggle and goes silent when off', async () => {
    const u = render(
      <HapticsProvider>
        <Probe />
      </HapticsProvider>,
    );
    await act(async () => {
      fireEvent(u.getByTestId('probe'), 'longPress'); // setEnabled(false)
    });
    expect(u.getByTestId('probe').props.children).toBe('off');
    expect(await AsyncStorage.getItem('pp.hapticsEnabled')).toBe('off');
    fireEvent.press(u.getByTestId('probe'));
    expect(impact).not.toHaveBeenCalled();
  });

  it('hydrates a persisted "off"', async () => {
    await AsyncStorage.setItem('pp.hapticsEnabled', 'off');
    const u = render(
      <HapticsProvider>
        <Probe />
      </HapticsProvider>,
    );
    await act(async () => {}); // let the hydrate effect resolve
    expect(u.getByTestId('probe').props.children).toBe('off');
  });

  it('keeps trigger identity stable across an enabled toggle flip', async () => {
    const captured: Array<HapticTriggers['correct']> = [];
    const u = render(
      <HapticsProvider>
        <CaptureProbe captured={captured} />
      </HapticsProvider>,
    );
    const before = captured[captured.length - 1];
    await act(async () => {
      fireEvent(u.getByTestId('capture-probe'), 'longPress'); // setEnabled(false)
    });
    const after = captured[captured.length - 1];
    expect(Object.is(before, after)).toBe(true);
  });

  it('useHaptics OUTSIDE the provider falls back to always-on triggers (no throw)', () => {
    const u = render(<Probe />);
    expect(u.getByTestId('probe').props.children).toBe('on');
    fireEvent.press(u.getByTestId('probe'));
    expect(impact).toHaveBeenCalledTimes(1);
  });
});
