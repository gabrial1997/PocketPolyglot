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
    ...overrides,
  };
}

function renderCard(overrides: Partial<ReviewItem> = {}) {
  const props: RecordingCardProps = {
    item: fixtureItem(overrides),
    onPlay: jest.fn(),
    onRecordStart: jest.fn(),
    onRecordStop: jest.fn(),
    onPlayCompare: jest.fn(),
    onComplete: jest.fn(),
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
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('native');
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
});
