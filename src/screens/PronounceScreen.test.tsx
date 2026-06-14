// Behavior + snapshot tests for the pronunciation-compare card. The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4. Scoring is backend
// ML, so this card reports { spoke } only (no `correct`).
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
      <PronounceScreen {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

// Drive the card listen -> rec -> compare.
function runLoop(u: ReturnType<typeof renderCard>) {
  fireEvent.press(u.getByLabelText('Record')); // listen -> rec, fires onRecordStart
  fireEvent.press(u.getByLabelText('Stop recording')); // rec -> compare, fires onRecordStop
  fireEvent.press(u.getByText('Continue')); // compare -> onComplete
}

describe('PronounceScreen', () => {
  it('renders the listen stage from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native model when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('completes with spoke and no `correct` field (scoring is backend ML)', () => {
    const u = renderCard();
    runLoop(u);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'maja',
      cardKind: 'pron',
      spoke: true,
    });
    const result = (u.props.onComplete as jest.Mock).mock.calls[0][0];
    expect(result).not.toHaveProperty('correct');
  });

  it('signals onRecordStop without fabricating a recording (the recorder owns the take)', () => {
    const u = renderCard();
    runLoop(u);
    expect(u.props.onRecordStop).toHaveBeenCalledTimes(1);
    expect(u.props.onRecordStop).not.toHaveBeenCalledWith('stub://recording');
  });

  it('lets the user replay both the original and their own take (A/B self-compare)', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Record'));
    fireEvent.press(u.getByLabelText('Stop recording'));
    fireEvent.press(u.getByText('Play original'));
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('native');
    fireEvent.press(u.getByText('Play yours'));
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('you');
  });
});
