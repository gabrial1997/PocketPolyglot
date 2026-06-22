// Behavior + snapshot tests for the phrase-gating locked card (phrase/locked). The card is PURE
// gating UI: it renders the phrase from a fixture ReviewItem in a locked state and emits no
// review events (no CardResult), per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PhraseLocked } from './PhraseLocked';
import type { ReviewItem } from '../types/reviewItem';
import type { PhraseGateProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'labrit',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Labrīt!',
    gloss: 'Good morning!',
    audio: { nativeUrl: 'native.mp3' },
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
    ...overrides,
  };
}

function renderCard(overrides: Partial<ReviewItem> = {}, propOverrides: Partial<PhraseGateProps> = {}) {
  const props: PhraseGateProps = {
    item: fixtureItem(overrides),
    onPlay: jest.fn(),
    onComplete: jest.fn(),
    ...propOverrides,
  };
  const utils = render(
    <ThemeProvider>
      <PhraseLocked {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

describe('PhraseLocked', () => {
  it('renders the locked state from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows the phrase text from item, not hard-coded content', () => {
    const u = renderCard({ target: 'Uz redzēšanos!' });
    expect(u.getByText('Uz redzēšanos!')).toBeTruthy();
  });

  // The locked card is a gate (not a review): a Continue control advances the deck without
  // posting a CardResult. Without it the deck dead-ends on the glimpse.
  it('renders a Continue control that fires onAdvance (gate advance, no review)', () => {
    const onAdvance = jest.fn();
    const u = renderCard({}, { onAdvance });
    fireEvent.press(u.getByText('Continue'));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('does not crash when onAdvance is omitted (it is optional)', () => {
    const u = renderCard();
    expect(() => fireEvent.press(u.getByText('Continue'))).not.toThrow();
  });
});
