// Behavior + snapshot tests for the concrete word LEARN card (word/learn-concrete). The card is
// PURE (data-in/events-out): we render it with a fixture ReviewItem + jest.fn callbacks and assert
// the events it emits — no services, exposure-only (no `correct`), per BACKEND_INTEGRATION §4.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WordLearnConcrete } from './WordLearnConcrete';
import type { ReviewItem } from '../types/reviewItem';
import type { BaseCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'maja',
    type: 'word',
    stage: 'new',
    reps: 0,
    target: 'māja',
    gloss: 'house',
    pron: 'MAH-ya',
    wordClass: 'concrete',
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3' },
    media: { imageUrl: 'house.png' },
    ...overrides,
  };
}

function renderCard(overrides: Partial<ReviewItem> = {}) {
  const props: BaseCardProps = {
    item: fixtureItem(overrides),
    onPlay: jest.fn(),
    onComplete: jest.fn(),
  };
  const utils = render(
    <ThemeProvider>
      <WordLearnConcrete {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

describe('WordLearnConcrete', () => {
  it('renders the first-exposure view from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('completes as exposure-only (spoke:false, no correct) on continue', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('First review tomorrow'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'maja',
      cardKind: 'word/learn-concrete',
      spoke: false,
    });
  });
});
