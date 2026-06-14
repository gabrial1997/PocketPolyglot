// Behavior + snapshot tests for the function word LEARN card (word/learn-function). The card is
// PURE (data-in/events-out): we render it with a fixture ReviewItem + jest.fn callbacks and assert
// the events it emits — no services, exposure-only (no `correct`), per BACKEND_INTEGRATION §4.
// Each example sentence is independently playable via onPlay(exampleIndex).
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WordLearnFunction } from './WordLearnFunction';
import type { ReviewItem } from '../types/reviewItem';
import type { BaseCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'uz',
    type: 'word',
    stage: 'new',
    reps: 0,
    target: 'uz',
    gloss: 'on / to',
    pron: 'OOZ',
    wordClass: 'function',
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3' },
    examples: [
      { pre: 'Grāmata ir', w: 'uz', post: 'galda.', en: 'The book is on the table.', audioUrl: 'ex0.mp3' },
      { pre: 'Es eju', w: 'uz', post: 'mājām.', en: 'I am going home.', audioUrl: 'ex1.mp3' },
      { pre: 'Skaties', w: 'uz', post: 'mani.', en: 'Look at me.', audioUrl: 'ex2.mp3' },
    ],
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
      <WordLearnFunction {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

describe('WordLearnFunction', () => {
  it('renders the example sentences from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays a specific example by its index when that example is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('I am going home.'));
    expect(u.props.onPlay).toHaveBeenCalledWith(1);
  });

  it('completes as exposure-only (spoke:false, no correct) on continue', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('First review tomorrow'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'uz',
      cardKind: 'word/learn-function',
      spoke: false,
    });
  });
});
