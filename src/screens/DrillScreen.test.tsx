// Behavior + snapshot tests for the minimal-pair drill card. The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { DrillScreen } from './DrillScreen';
import type { ReviewItem } from '../types/reviewItem';
import type { RecordingCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'sit-sip',
    type: 'pair',
    stage: 'review',
    reps: 2,
    target: 'sit',
    gloss: 'this',
    audio: { nativeUrl: 'native.mp3' },
    pair: { a: 'sit', b: 'sīt', correct: 'a', audioUrl: 'pair.mp3' },
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
      <DrillScreen {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

// Drive the card pick -> rec -> done. Pass {miss:true} to tap the WRONG side first (which must
// NOT advance), then the correct side. Only the correct side ('sit') advances to the say-it step.
function runLoop(u: ReturnType<typeof renderCard>, opts: { miss?: boolean } = {}) {
  if (opts.miss) {
    fireEvent.press(u.getByText('sīt')); // wrong: stays on choose, no mic shown
    fireEvent.press(u.getByText('Try again')); // reset the selection (the miss is remembered)
  }
  fireEvent.press(u.getByText('sit')); // correct ('a'): reveals the "Say it back" CTA
  fireEvent.press(u.getByText('Say it back')); // discriminate -> say-it stage (visual-sync)
  fireEvent.press(u.getByLabelText('Record')); // idle -> rec, fires onRecordStart
  fireEvent.press(u.getByLabelText('Stop recording')); // rec -> done, fires onRecordStop
  fireEvent.press(u.getByText('Next pair')); // done -> onComplete (visual-sync CTA copy)
}

describe('DrillScreen', () => {
  it('renders the pick stage from item.pair (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the pair audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1x passed as the rate
  });

  it('reports correct:true when the right side is picked, then completes spoke', () => {
    const u = renderCard();
    runLoop(u); // clean run: correct side only
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'sit-sip',
      cardKind: 'drill',
      correct: true,
      spoke: true,
    });
  });

  it('a wrong pick does NOT advance and shows a non-revealing retry note', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('sīt')); // wrong side
    // Did not advance to the say-it step (no mic), and the correct side is not auto-revealed.
    expect(u.queryByLabelText('Record')).toBeNull();
    expect(u.getByText('Not quite — listen again and try.')).toBeTruthy();
    // The correct side stays a normal, tappable option (not highlighted green).
    expect(u.getByText('sit')).toBeTruthy();
  });

  it('reports correct:false when the wrong side is picked before the right one', () => {
    const u = renderCard();
    runLoop(u, { miss: true }); // wrong 'b' first (no advance), then correct 'a'
    expect(u.props.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'sit-sip', cardKind: 'drill', correct: false, spoke: true }),
    );
  });

  it('lets the glyph shrink to fit so long pair words never clip (device-walk: Ļoti/Lācis cut off)', () => {
    // The seeded palatalization drill pairs are whole words (lācis/ļoti), not single letters. At the
    // fixed 64px glyph size they overflow the half-width card and clip. The glyph must auto-shrink
    // on one line so any-length pair word stays fully visible.
    const u = renderCard({ pair: { a: 'lācis', b: 'ļoti', correct: 'b', audioUrl: 'pair.mp3' } });
    for (const word of ['lācis', 'ļoti']) {
      const glyph = u.getByText(word);
      expect(glyph.props.numberOfLines).toBe(1);
      expect(glyph.props.adjustsFontSizeToFit).toBe(true);
    }
  });

  it('gives the glyph vertical headroom so a top macron (ā/ī/ū) is never cropped by the line box', () => {
    // Device-walk: lācis rendered with the macron over ā sliced off. lineHeight === fontSize leaves
    // no room above the cap height for top diacritics; adjustsFontSizeToFit only fits width. The
    // glyph must reserve vertical headroom (lineHeight strictly greater than fontSize).
    const u = renderCard({ pair: { a: 'lācis', b: 'ļoti', correct: 'b', audioUrl: 'pair.mp3' } });
    const flat = StyleSheet.flatten(u.getByText('lācis').props.style) as { fontSize: number; lineHeight: number };
    expect(flat.lineHeight).toBeGreaterThan(flat.fontSize);
  });

  it('signals onRecordStop without fabricating a recording (the recorder owns the take)', () => {
    const u = renderCard();
    runLoop(u);
    expect(u.props.onRecordStop).toHaveBeenCalledTimes(1);
    expect(u.props.onRecordStop).not.toHaveBeenCalledWith('stub://recording');
  });
});
