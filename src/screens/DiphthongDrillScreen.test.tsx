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

  it('a WRONG pick shows the LOCKED retry copy (non-revealing) and does NOT call onComplete', () => {
    const u = renderCard();
    toContrast(u);
    fireEvent.press(u.getByText('lēta')); // wrong side ('b')
    // LOCKED copy (CLAUDE.md wrong-answer rule) — exactly this string.
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
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

  it('preloads the GLIDE clip on mount — the meet phase’s first tap plays the glide, not native', () => {
    const u = renderCard({}, { onPreload: jest.fn() });
    expect(u.props.onPreload).toHaveBeenCalledWith('glide');
    expect(u.props.onPreload).toHaveBeenCalledWith('native');
  });

  it('stage transitions stop REAL playback via onStop, not just the local soundbar gate', () => {
    const u = renderCard({}, { onStop: jest.fn() });
    fireEvent.press(u.getByLabelText('Play')); // start the glide clip on the meet stage
    fireEvent.press(u.getByText('Hear it in a word')); // meet -> contrast
    expect(u.props.onStop).toHaveBeenCalled();
  });

  // ── recConsent gate (GDPR) ─────────────────────────────────────────────────
  // When recConsent=false the MicOrb must be hidden on the say stage, the gate must say WHY, and
  // the card must still complete via Next combination — emitting spoke:false (nothing recorded).

  it('recConsent=false: no record affordance, an honest explanation, and completion with spoke:false', () => {
    const u = renderCard({}, { recConsent: false });
    toContrast(u);
    fireEvent.press(u.getByText('lieta')); // correct side
    fireEvent.press(u.getByText('Say it back')); // -> say stage
    expect(u.queryByLabelText('Record')).toBeNull();
    expect(u.getByText('Recording is off — turn it on in Settings to hear yourself.')).toBeTruthy();
    fireEvent.press(u.getByText('Next combination')); // honest non-recording completion path
    expect(u.props.onComplete).toHaveBeenCalledWith({
      itemId: 'lieta-leta',
      cardKind: 'diphthong',
      correct: true,
      spoke: false,
    });
    expect(u.props.onRecordStart).not.toHaveBeenCalled();
  });
});
