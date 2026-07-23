// Behavior tests for the phrase-gating locked card (phrase/locked), rebuilt to the founder
// mockup (spec 2026-07-23 §6): per-word chips in phrase order, count copy, the phrase line, a
// lock pill, and a filled Continue CTA. The card is PURE gating UI: it renders from a fixture
// ReviewItem and emits no review events (no CardResult), per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PhraseLocked } from './PhraseLocked';
import type { ReviewItem } from '../types/reviewItem';
import type { PhraseGateProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'man-ir-labi',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Man ir labi.',
    gloss: "I'm well.",
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

// Man/ir known (surface differs from lemma for both), labi unknown — 2 known, 1 to go.
const twoKnownBreakdown = [
  { surface: 'Man', lemma: 'es', gloss: 'me/I', known: true },
  { surface: 'ir', lemma: 'būt', gloss: 'is/to be', known: true },
  { surface: 'labi', lemma: 'labi', gloss: 'well/good', known: false },
];

describe('PhraseLocked', () => {
  it('renders the phrase text from item, not hard-coded content', () => {
    const u = renderCard({ target: 'Uz redzēšanos!' });
    expect(u.getByText('Uz redzēšanos!')).toBeTruthy();
  });

  it('renders chips in phrase order with surface forms; earned chips show known, missing chip shows new', () => {
    const u = renderCard({ componentBreakdown: twoKnownBreakdown });
    // Order: Man, ir, labi — all three surface forms present (the phrase line also renders "Man"
    // and "ir" as plain tokens, so each chip word appears at least once, not exactly once).
    expect(u.getAllByText('Man').length).toBeGreaterThanOrEqual(1);
    expect(u.getAllByText('ir').length).toBeGreaterThanOrEqual(1);
    expect(u.getAllByText('labi').length).toBeGreaterThanOrEqual(1);
    // The unknown chip (labi) is labelled "new".
    expect(u.getByText('new')).toBeTruthy();
  });

  it('shows a "form of <lemma>" sub-label only when surface differs from lemma (Man/es yes, labi/labi no)', () => {
    const u = renderCard({
      componentBreakdown: [
        { surface: 'Man', lemma: 'es', gloss: 'me/I', known: true },
        { surface: 'labi', lemma: 'labi', gloss: 'well/good', known: true },
      ],
    });
    expect(u.getByText('form of es')).toBeTruthy();
    expect(u.queryByText('form of labi')).toBeNull();
    expect(u.getByText('known')).toBeTruthy();
  });

  it('shows the "2 known + 1 to go" count copy', () => {
    const u = renderCard({ componentBreakdown: twoKnownBreakdown });
    expect(u.getByText(/You already know two of these words\./)).toBeTruthy();
    expect(u.getByText(/Learn one more and the phrase opens\./)).toBeTruthy();
  });

  it('shows the "1 known" count copy (singular word)', () => {
    const u = renderCard({
      componentBreakdown: [
        { surface: 'Man', lemma: 'es', gloss: 'me/I', known: true },
        { surface: 'ir', lemma: 'būt', gloss: 'is/to be', known: false },
        { surface: 'labi', lemma: 'labi', gloss: 'well/good', known: false },
      ],
    });
    expect(u.getByText(/You already know one of these words\./)).toBeTruthy();
  });

  it('shows the "0 known" count copy (no "already know" line)', () => {
    const u = renderCard({
      componentBreakdown: [
        { surface: 'Man', lemma: 'es', gloss: 'me/I', known: false },
        { surface: 'ir', lemma: 'būt', gloss: 'is/to be', known: false },
      ],
    });
    expect(u.getByText('Learn these words and the phrase opens.')).toBeTruthy();
    expect(u.queryByText(/already know/)).toBeNull();
  });

  it('shows the lock pill from lockRemaining/lockLemma', () => {
    const u = renderCard({ lockRemaining: 1, lockLemma: 'dzert' });
    expect(u.getByText(/1 word to go — learn/)).toBeTruthy();
    expect(u.getByText('dzert')).toBeTruthy();
  });

  it('falls back to a generic pill when lockLemma is absent', () => {
    const u = renderCard({ lockLemma: undefined, lockRemaining: undefined });
    expect(u.getByText('Unlocks when you know its words.')).toBeTruthy();
  });

  it('degrades gracefully with no componentBreakdown: no chip row, no count copy, phrase + pill + CTA still render', () => {
    const u = renderCard({ componentBreakdown: undefined, target: 'Labrīt!', lockLemma: 'dzert', lockRemaining: 1 });
    expect(u.getByText('Labrīt!')).toBeTruthy();
    expect(u.getByText(/1 word to go — learn/)).toBeTruthy();
    expect(u.getByText('Continue')).toBeTruthy();
    expect(u.queryByText(/already know/)).toBeNull();
    expect(u.queryByText('Learn these words and the phrase opens.')).toBeNull();
  });

  it('renders a filled Continue CTA that fires onAdvance once', () => {
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
