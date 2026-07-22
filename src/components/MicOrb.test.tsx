// MicOrb haptics: pressing the orb confirms the mic state change by feel — Medium on start
// ("mic is live"), Light on stop. The parent's onPress must still fire (the haptic is additive).
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { ThemeProvider } from '../theme/ThemeProvider';
import { MicOrb } from './MicOrb';

const impact = Haptics.impactAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

function renderOrb(rec: boolean, onPress = jest.fn()) {
  const u = render(
    <ThemeProvider>
      <MicOrb rec={rec} onPress={onPress} />
    </ThemeProvider>,
  );
  return { u, onPress };
}

it('fires a Medium impact when pressed idle (record start) and still calls onPress', () => {
  const { u, onPress } = renderOrb(false);
  fireEvent.press(u.getByLabelText('Record'));
  expect(impact).toHaveBeenCalledTimes(1);
  expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('fires a Light impact when pressed while recording (record stop)', () => {
  const { u, onPress } = renderOrb(true);
  fireEvent.press(u.getByLabelText('Stop recording'));
  expect(impact).toHaveBeenCalledTimes(1);
  expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  expect(onPress).toHaveBeenCalledTimes(1);
});
