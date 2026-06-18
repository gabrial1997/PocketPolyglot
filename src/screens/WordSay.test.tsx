// Behavior + snapshot tests for the production card (word/say). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WordSay } from './WordSay';
import type { ReviewItem } from '../types/reviewItem';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'maja',
    type: 'word',
    stage: 'review',
    reps: 4,
    target: 'māja',
    gloss: 'house',
    pron: 'MAH-ya',
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3' },
    // word/say: gloss is the cue, choices are WORDS.
    choices: [
      { value: 'māja', correct: true },
      { value: 'maize', correct: false },
    ],
    ...overrides,
  };
}

function renderCard(overrides: Partial<ReviewItem> = {}) {
  const props: RecordingCardProps & ChoiceCardProps = {
    item: fixtureItem(overrides),
    onPlay: jest.fn(),
    onAnswer: jest.fn(),
    onRecordStart: jest.fn(),
    onRecordStop: jest.fn(),
    onPlayCompare: jest.fn(),
    onComplete: jest.fn(),
  };
  const utils = render(
    <ThemeProvider>
      <WordSay {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

// Drive the card choose -> speak -> rec -> result. Pass {miss:true} to tap a wrong choice first.
function runLoop(u: ReturnType<typeof renderCard>, opts: { miss?: boolean } = {}) {
  if (opts.miss) fireEvent.press(u.getByText('maize')); // wrong: stays on choose
  fireEvent.press(u.getByText('māja')); // correct: choose -> speak
  fireEvent.press(u.getByLabelText('Record')); // speak -> rec, fires onRecordStart
  fireEvent.press(u.getByLabelText('Stop recording')); // rec -> result, fires onRecordStop
  fireEvent.press(u.getByText('Continue')); // result -> onComplete
}

describe('WordSay', () => {
  it('renders the choose stage from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native audio when the play orb is tapped (speak stage — no pre-listen on recall)', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('māja')); // choose -> speak (the play orb lives on the speak stage)
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('reports each answer via onAnswer with its correctness', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('maize'));
    expect(u.props.onAnswer).toHaveBeenCalledWith('maize', false);
  });

  it('completes a clean first-try run as correct + spoke', () => {
    const u = renderCard();
    runLoop(u);
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'maja',
      cardKind: 'word/say',
      correct: true,
      spoke: true,
    });
  });

  it('reports correct:false when a wrong choice is picked before the right one', () => {
    const u = renderCard();
    runLoop(u, { miss: true });
    expect(u.props.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'maja', cardKind: 'word/say', correct: false, spoke: true }),
    );
  });

  it('signals onRecordStop without fabricating a recording (the recorder owns the take)', () => {
    const u = renderCard();
    runLoop(u);
    expect(u.props.onRecordStop).toHaveBeenCalledTimes(1);
    expect(u.props.onRecordStop).not.toHaveBeenCalledWith('stub://recording');
  });

  it('lets the user replay both the original and their own take (A/B self-compare)', () => {
    const u = renderCard();
    runLoop(u);
    fireEvent.press(u.getByText('Native'));
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('native');
    fireEvent.press(u.getByText('You'));
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('you');
  });

  it('begins recording from the mic orb on the speak stage', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('māja')); // choose -> speak
    expect(u.getByText('Now say it')).toBeTruthy(); // prompt caption shown (not a tap target)
    fireEvent.press(u.getByLabelText('Record')); // the mic orb is the record control
    expect(u.props.onRecordStart).toHaveBeenCalled();
  });
});
