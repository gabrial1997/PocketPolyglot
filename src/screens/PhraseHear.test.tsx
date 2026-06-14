// Behavior + snapshot tests for the first-exposure phrase card (phrase/hear). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PhraseHear } from './PhraseHear';
import type { ReviewItem } from '../types/reviewItem';
import type { BaseCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'labrit',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Labrīt!',
    gloss: 'Good morning!',
    pron: 'LAH-breet',
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3' },
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
      <PhraseHear {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

describe('PhraseHear', () => {
  it('renders the phrase from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('completes as first exposure (spoke:false) on continue', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Continue'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/hear',
      spoke: false,
    });
  });
});
