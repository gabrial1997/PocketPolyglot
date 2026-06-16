// Behavior + snapshot tests for the core-loop card (word/pic-review). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
import React from 'react';
import { Image } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WordPicReview } from './WordPicReview';
import type { ReviewItem } from '../types/reviewItem';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

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
    media: { imageUrl: 'house.png' },
    choices: [
      { value: 'māja', gloss: 'house', correct: true },
      { value: 'maize', gloss: 'bread', correct: false },
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
      <WordPicReview {...props} />
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

describe('WordPicReview', () => {
  it('renders the choose stage from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native audio when the play orb is tapped', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native');
  });

  it('renders an <Image> from media.imageUrl when a real url is seeded', () => {
    const u = renderCard({ media: { imageUrl: 'house.png' } });
    const imgs = u.UNSAFE_queryAllByType(Image);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].props.source).toEqual({ uri: 'house.png' });
    expect(u.queryByLabelText('Picture placeholder')).toBeNull();
  });

  it('renders the themed placeholder (first letter) for the sentinel/missing url', () => {
    const sentinel = renderCard({ media: { imageUrl: 'placeholder' } });
    expect(sentinel.UNSAFE_queryAllByType(Image)).toHaveLength(0);
    expect(sentinel.getByLabelText('Picture placeholder')).toBeTruthy();
    expect(sentinel.getByText('M')).toBeTruthy(); // first letter of "māja"

    const missing = renderCard({ media: undefined });
    expect(missing.UNSAFE_queryAllByType(Image)).toHaveLength(0);
    expect(missing.getByLabelText('Picture placeholder')).toBeTruthy();
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
      cardKind: 'word/pic-review',
      correct: true,
      spoke: true,
    });
  });

  it('reports correct:false when a wrong choice is picked before the right one', () => {
    const u = renderCard();
    runLoop(u, { miss: true });
    expect(u.props.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'maja', correct: false, spoke: true }),
    );
  });

  it('a wrong pick does NOT advance and shows a non-revealing retry note', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('maize')); // wrong
    // Stays on choose: no "Now say it" prompt appeared, and the correct word is not revealed.
    expect(u.queryByText('Now say it')).toBeNull();
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
    expect(u.getByLabelText('Try again')).toBeTruthy();
    // The correct option ('māja') is still just a normal option, tappable to proceed.
    fireEvent.press(u.getByText('māja'));
    expect(u.getByText('Now say it')).toBeTruthy();
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
    fireEvent.press(u.getByText('Play original'));
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('native');
    fireEvent.press(u.getByText('Play yours'));
    expect(u.props.onPlayCompare).toHaveBeenCalledWith('you');
  });

  it('begins recording from the speak prompt, not only the mic orb', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('māja')); // choose -> speak
    fireEvent.press(u.getByText('Now say it'));
    expect(u.props.onRecordStart).toHaveBeenCalled();
  });
});
