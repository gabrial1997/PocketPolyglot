// Behavior + snapshot tests for the meaning-check phrase card (phrase/meaning). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PhraseMeaning } from './PhraseMeaning';
import type { ReviewItem } from '../types/reviewItem';
import type { ChoiceCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'labrit',
    type: 'phrase',
    stage: 'review',
    reps: 2,
    target: 'Labrīt!',
    gloss: 'Good morning!',
    audio: { nativeUrl: 'native.mp3' },
    choices: [
      { value: 'gm', gloss: 'Good morning!', correct: true },
      { value: 'gn', gloss: 'Good night!', correct: false },
    ],
    ...overrides,
  };
}

function renderCard(overrides: Partial<ReviewItem> = {}) {
  const props: ChoiceCardProps = {
    item: fixtureItem(overrides),
    onPlay: jest.fn(),
    onAnswer: jest.fn(),
    onComplete: jest.fn(),
  };
  const utils = render(
    <ThemeProvider>
      <PhraseMeaning {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

describe('PhraseMeaning', () => {
  it('renders the choices from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('completes once as correct (first try) when the right meaning is chosen', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard();
      fireEvent.press(u.getByText('Good morning!'));
      expect(u.props.onAnswer).toHaveBeenCalledWith('gm', true);
      // The correct pick turns green and advances only after a short readable beat.
      expect(u.props.onComplete).not.toHaveBeenCalled();
      act(() => {
        jest.runAllTimers();
      });
      expect(u.props.onComplete).toHaveBeenCalledTimes(1);
      expect(u.props.onComplete).toHaveBeenCalledWith({
        itemId: 'labrit',
        cardKind: 'phrase/meaning',
        correct: true,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('a wrong pick does NOT advance, shows a non-revealing retry note, reddens only the chosen option', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Good night!')); // wrong meaning
    // Did not advance / complete, and the correct option is not auto-revealed (still tappable).
    expect(u.props.onComplete).not.toHaveBeenCalled();
    expect(u.props.onAnswer).toHaveBeenCalledWith('gn', false);
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
    expect(u.getByText('Good morning!')).toBeTruthy();
  });

  it('Try again clears the reddened selection', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Good night!'));
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Try again'));
    expect(u.queryByText('Not quite — give it another try.')).toBeNull();
  });

  it('wrong-then-correct records an honest lapse (correct:false) and completes exactly once', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard();
      fireEvent.press(u.getByText('Good night!')); // miss first
      fireEvent.press(u.getByLabelText('Try again'));
      fireEvent.press(u.getByText('Good morning!')); // then correct
      act(() => {
        jest.runAllTimers();
      });
      expect(u.props.onComplete).toHaveBeenCalledTimes(1);
      expect(u.props.onComplete).toHaveBeenCalledWith({
        itemId: 'labrit',
        cardKind: 'phrase/meaning',
        correct: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('double-tapping the correct option completes EXACTLY once (no double-complete race)', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard();
      // Two rapid taps on the correct option BEFORE the advance timer fires.
      fireEvent.press(u.getByText('Good morning!'));
      fireEvent.press(u.getByText('Good morning!'));
      act(() => {
        jest.runAllTimers();
      });
      expect(u.props.onComplete).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a direct wrong→correct tap (no Try again) clears the red wrong state + retry note and completes once as a lapse', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard();
      fireEvent.press(u.getByText('Good night!')); // miss first — red + retry note showing
      expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
      fireEvent.press(u.getByText('Good morning!')); // correct directly, skipping Try again
      // The red wrong state + retry note are cleared during the green beat.
      expect(u.queryByText('Not quite — give it another try.')).toBeNull();
      act(() => {
        jest.runAllTimers();
      });
      expect(u.props.onComplete).toHaveBeenCalledTimes(1);
      expect(u.props.onComplete).toHaveBeenCalledWith({
        itemId: 'labrit',
        cardKind: 'phrase/meaning',
        correct: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders nothing interactive when there are no choices (idiom-only, unseeded)', () => {
    const u = renderCard({ choices: [] });
    expect(u.queryByText('Good morning!')).toBeNull();
  });
});
