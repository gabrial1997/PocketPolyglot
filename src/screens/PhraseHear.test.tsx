// Behavior + snapshot tests for the first-exposure phrase card (phrase/hear). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
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

  it('plays the phrase exactly once on first show — no auto-repeat (user decision 2026-06-25)', () => {
    const u = renderCard(); // mount auto-plays once
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1x passed as the rate
    expect(u.props.onPlay).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(5000); // well past any old repeat window
    });
    expect(u.props.onPlay).toHaveBeenCalledTimes(1); // still once — the repeat was removed
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

  it('renders with no audio and the mount auto-play does not throw', () => {
    expect(() => renderCard({ audio: undefined })).not.toThrow();
    const u = renderCard({ audio: undefined });
    // The written phrase still renders (exposure card needs no audio).
    expect(u.getByText(u.props.item?.target ?? 'labrīt')).toBeTruthy();
  });
});

// ── component breakdown (beta fix 2026-07-05) ────────────────────────────────
// A phrase built from known LEMMAS can surface unrecognizable FORMS ("nav" ← būt). The intro
// card teaches the mapping word-by-word at the moment it matters.
describe('PhraseHear component breakdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('renders a per-word line; changed forms name their source word', () => {
    const u = renderCard({
      target: 'Nav par ko!',
      componentBreakdown: [
        { surface: 'nav', lemma: 'būt', gloss: 'to be' },
        { surface: 'par', lemma: 'par', gloss: 'about/for' },
        { surface: 'ko', lemma: 'kas', gloss: 'what/who' },
      ],
    });
    // surface ≠ lemma → "form of" phrasing, naming the taught word
    expect(u.getByText(/form of\s+būt/)).toBeTruthy();
    expect(u.getByText(/form of\s+kas/)).toBeTruthy();
    // surface == lemma → just the gloss, no "form of"
    expect(u.getByText('about/for')).toBeTruthy();
    // all three surfaces are listed (the phrase line itself also shows the words, so 'par'
    // appears twice: once in the PhraseLine, once as a breakdown row)
    expect(u.getAllByText('nav').length).toBeGreaterThanOrEqual(1);
    expect(u.getAllByText('par').length).toBeGreaterThanOrEqual(2);
    expect(u.getAllByText('ko').length).toBeGreaterThanOrEqual(1);
  });

  it('renders no breakdown block when the item carries none', () => {
    const u = renderCard();
    expect(u.queryByText(/form of/)).toBeNull();
  });
});
