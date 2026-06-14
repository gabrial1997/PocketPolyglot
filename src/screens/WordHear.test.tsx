// Behavior + snapshot tests for the recognition card (word/hear). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('reports the chosen gloss and completes as correct when the right gloss is picked', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('house'));
    expect(u.props.onAnswer).toHaveBeenCalledWith('maja', true);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'maja',
      cardKind: 'word/hear',
      correct: true,
      spoke: false,
    });
  });

  it('completes as incorrect (still spoke:false) when a wrong gloss is picked', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('bread'));
    expect(u.props.onAnswer).toHaveBeenCalledWith('maize', false);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'maja',
      cardKind: 'word/hear',
      correct: false,
      spoke: false,
    });
  });
});
