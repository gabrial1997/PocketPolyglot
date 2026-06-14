// Behavior + snapshot tests for the minimal-pair drill card. The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
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

// Drive the card pick -> rec -> done. Pass {side} to choose 'a' (correct) or 'b' (wrong).
function runLoop(u: ReturnType<typeof renderCard>, side: 'sit' | 'sīt') {
  fireEvent.press(u.getByText(side)); // pick a|b
  fireEvent.press(u.getByLabelText('Record')); // idle -> rec, fires onRecordStart
  fireEvent.press(u.getByLabelText('Stop recording')); // rec -> done, fires onRecordStop
  fireEvent.press(u.getByText('Continue')); // done -> onComplete
}

describe('DrillScreen', () => {
  it('renders the pick stage from item.pair (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the pair audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('reports correct:true when the right side is picked, then completes spoke', () => {
    const u = renderCard();
    runLoop(u, 'sit'); // 'a' is the correct side
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'sit-sip',
      cardKind: 'drill',
      correct: true,
      spoke: true,
    });
  });

  it('reports correct:false when the wrong side is picked', () => {
    const u = renderCard();
    runLoop(u, 'sīt'); // 'b' is the wrong side
    expect(u.props.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'sit-sip', cardKind: 'drill', correct: false, spoke: true }),
    );
  });

  it('signals onRecordStop without fabricating a recording (the recorder owns the take)', () => {
    const u = renderCard();
    runLoop(u, 'sit');
    expect(u.props.onRecordStop).toHaveBeenCalledTimes(1);
    expect(u.props.onRecordStop).not.toHaveBeenCalledWith('stub://recording');
  });
});
