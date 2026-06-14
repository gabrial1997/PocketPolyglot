// Behavior + snapshot tests for the phrase-gating locked card (phrase/locked). The card is PURE
// gating UI: it renders the phrase from a fixture ReviewItem in a locked state and emits no
// review events (no CardResult), per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render } from '@testing-library/react-native';
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
    ...overrides,
  };
}

function renderCard(overrides: Partial<ReviewItem> = {}) {
  const props: PhraseGateProps = {
    item: fixtureItem(overrides),
    onPlay: jest.fn(),
    onComplete: jest.fn(),
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
});
