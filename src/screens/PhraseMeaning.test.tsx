// Behavior + snapshot tests for the meaning-check phrase card (phrase/meaning). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1x passed as the rate
  });

  it('completes once as correct (first try) when the right meaning is chosen', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Good morning!'));
    expect(u.props.onAnswer).toHaveBeenCalledWith('gm', true);
    // Visual-sync: the correct pick turns green and enables an explicit Continue (no auto-advance).
    expect(u.props.onComplete).not.toHaveBeenCalled();
    fireEvent.press(u.getByText('Continue'));
    expect(u.props.onComplete).toHaveBeenCalledTimes(1);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/meaning',
      correct: true,
    });
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

  it('a correct pick clears the reddened wrong selection and its retry note', () => {
    // Visual-sync: there is no separate "Try again" button — re-picking the correct option clears
    // the wrong (red) state. The non-revealing retry note + no-advance rule are preserved.
    const u = renderCard();
    fireEvent.press(u.getByText('Good night!'));
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
    fireEvent.press(u.getByText('Good morning!')); // correct pick clears the wrong state
    expect(u.queryByText('Not quite — give it another try.')).toBeNull();
  });

  it('wrong-then-correct records an honest lapse (correct:false) and completes exactly once', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Good night!')); // miss first
    fireEvent.press(u.getByText('Good morning!')); // then correct
    fireEvent.press(u.getByText('Continue')); // explicit advance (visual-sync)
    expect(u.props.onComplete).toHaveBeenCalledTimes(1);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/meaning',
      correct: false,
    });
  });

  it('double-tapping the correct option completes EXACTLY once (no double-complete race)', () => {
    const u = renderCard();
    // Two rapid taps on the correct option are idempotent; only the explicit Continue advances.
    fireEvent.press(u.getByText('Good morning!'));
    fireEvent.press(u.getByText('Good morning!'));
    fireEvent.press(u.getByText('Continue'));
    expect(u.props.onComplete).toHaveBeenCalledTimes(1);
  });

  it('a direct wrong→correct tap clears the red wrong state + retry note and completes once as a lapse', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Good night!')); // miss first — red + retry note showing
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
    fireEvent.press(u.getByText('Good morning!')); // correct directly
    // The red wrong state + retry note are cleared on the correct pick.
    expect(u.queryByText('Not quite — give it another try.')).toBeNull();
    fireEvent.press(u.getByText('Continue'));
    expect(u.props.onComplete).toHaveBeenCalledTimes(1);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/meaning',
      correct: false,
    });
  });

  it('renders nothing interactive when there are no choices (idiom-only, unseeded)', () => {
    const u = renderCard({ choices: [] });
    expect(u.queryByText('Good morning!')).toBeNull();
  });

  it('reveals the literal reading + usage note once solved', () => {
    const u = renderCard({ literal: 'good-morning!', usageNote: 'said before noon' });
    fireEvent.press(u.getByText('Good morning!')); // correct
    expect(u.getByText('said before noon')).toBeTruthy(); // usage note as the feedback line
    expect(u.getByText(/good-morning!/)).toBeTruthy(); // literal reading via LiteralNote
  });

  it('falls back to the generic idiom feedback when no usage note is authored', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Good morning!'));
    expect(u.getByText('That’s it — the words don’t add up literally.')).toBeTruthy();
  });
});
