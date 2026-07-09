// Behavior + snapshot tests for the production card (word/say). The card is PURE
// (data-in/events-out), so we render it with a fixture ReviewItem and jest.fn callbacks and
// assert the events it emits — no services, per BACKEND_INTEGRATION §1/§4.
//
// A correct pick now holds a CONFIRM_MS green beat before advancing to speak (locked "correct ->
// green + advance" rule, in useLoopStage). Tests use fake timers and advanceConfirm() to step past it.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WordSay } from './WordSay';
import { CONFIRM_MS } from './useLoopStage';
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
    audio: { nativeUrl: 'native.mp3', slowUrl: 'slow.mp3', envelope: [0.2, 0.6, 1] },
    // word/say: gloss is the cue, choices are WORDS.
    choices: [
      { value: 'māja', correct: true },
      { value: 'maize', correct: false },
    ],
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
    ...overrides,
  };
}

function renderCard(overrides: Partial<ReviewItem> = {}, extra: Partial<RecordingCardProps & ChoiceCardProps> = {}) {
  const props: RecordingCardProps & ChoiceCardProps = {
    item: fixtureItem(overrides),
    onPlay: jest.fn(),
    onAnswer: jest.fn(),
    onRecordStart: jest.fn(),
    onRecordStop: jest.fn(),
    onPlayCompare: jest.fn(),
    onComplete: jest.fn(),
    ...extra,
  };
  const utils = render(
    <ThemeProvider>
      <WordSay {...props} />
    </ThemeProvider>,
  );
  return { ...utils, props };
}

// Step past the green confirm beat so the card advances choose -> speak.
function advanceConfirm(): void {
  act(() => jest.advanceTimersByTime(CONFIRM_MS));
}

// Drive the card choose -> speak -> rec -> result. Pass {miss:true} to tap a wrong choice first.
function runLoop(u: ReturnType<typeof renderCard>, opts: { miss?: boolean } = {}) {
  if (opts.miss) fireEvent.press(u.getByText('maize')); // wrong: stays on choose
  fireEvent.press(u.getByText('māja')); // correct: green confirm beat...
  advanceConfirm(); // ...then choose -> speak
  fireEvent.press(u.getByLabelText('Record')); // speak -> rec, fires onRecordStart
  fireEvent.press(u.getByLabelText('Stop recording')); // rec -> result, fires onRecordStop
  fireEvent.press(u.getByText('Continue')); // result -> onComplete
}

