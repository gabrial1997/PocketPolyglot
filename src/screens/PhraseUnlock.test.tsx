// Behavior + snapshot tests for the phrase-gating unlock card (phrase/unlock). The card is PURE:
// on reveal it fires onUnlocked?.() and the controller plays the unlock chime via AudioService
// then auto-advances (BACKEND_INTEGRATION §4/§7). The card itself imports no audio and calls no
// audio API — it only emits the event. onUnlocked is optional, so omitting it must not crash.
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PhraseUnlock, FILL_DELAY_MS, FILL_DURATION_MS } from './PhraseUnlock';
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

  it('highlights the just-learned form in the phrase when the item carries one (typed field, no cast)', () => {
    const u = renderCard({ item: fixtureItem({ target: 'Es dzeru tēju.', newForm: 'dzeru' }) });
    expect(u.getByText('dzeru')).toBeTruthy();
  });

  it('the hearing-it fill completes before the controller auto-advance (UNLOCK_DELAY_MS = 1800ms)', () => {
    // Keep a readable margin: the fill must visibly land at 100% before the card leaves.
    expect(FILL_DELAY_MS + FILL_DURATION_MS).toBeLessThanOrEqual(1800 - 250);
  });

  it('probes reduce-motion on mount and settles to the end-state without crashing when it is on', async () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    try {
      const u = renderCard();
      await act(async () => {}); // flush the mount-time probe promise
      expect(spy).toHaveBeenCalled();
      // Content is at the visible end-state (rendered, not stuck mid-entrance).
      expect(u.getByText('PHRASE UNLOCKED')).toBeTruthy();
      expect(u.getByText('You know all its words now.')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
