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
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('reports correct:true when the right meaning is chosen', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Good morning!'));
    expect(u.props.onAnswer).toHaveBeenCalledWith('gm', true);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/meaning',
      correct: true,
    });
  });

  it('reports correct:false when a wrong meaning is chosen', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Good night!'));
    expect(u.props.onAnswer).toHaveBeenCalledWith('gn', false);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/meaning',
      correct: false,
    });
  });
});