describe('WordSay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('renders the choose stage from item data (snapshot)', () => {
    const { toJSON } = renderCard();
    expect(toJSON()).toMatchSnapshot();
  });

  it('plays the native audio when the play orb is tapped (speak stage — no pre-listen on recall)', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('māja')); // correct: green confirm beat
    advanceConfirm(); // choose -> speak (the play orb lives on the speak stage)
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.props.onPlay).toHaveBeenCalledWith('native', 1); // default speed 1x passed as the rate
  });

  it('reports each answer via onAnswer with its correctness', () => {
    const u = renderCard();
    fireEvent.press(u.getByText('maize'));
    expect(u.props.onAnswer).toHaveBeenCalledWith('maize', false);
  });

  it('marks the correct choice green and holds the confirm beat before advancing to speak', () => {
    const u = renderCard();
    const idleColor = StyleSheet.flatten(u.getByText('māja').props.style).color;
    fireEvent.press(u.getByText('māja')); // correct
    // Still on the choose stage during the confirm beat (has not jumped straight to speak).
    expect(u.queryByText('Now say it')).toBeNull();
    // The chosen option is now distinctly highlighted (green correct state), not its idle color,
    // and not the same as the untouched wrong option.
    const confirmColor = StyleSheet.flatten(u.getByText('māja').props.style).color;
    expect(confirmColor).not.toBe(idleColor);
    expect(confirmColor).not.toBe(StyleSheet.flatten(u.getByText('maize').props.style).color);
    // After the confirm window it advances to speak.
    advanceConfirm();
    expect(u.getByText('Now say it')).toBeTruthy();
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
    fireEvent.press(u.getByText('māja')); // correct: green confirm beat
    advanceConfirm(); // choose -> speak
    expect(u.getByText('Now say it')).toBeTruthy(); // prompt caption shown (not a tap target)
    fireEvent.press(u.getByLabelText('Record')); // the mic orb is the record control
    expect(u.props.onRecordStart).toHaveBeenCalled();
  });

  // Drive choose -> speak -> rec -> result WITHOUT pressing Continue, so the result note is visible.
  function toResult(u: ReturnType<typeof renderCard>, opts: { miss?: boolean } = {}): void {
    if (opts.miss) fireEvent.press(u.getByText('maize'));
    fireEvent.press(u.getByText('māja'));
    advanceConfirm();
    fireEvent.press(u.getByLabelText('Record'));
    fireEvent.press(u.getByLabelText('Stop recording'));
  }

  it('shows the REAL projected interval on a clean run — never a fabricated number or a pronunciation grade', () => {
    const u = renderCard({ reviewPreview: { pass: 'Next review in 7 days', miss: 'Next review in 1 day' } });
    toResult(u);
    expect(u.getByText('Nice work. Next review in 7 days.')).toBeTruthy();
    // No pronunciation verdict (there is no scoring until the Phase-1 ML service).
    expect(u.queryByText(/Sounded right/)).toBeNull();
  });

  it('after a recovered miss, frames it as a recovery with the miss interval — not a success claim', () => {
    const u = renderCard({ reviewPreview: { pass: 'Next review in 7 days', miss: 'Next review in 1 day' } });
    toResult(u, { miss: true });
    expect(u.getByText('Good recovery. Next review in 1 day.')).toBeTruthy();
    expect(u.queryByText(/Nice work/)).toBeNull();
  });

  it('falls back to a neutral truthful note when no schedule is available (stub/sample data)', () => {
    const u = renderCard(); // no reviewPreview
    toResult(u);
    expect(u.getByText('Nice work. Your next review is scheduled.')).toBeTruthy();
  });

  // ── translationVisibility gating (Module C5) ──────────────────────────────
  // WordSay: item.gloss is the CUE on the choose stage (English meaning → pick the Latvian word).
  // auto: cue shown always. hint: cue hidden until missed. on-demand: cue hidden until tapped.

  it("auto mode: gloss cue is shown immediately on choose stage", () => {
    const u = renderCard({ translationVisibility: 'auto' });
    expect(u.getByText('house')).toBeTruthy(); // item.gloss
    expect(u.queryByText('Show meaning')).toBeNull();
  });

  it("hint mode: gloss cue is hidden on choose stage, revealed after a wrong pick", () => {
    const u = renderCard({ translationVisibility: 'hint' });
    // Gloss cue is hidden; Show meaning affordance shown.
    // Note: 'house' could appear in the gloss cue OR in choice labels (choices have no gloss here).
    // Choices are Latvian words ('māja', 'maize') so they won't match 'house'.
    expect(u.queryByText('house')).toBeNull();
    expect(u.getByText('Show meaning')).toBeTruthy();
    // Wrong pick: missed=true -> gloss reveals.
    fireEvent.press(u.getByText('maize')); // wrong
    expect(u.props.onComplete).not.toHaveBeenCalled(); // wrong-answer no-advance preserved
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
    expect(u.getByText('house')).toBeTruthy(); // gloss now revealed after miss
  });

  it("hint mode: gloss cue revealed after miss but card does NOT advance (wrong-answer rule preserved)", () => {
    const u = renderCard({ translationVisibility: 'hint' });
    fireEvent.press(u.getByText('maize')); // wrong
    // Gloss revealed but still on choose stage (card did not advance).
    expect(u.queryByText('Now say it')).toBeNull();
    expect(u.props.onComplete).not.toHaveBeenCalled();
  });

  it("on-demand mode: gloss cue hidden until Show meaning tapped", () => {
    const u = renderCard({ translationVisibility: 'on-demand' });
    expect(u.queryByText('house')).toBeNull();
    expect(u.getByText('Show meaning')).toBeTruthy();
    fireEvent.press(u.getByText('Show meaning'));
    expect(u.getByText('house')).toBeTruthy();
    expect(u.queryByText('Show meaning')).toBeNull();
  });

  it("on-demand mode: wrong pick after reveal does NOT advance (locked rule preserved)", () => {
    const u = renderCard({ translationVisibility: 'on-demand' });
    fireEvent.press(u.getByText('Show meaning'));
    fireEvent.press(u.getByText('maize')); // wrong
    expect(u.props.onComplete).not.toHaveBeenCalled();
    expect(u.getByText('Not quite — give it another try.')).toBeTruthy();
  });

  it("on-demand mode: the speak stage keeps the gloss gated (no leak of the meaning the choose stage hid)", () => {
    const u = renderCard({ translationVisibility: 'on-demand' });
    // Answer correctly WITHOUT ever revealing the meaning.
    fireEvent.press(u.getByText('māja'));
    advanceConfirm(); // choose -> speak
    expect(u.getByText('Now say it')).toBeTruthy();
    // The gloss is still hidden behind the same on-demand gate.
    expect(u.queryByText('house')).toBeNull();
    fireEvent.press(u.getByText('Show meaning'));
    expect(u.getByText('house')).toBeTruthy();
  });

  it("hint mode: the speak stage keeps the gloss hidden after a clean (no-miss) choose", () => {
    const u = renderCard({ translationVisibility: 'hint' });
    fireEvent.press(u.getByText('māja')); // clean first-try pick
    advanceConfirm();
    expect(u.queryByText('house')).toBeNull();
    expect(u.getByText('Show meaning')).toBeTruthy();
  });

  // ── audio-less items (non-blocking audio backfill) ───────────────────────────
  // hasAudio = !!item.audio?.envelope. With no audio the card must never render a silent play
  // orb / waveform / speed chip, and the result stage must not offer a silent "Native" playback.

  it('no audio: the speak stage hides the play orb + speed chip (never a silent orb)', () => {
    const u = renderCard({ audio: undefined });
    fireEvent.press(u.getByText('māja'));
    advanceConfirm(); // choose -> speak
    expect(u.getByText('Now say it')).toBeTruthy(); // the mic flow is untouched
    expect(u.queryByLabelText('Play')).toBeNull();
  });

  it('no audio: the result stage hides the Native row and Play back-to-back, keeps You', () => {
    const u = renderCard({ audio: undefined });
    runLoop(u); // full loop still completes
    expect(u.props.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ cardKind: 'word/say', spoke: true }),
    );
    // Assertions on the result stage happen before Continue in toResult; re-run without Continue:
    const v = renderCard({ audio: undefined });
    fireEvent.press(v.getByText('māja'));
    advanceConfirm();
    fireEvent.press(v.getByLabelText('Record'));
    fireEvent.press(v.getByLabelText('Stop recording'));
    expect(v.queryByText('Native')).toBeNull();
    expect(v.queryByText('Play back-to-back')).toBeNull();
    expect(v.getByText('You')).toBeTruthy(); // the self-take is independent of native audio
  });

  // ── recConsent gate (Task E3) ────────────────────────────────────────────────
  // When recConsent=false the MicOrb / record affordance must be hidden; the card still completes
  // so the session advances — but `spoke` stays HONEST: no recording happened, so spoke:false.

  it('recConsent=false: record affordance not rendered (no MicOrb on the speak stage)', () => {
    const u = renderCard({}, { recConsent: false });
    // Drive to the speak stage
    fireEvent.press(u.getByText('māja'));
    advanceConfirm();
    // MicOrb is hidden when consent is false — no Record or Stop recording label
    expect(u.queryByLabelText('Record')).toBeNull();
    expect(u.queryByLabelText('Stop recording')).toBeNull();
  });

  it('recConsent=false: card can still complete and emits an HONEST { spoke:false } (no recording happened)', () => {
    const u = renderCard({}, { recConsent: false });
    // Drive to speak (no mic) -> press Continue (skips rec, goes to result) -> press Continue (completes)
    fireEvent.press(u.getByText('māja'));
    advanceConfirm();
    // Speak stage: no MicOrb, but Continue is available to skip rec and go to result
    fireEvent.press(u.getByText('Continue')); // speak -> result
    // Result stage: press Continue to complete
    fireEvent.press(u.getByText('Continue')); // result -> onComplete
    expect(u.props.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'maja', cardKind: 'word/say', correct: true, spoke: false }),
    );
  });

  // ── recConsent gate, beta fix 2026-07-05 ──────────────────────────────────────
  // The gate must be HONEST: say why the mic is gone, and never offer a "You" playback that
  // cannot exist (no recording was possible).

  it('recConsent=false: speak stage explains that recording is off', () => {
    const u = renderCard({}, { recConsent: false });
    fireEvent.press(u.getByText('māja'));
    advanceConfirm();
    expect(u.getByText('Recording is off — turn it on in Settings to hear yourself.')).toBeTruthy();
  });

  it('recConsent=false: result stage hides the "You" row and Play back-to-back', () => {
    const u = renderCard({}, { recConsent: false });
    fireEvent.press(u.getByText('māja'));
    advanceConfirm();
    fireEvent.press(u.getByText('Continue')); // speak -> result
    expect(u.queryByText('You')).toBeNull();
    expect(u.queryByText('Play back-to-back')).toBeNull();
    expect(u.getByText('Native')).toBeTruthy(); // the model stays available
  });
});
