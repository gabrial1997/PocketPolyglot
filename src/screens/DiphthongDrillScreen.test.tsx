// Behavior + snapshot tests for the 'ie' diphthong drill card. PURE (data-in/events-out), so we
// render it with a fixture ReviewItem and jest.fn callbacks and assert the events it emits — no
// services, per BACKEND_INTEGRATION §1/§4. Stage machine: meet -> contrast -> say -> done.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { DiphthongDrillScreen } from './DiphthongDrillScreen';
import type { ReviewItem } from '../types/reviewItem';
import type { RecordingCardProps } from './cardProps';

function fixtureItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'lieta-leta',
    type: 'pair',
    stage: 'review',
    reps: 2,
    target: 'lieta',
    gloss: 'thing',
    pron: 'LYEH-ta',
    audio: { nativeUrl: 'x' },
    pair: { a: 'lieta', b: 'lēta', correct: 'a', audioUrl: 'x' },
    glide: { combo: 'ie', from: 'i', to: 'e' },
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
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
      <DiphthongDrillScreen {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

// Advance past the "meet the glide" teaching step into the minimal-pair contrast stage.
function toContrast(u: ReturnType<typeof renderCard>): void {
  fireEvent.press(u.getByText('Hear it in a word'));
}

describe('DiphthongDrillScreen', () => {
  it('renders the meet-the-glide stage (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the isolated glide (not the whole word) when the orb is tapped on the meet stage', () => {
    const u = renderCard();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('glide', 1); // default speed 1x passed as the rate
  });

  it('plays the whole word (native) on the say-it stage, not the glide', () => {
    const u = renderCard();
    toContrast(u);
    fireEvent.press(u.getByText('lieta')); // correct side -> advance
    fireEvent.press(u.getByText('Say it back'));
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1x passed as the rate
  });

  it('shows the minimal-pair contrast options after the meet step', () => {
    const u = renderCard();
    toContrast(u);
    expect(u.getByText('lieta')).toBeTruthy();
    expect(u.getByText('lēta')).toBeTruthy();
  });

  it('a WRONG pick shows the non-revealing retry note and does NOT call onComplete', () => {
    const u = renderCard();
    toContrast(u);
    fireEvent.press(u.getByText('lēta')); // wrong side ('b')
    expect(u.getByText('Not quite — give it another listen.')).toBeTruthy();
    // Did not advance to the say-it step (no Say-it CTA), and onComplete never fired.
    expect(u.queryByText('Say it back')).toBeNull();
    expect(u.props.onComplete).not.toHaveBeenCalled();
  });

  it('remembers a first-try miss across Try again — wrong→correct reports correct:false (lapse)', () => {
    // LOCKED rule + Task 8: a missed first attempt must be recorded honestly, even after the learner
    // recovers via Try again. The miss is sticky; resetting the selection must NOT erase it.
    const u = renderCard();
    toContrast(u);
    fireEvent.press(u.getByText('lēta')); // wrong side ('b') -> miss
    fireEvent.press(u.getByText('Try again')); // resets the selection
    fireEvent.press(u.getByText('lieta')); // correct side ('a') -> advance
    fireEvent.press(u.getByText('Say it back'));
    fireEvent.press(u.getByLabelText('Record'));
    fireEvent.press(u.getByLabelText('Stop recording'));
    fireEvent.press(u.getByText('Next combination'));
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'lieta-leta',
      cardKind: 'diphthong',
      correct: false,
      spoke: true,
    });
  });

  it('a CORRECT pick advances and the full loop reports correct:true + spoke', () => {
    const u = renderCard();
    toContrast(u);
    fireEvent.press(u.getByText('lieta')); // correct side ('a')
    fireEvent.press(u.getByText('Say it back'));
    fireEvent.press(u.getByLabelText('Record')); // idle -> rec
    fireEvent.press(u.getByLabelText('Stop recording')); // rec -> done
    fireEvent.press(u.getByText('Next combination')); // done -> onComplete (visual-sync CTA copy)
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'lieta-leta',
      cardKind: 'diphthong',
      correct: true,
      spoke: true,
    });
  });
});
