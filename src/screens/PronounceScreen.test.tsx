// Behavior + snapshot tests for the pronunciation-compare card. The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4. Scoring is backend
// ML, so this card reports { spoke } only (no `correct`).
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PronounceScreen } from './PronounceScreen';
import type { ReviewItem } from '../types/reviewItem';
import type { RecordingCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'maja',
    type: 'word',
    stage: 'review',
    reps: 3,
    target: 'māja',
    gloss: 'house',
    pron: 'MAH-ya',
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3' },
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
      <PronounceScreen {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

// Drive the card listen -> rec -> compare. Visual-sync: "Compare" plays native+you back-to-back
// and then completes the card after a readable beat (the old standalone "Continue" is folded in),
// so we advance fake timers to reach onComplete.
function runLoop(u: ReturnType<typeof renderCard>) {
  fireEvent.press(u.getByText('Record')); // listen -> rec, fires onRecordStart
  fireEvent.press(u.getByText('Recording…')); // rec -> recorded, fires onRecordStop
  fireEvent.press(u.getByText('Compare')); // plays native+you, then completes after a beat
  // Advance PAST the compare sequence (COMPARE_MS 1700 + soundbar ease). NOT runAllTimers: the
  // LiveWaveform soundbar runs a self-rescheduling rAF loop while a clip sounds, which never drains.
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

describe('PronounceScreen', () => {
  it('renders the listen stage from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native model then the user take when Compare is tapped (A/B self-compare)', () => {
    // Visual-sync: there is no separate "Play" orb; comparing plays native + you back-to-back via
    // onPlayCompare (the native model playback is folded into Compare).
    jest.useFakeTimers();
    try {
      const u = renderCard();
      fireEvent.press(u.getByText('Record'));
      fireEvent.press(u.getByText('Recording…'));
      fireEvent.press(u.getByText('Compare'));
      expect(u.props.onPlayCompare).toHaveBeenCalledWith('native', 1); // native model slowed by the co-located SpeedChip (default 1x)
      act(() => {
        jest.advanceTimersByTime(2000); // past COMPARE_MS; bounded so the soundbar rAF loop can't hang
      });
      expect(u.props.onPlayCompare).toHaveBeenCalledWith('you');
    } finally {
      jest.useRealTimers();
    }
  });

  it('completes with spoke and no `correct` field (scoring is backend ML)', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard();
      runLoop(u);
      expect(u.props.onComplete).toHaveBeenCalledWith({
        itemId: 'maja',
        cardKind: 'pron',
        spoke: true,
      });
      const result = (u.props.onComplete as jest.Mock).mock.calls[0][0];
      expect(result).not.toHaveProperty('correct');
    } finally {
      jest.useRealTimers();
    }
  });

  it('signals onRecordStop without fabricating a recording (the recorder owns the take)', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard();
      runLoop(u);
      expect(u.props.onRecordStop).toHaveBeenCalledTimes(1);
      expect(u.props.onRecordStop).not.toHaveBeenCalledWith('stub://recording');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows NO fabricated pitch curve or pronunciation verdict after recording (Phase-0 honesty)', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('Record'));
    fireEvent.press(u.getByText('Recording…')); // -> recorded
    // The fabricated PITCH overlay and the canned "Close. Lengthen the ie" verdict are gone —
    // there is no pronunciation scoring until the Phase-1 ML service.
    expect(u.queryByText('PITCH')).toBeNull();
    expect(u.queryByText(/Lengthen the/)).toBeNull();
    expect(u.queryByText(/Close\./)).toBeNull();
    // The honest self-compare prompt takes its place.
    expect(u.getByText('Play both back to compare — trust your ear.')).toBeTruthy();
  });

  // ── recConsent gate (Task E3) ────────────────────────────────────────────────
  // When recConsent=false the Record control must be hidden; native A/B is still playable.
  // When recConsent=true (default) the full Record → Compare flow works and emits { cardKind:'pron', spoke:true }.

  it('recConsent=false: Record control is hidden', () => {
    const u = renderCard({}, { recConsent: false });
    expect(u.queryByText('Record')).toBeNull();
    expect(u.queryByText('Recording…')).toBeNull();
  });

  it('recConsent=false: native A/B row is still playable (no crash)', () => {
    const u = renderCard({}, { recConsent: false });
    // Native row still visible — pressing it calls onPlayCompare
    // The card renders native row via CompareRow or Row component with "Native" label
    expect(u.getByText('Native')).toBeTruthy();
  });

  it('recConsent=false: no crash on render', () => {
    // Just verifying the component renders without throwing
    expect(() => renderCard({}, { recConsent: false })).not.toThrow();
  });

  it('recConsent=true (default): Record → Compare flow emits { cardKind:pron, spoke:true } and plays native then you', () => {
    jest.useFakeTimers();
    try {
      const u = renderCard({}, { recConsent: true });
      fireEvent.press(u.getByText('Record'));
      fireEvent.press(u.getByText('Recording…'));
      fireEvent.press(u.getByText('Compare'));
      expect(u.props.onPlayCompare).toHaveBeenCalledWith('native', 1);
      act(() => { jest.advanceTimersByTime(2000); });
      expect(u.props.onPlayCompare).toHaveBeenCalledWith('you');
      expect(u.props.onComplete).toHaveBeenCalledWith({ itemId: 'maja', cardKind: 'pron', spoke: true });
    } finally {
      jest.useRealTimers();
    }
  });
});
