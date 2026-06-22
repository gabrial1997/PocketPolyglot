// Behavior + snapshot tests for the recognition card (word/hear). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WordHear } from './WordHear';
import type { ReviewItem } from '../types/reviewItem';
import type { ChoiceCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'maja',
    type: 'word',
    stage: 'review',
    reps: 1,
    target: 'māja',
    gloss: 'house',
    pron: 'MAH-ya',
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3' },
    choices: [
      { value: 'maja', gloss: 'house', correct: true },
      { value: 'maize', gloss: 'bread', correct: false },
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
      <WordHear {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

describe('WordHear', () => {
  it('renders the initial recognition stage from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1× passed as the rate
  });

  it('completes once as correct (first try) when the right gloss is picked', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard();
      fireEvent.press(u.getByText('house'));
      expect(u.props.onAnswer).toHaveBeenCalledWith('maja', true);
      // The correct pick turns green and advances only after a short readable beat.
      expect(u.props.onComplete).not.toHaveBeenCalled();
      act(() => {
        jest.runAllTimers();
      });
      expect(u.props.onComplete).toHaveBeenCalledTimes(1);
      expect(u.props.onComplete).toHaveBeenCalledWith({
        itemId: 'maja',
        cardKind: 'word/hear',
        correct: true,
        spoke: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('a wrong pick does NOT advance, shows a non-revealing retry note, reddens only the chosen option', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('bread')); // wrong gloss
    // Did not advance / complete, and the correct option is not auto-revealed (still tappable).
    expect(u.props.onComplete).not.toHaveBeenCalled();
    expect(u.props.onAnswer).toHaveBeenCalledWith('maize', false);
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
    expect(u.getByText('house')).toBeTruthy();
  });

  it('Try again clears the reddened selection', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('bread'));
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Try again'));
    expect(u.queryByText('Not quite — give it another try.')).toBeNull();
  });

  it('wrong-then-correct records an honest lapse (correct:false) and completes exactly once', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard();
      fireEvent.press(u.getByText('bread')); // miss first
      fireEvent.press(u.getByLabelText('Try again'));
      fireEvent.press(u.getByText('house')); // then correct
      act(() => {
        jest.runAllTimers();
      });
      expect(u.props.onComplete).toHaveBeenCalledTimes(1);
      expect(u.props.onComplete).toHaveBeenCalledWith({
        itemId: 'maja',
        cardKind: 'word/hear',
        correct: false,
        spoke: false,
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
      fireEvent.press(u.getByText('house'));
      fireEvent.press(u.getByText('house'));
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
      fireEvent.press(u.getByText('bread')); // miss first — red + retry note showing
      expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
      fireEvent.press(u.getByText('house')); // correct directly, skipping Try again
      // The red wrong state + retry note are cleared during the green beat.
      expect(u.queryByText('Not quite — give it another try.')).toBeNull();
      act(() => {
        jest.runAllTimers();
      });
      expect(u.props.onComplete).toHaveBeenCalledTimes(1);
      expect(u.props.onComplete).toHaveBeenCalledWith({
        itemId: 'maja',
        cardKind: 'word/hear',
        correct: false,
        spoke: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
