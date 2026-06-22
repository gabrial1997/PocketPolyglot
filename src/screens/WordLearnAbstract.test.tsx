// Behavior + snapshot tests for the abstract word LEARN card (word/learn-abstract). The card is
// PURE (data-in/events-out): we render it with a fixture ReviewItem + jest.fn callbacks and assert
// the events it emits — no services, exposure-only (no `correct`), per BACKEND_INTEGRATION §4.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WordLearnAbstract } from './WordLearnAbstract';
import type { ReviewItem } from '../types/reviewItem';
import type { BaseCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'brivs',
    type: 'word',
    stage: 'new',
    reps: 0,
    target: 'brīvs',
    gloss: 'free',
    pron: 'BREEVS',
    wordClass: 'abstract',
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3' },
    mnemonic: { soundsLike: 'breeze', note: 'a free breeze blows where it likes' },
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
      <WordLearnAbstract {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

describe('WordLearnAbstract', () => {
  it('renders the mnemonic from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
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
      itemId: 'brivs',
      cardKind: 'word/learn-abstract',
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
