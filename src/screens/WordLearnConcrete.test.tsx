// Behavior + snapshot tests for the concrete word LEARN card (word/learn-concrete). The card is
// PURE (data-in/events-out): we render it with a fixture ReviewItem + jest.fn callbacks and assert
// the events it emits — no services, exposure-only (no `correct`), per BACKEND_INTEGRATION §4.
import React from 'react';
import { Image } from 'react-native';
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
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3', envelope: [0.2, 0.6, 1] },
    media: { imageUrl: 'house.png' },
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
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

  it('renders an <Image> from media.imageUrl when a real url is seeded', () => {
    const u = renderCard({ media: { imageUrl: 'house.png' } });
    const imgs = u.UNSAFE_queryAllByType(Image);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].props.source).toEqual({ uri: 'house.png' });
    expect(u.queryByLabelText('Picture placeholder')).toBeNull();
  });

  it('renders the themed placeholder (first letter) for the sentinel/missing url', () => {
    const sentinel = renderCard({ media: { imageUrl: 'placeholder' } });
    expect(sentinel.UNSAFE_queryAllByType(Image)).toHaveLength(0);
    expect(sentinel.getByLabelText('Picture placeholder')).toBeTruthy();
    expect(sentinel.getByText('M')).toBeTruthy(); // first letter of "māja"

    const missing = renderCard({ media: undefined });
    expect(missing.UNSAFE_queryAllByType(Image)).toHaveLength(0);
    expect(missing.getByLabelText('Picture placeholder')).toBeTruthy();
  });

  it('plays the native audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1x passed as the rate
  });

  it('completes as exposure-only (spoke:false, no correct) on continue', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Continue'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'maja',
      cardKind: 'word/learn-concrete',
      spoke: false,
    });
  });

  it('shows the literal/usage note when the item carries one', () => {
    const u = renderCard({ literal: 'like / as', usageNote: 'used as "how"' });
    expect(u.getByText(/like \/ as/)).toBeTruthy();
    expect(u.getByText('used as "how"')).toBeTruthy();
  });

  it('shows no literal note when the item has none', () => {
    const u = renderCard();
    expect(u.queryByText(/Literally:/)).toBeNull();
  });
});
