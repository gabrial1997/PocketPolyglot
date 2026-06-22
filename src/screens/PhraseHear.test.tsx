// Behavior + snapshot tests for the first-exposure phrase card (phrase/hear). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PhraseHear, REPEAT_DELAY_MS } from './PhraseHear';
import type { ReviewItem } from '../types/reviewItem';
import type { BaseCardProps } from './cardProps';

// The fixture carries no envelope, so the card uses its FALLBACK_MS clip length (1600ms); the
// repeat is scheduled clipLength + REPEAT_DELAY_MS after mount. Advance past that to see it fire.
const FALLBACK_MS = 1600;

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
      <PhraseHear {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

describe('PhraseHear', () => {
  // The card auto-plays on mount and schedules a repeat timer, so drive every test with fake timers
  // — otherwise those deferred state updates fire outside act() and warn.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders the phrase from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1x passed as the rate
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

  it('says the phrase then repeats it once on first show', () => {
    const u = renderCard(); // mount auto-plays once
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1x passed as the rate
    expect(u.props.onPlay).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(FALLBACK_MS + REPEAT_DELAY_MS + 50);
    });
    expect(u.props.onPlay).toHaveBeenCalledTimes(2); // repeats it, exactly once
  });

  it('shows the literal/usage note when the phrase carries one', () => {
    const u = renderCard({ literal: 'how to-you goes?', usageNote: 'everyday "How are you?"' });
    expect(u.getByText(/how to-you goes\?/)).toBeTruthy();
    expect(u.getByText('everyday "How are you?"')).toBeTruthy();
  });

  it('shows no literal note when the phrase has none', () => {
    const u = renderCard();
    expect(u.queryByText(/Literally:/)).toBeNull();
  });
});
