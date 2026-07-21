// Choice haptics: ChoiceButton / GridChoiceButton fire correct/wrong on the state TRANSITION
// only — never on mount (snapshot fixtures mount pre-answered), never on an unchanged re-render,
// and again after a Try-again reset (wrong -> idle -> wrong buzzes twice: each wrong pick is felt).
import React from 'react';
import { render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ChoiceButton, type ChoiceState } from './ChoiceButton';
import { GridChoiceButton } from './cardChrome';

const impact = Haptics.impactAsync as jest.Mock;
const notify = Haptics.notificationAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

function renderChoice(state: ChoiceState) {
  return render(
    <ThemeProvider>
      <ChoiceButton label="māja" state={state} />
    </ThemeProvider>,
  );
}

it('fires a Light impact once on idle -> correct', () => {
  const u = renderChoice('idle');
  expect(impact).not.toHaveBeenCalled();
  u.rerender(
    <ThemeProvider>
      <ChoiceButton label="māja" state="correct" />
    </ThemeProvider>,
  );
  expect(impact).toHaveBeenCalledTimes(1);
  expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  // Unchanged re-render must NOT re-fire.
  u.rerender(
    <ThemeProvider>
      <ChoiceButton label="māja" state="correct" />
    </ThemeProvider>,
  );
  expect(impact).toHaveBeenCalledTimes(1);
});

it('fires an Error notification on idle -> wrong, and again after a Try-again reset', () => {
  const u = renderChoice('idle');
  u.rerender(
    <ThemeProvider>
      <ChoiceButton label="māja" state="wrong" />
    </ThemeProvider>,
  );
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  // Try again: wrong -> idle (no fire) -> wrong (fires again).
  u.rerender(
    <ThemeProvider>
      <ChoiceButton label="māja" state="idle" />
    </ThemeProvider>,
  );
  expect(notify).toHaveBeenCalledTimes(1);
  u.rerender(
    <ThemeProvider>
      <ChoiceButton label="māja" state="wrong" />
    </ThemeProvider>,
  );
  expect(notify).toHaveBeenCalledTimes(2);
});

it('never fires on mount (pre-answered fixtures) or on -> faded', () => {
  const u = renderChoice('correct'); // mounted already-correct: no fire
  expect(impact).not.toHaveBeenCalled();
  u.rerender(
    <ThemeProvider>
      <ChoiceButton label="māja" state="faded" />
    </ThemeProvider>,
  );
  expect(impact).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

it('GridChoiceButton behaves identically (idle -> correct fires Light once)', () => {
  const u = render(
    <ThemeProvider>
      <GridChoiceButton label="māja" state="idle" />
    </ThemeProvider>,
  );
  u.rerender(
    <ThemeProvider>
      <GridChoiceButton label="māja" state="correct" />
    </ThemeProvider>,
  );
  expect(impact).toHaveBeenCalledTimes(1);
  expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
});
