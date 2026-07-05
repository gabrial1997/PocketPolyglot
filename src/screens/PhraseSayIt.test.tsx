// Behavior + snapshot tests for the say-it phrase card (phrase/sayit). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4. The recorder owns the
// take, so the card signals onRecordStop() with NO argument (the controller merges `recording`).
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PhraseSayIt } from './PhraseSayIt';
import type { ReviewItem } from '../types/reviewItem';
import type { RecordingCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'labrit',
    type: 'phrase',
    stage: 'mature',
    reps: 6,
    target: 'Labrīt!',
    gloss: 'Good morning!',
    audio: { nativeUrl: 'native.mp3' },
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
    ...overrides,
  };
}

function renderCard(overrides: Partial<ReviewItem> = {}, extra: Partial<RecordingCardProps> = {}) {
  const props: RecordingCardProps = {
    item: fixtureItem(overrides),
    onPlay: jest.fn(),
    onRecordStart: jest.fn(),
    onRecordStop: jest.fn(),
    onPlayCompare: jest.fn(),
    onComplete: jest.fn(),
    ...extra,
  };
  const utils = render(
    <ThemeProvider>
      <PhraseSayIt {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

// Drive the card cue -> rec -> compare so the self-rating buttons are visible.
function toRating(u: ReturnType<typeof renderCard>) {
  fireEvent.press(u.getByLabelText('Record')); // cue -> rec, fires onRecordStart
  fireEvent.press(u.getByLabelText('Stop recording')); // rec -> compare, fires onRecordStop
}

describe('PhraseSayIt', () => {
  it('renders the cue stage from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('does not offer pre-hear audio on the cue stage (productive recall)', () => {
    const u = renderCard();
    expect(u.queryByLabelText('Play')).toBeNull();
    expect(u.getByLabelText('Record')).toBeTruthy();
  });

  it('offers native-vs-you compare AFTER recording', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Record')); // cue -> rec
    fireEvent.press(u.getByLabelText('Stop recording')); // rec -> compare
    // Visual-sync: compare is via the Native / You rows (CompareRow), not "Play original/yours".
    fireEvent.press(u.getByText('Native'));
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('native', 1); // native model slowed by the co-located SpeedChip (default 1x)
    fireEvent.press(u.getByText('You'));
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('you');
  });

  it('completes with selfRating "good" when the user rates good', () => {
    const u = renderCard();
    toRating(u);
    // Visual-sync: the "good" self-rating button reads "Got it".
    fireEvent.press(u.getByText('Got it'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/sayit',
      spoke: true,
      selfRating: 'good',
    });
  });

  it('completes with selfRating "again" when the user rates again', () => {
    const u = renderCard();
    toRating(u);
    // Visual-sync: the "again" self-rating button reads "Not yet".
    fireEvent.press(u.getByText('Not yet'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/sayit',
      spoke: true,
      selfRating: 'again',
    });
  });

  it('signals onRecordStop without fabricating a recording (the recorder owns the take)', () => {
    const u = renderCard();
    toRating(u);
    expect(u.props.onRecordStop).toHaveBeenCalledTimes(1);
    expect(u.props.onRecordStop).not.toHaveBeenCalledWith('stub://recording');
  });

  it('shows the REAL projected interval after a "good" rating — not a fabricated number', () => {
    const u = renderCard({ reviewPreview: { pass: 'Next review in 9 days', miss: 'Next review later today' } });
    toRating(u);
    fireEvent.press(u.getByText('Got it'));
    expect(u.getByText('Next review in 9 days.')).toBeTruthy();
  });

  it('falls back to a neutral truthful note when no schedule is available (stub/sample data)', () => {
    const u = renderCard(); // no reviewPreview
    toRating(u);
    fireEvent.press(u.getByText('Got it'));
    expect(u.getByText('Your next review is scheduled.')).toBeTruthy();
  });

  // ── recConsent gate (Task E3) ────────────────────────────────────────────────
  // When recConsent=false the MicOrb / record affordance must be hidden; "Show the phrase" still
  // reaches the compare stage, and self-rate good/again still emits { cardKind:'phrase/sayit', spoke:true, selfRating }.

  it('recConsent=false: MicOrb not rendered on the cue stage', () => {
    const u = renderCard({}, { recConsent: false });
    expect(u.queryByLabelText('Record')).toBeNull();
    expect(u.queryByLabelText('Stop recording')).toBeNull();
    // The "Show the phrase" ghost still exists so the user can reach compare without recording
    expect(u.getByText('Show the phrase')).toBeTruthy();
  });

  it('recConsent=false: "Show the phrase" reaches compare without recording', () => {
    const u = renderCard({}, { recConsent: false });
    fireEvent.press(u.getByText('Show the phrase'));
    // Compare stage reached — phrase is visible
    expect(u.getByText('Labrīt!')).toBeTruthy();
    // Self-rate buttons are present
    expect(u.getByText('Got it')).toBeTruthy();
    expect(u.getByText('Not yet')).toBeTruthy();
    // MicOrb still hidden in compare stage
    expect(u.queryByLabelText('Record')).toBeNull();
  });

  it('recConsent=false: self-rate "good" emits { cardKind:phrase/sayit, spoke:true, selfRating:good }', () => {
    const u = renderCard({}, { recConsent: false });
    fireEvent.press(u.getByText('Show the phrase'));
    fireEvent.press(u.getByText('Got it'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/sayit',
      spoke: true,
      selfRating: 'good',
    });
  });

  it('recConsent=false: self-rate "again" emits { cardKind:phrase/sayit, spoke:true, selfRating:again }', () => {
    const u = renderCard({}, { recConsent: false });
    fireEvent.press(u.getByText('Show the phrase'));
    fireEvent.press(u.getByText('Not yet'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'labrit',
      cardKind: 'phrase/sayit',
      spoke: true,
      selfRating: 'again',
    });
  });

  // ── recConsent gate, beta fix 2026-07-05 ──────────────────────────────────────
  // The gate must be HONEST: say why the mic is gone, and never offer a "You" playback that
  // cannot exist (no recording was possible).

  it('recConsent=false: cue stage explains that recording is off', () => {
    const u = renderCard({}, { recConsent: false });
    expect(u.getByText('Recording is off — turn it on in Settings to hear yourself.')).toBeTruthy();
  });

  it('recConsent=false: compare stage hides the "You" row and Play back-to-back', () => {
    const u = renderCard({}, { recConsent: false });
    fireEvent.press(u.getByText('Show the phrase'));
    expect(u.queryByText('You')).toBeNull();
    expect(u.queryByText('Play back-to-back')).toBeNull();
    expect(u.getByText('Native')).toBeTruthy(); // the model stays available
  });

  it('recConsent=true: compare stage still offers You + Play back-to-back', () => {
    const u = renderCard({}, { recConsent: true });
    fireEvent.press(u.getByText('Show the phrase'));
    expect(u.getByText('You')).toBeTruthy();
    expect(u.getByText('Play back-to-back')).toBeTruthy();
  });
});
