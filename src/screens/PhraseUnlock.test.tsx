// Behavior + snapshot tests for the phrase-gating unlock card (phrase/unlock). The card is PURE:
// on reveal it fires onUnlocked?.() and the controller plays the unlock chime via AudioService
// then auto-advances (BACKEND_INTEGRATION §4/§7). The card itself imports no audio and calls no
// audio API — it only emits the event. onUnlocked is optional, so omitting it must not crash.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PhraseUnlock } from './PhraseUnlock';
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

function renderCard(props: Partial<PhraseGateProps> = {}) {
  const merged: PhraseGateProps = {
    item: fixtureItem(),
    onPlay: jest.fn(),
    onComplete: jest.fn(),
    onUnlocked: jest.fn(),
    ...props,
  };
  const utils = render(
    <ThemeProvider>
      <PhraseUnlock {...merged} />
    </ThemeProvider>,
  );
  return { ...utils, props: merged };
}

describe('PhraseUnlock', () => {
  it('renders the unlock reveal from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('fires onUnlocked exactly once on reveal (controller owns the chime)', () => {
    const onUnlocked = jest.fn();
    renderCard({ onUnlocked });
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('does not crash when onUnlocked is omitted (it is optional)', () => {
    expect(() => renderCard({ onUnlocked: undefined })).not.toThrow();
  });

  it('shows the English meaning on the reveal', () => {
    const u = renderCard({ item: fixtureItem({ gloss: 'Hello, I am ___.' }) });
    expect(u.getByText('Hello, I am ___.')).toBeTruthy();
  });
});
