// word/hear — recognition review (BACKEND_INTEGRATION §4). Audio is the cue; choices are GLOSSES.
// Out: { correct, spoke:false }. No recording stage.
//
// Single-stage recognition card, but it still enforces the LOCKED wrong-answer rule (CLAUDE.md):
// a wrong pick does NOT advance — only the chosen wrong option reddens, the correct answer is never
// revealed, and the first-try miss is remembered (`missed`) for honest SRS correctness. A correct
// pick turns green, then completes after a short readable beat so the green is actually seen (the
// controller re-renders away the card the instant we complete). Mirrors the drill / useLoopStage
// pattern; there is no speak stage, so we keep minimal local state rather than the full loop machine.
import React, { useEffect, useRef, useState } from 'react';
import { PlayOrb, ChoiceButton, SpeedChip, TryAgainNote } from '../components';
import { CardShell } from './CardShell';
import type { ChoiceCardProps } from './cardProps';

// Short beat so the green "correct" state is visible before the controller advances. Snappy — this
// is not the unlock reveal.
const ADVANCE_DELAY_MS = 500;

export function WordHear({
  item,
  onPlay,
  onAnswer,
  onComplete,
  speed,
  onSpeedChange,
}: ChoiceCardProps): React.JSX.Element {
  // The chosen wrong option to redden — transient, cleared by Try again. Null when none.
  const [wrongValue, setWrongValue] = useState<string | null>(null);
  // Sticky: a wrong answer happened at least once (drives honest first-try `correct`).
  const [missed, setMissed] = useState(false);
  // The chosen correct option — turns green, then completes after the beat.
  const [correctValue, setCorrectValue] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel the pending advance on unmount so no state update / completion fires after teardown.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const pick = (value: string, correct: boolean): void => {
    // A correct pick is committed exactly once: once correctValue is set a completion is already
    // in flight, so further taps (e.g. a rapid double-tap during the green beat) are no-ops.
    if (correctValue !== null) return;
    onAnswer(value, correct);
    if (correct) {
      setWrongValue(null); // a direct wrong→correct tap: drop the red + retry note (missed stays sticky)
      setCorrectValue(value); // green, then advance after the beat
      if (timer.current) clearTimeout(timer.current); // never stack timers
      timer.current = setTimeout(() => {
        onComplete({ itemId: item.id, cardKind: 'word/hear', correct: !missed, spoke: false });
      }, ADVANCE_DELAY_MS);
    } else {
      setMissed(true);
      setWrongValue(value); // stay, redden only this option, never reveal the correct one
    }
  };

  return (
    <CardShell eyebrow="Listen — which meaning?">
      <PlayOrb onPress={() => onPlay('native')} />
      <SpeedChip value={speed} onChange={onSpeedChange} />
      {(item.choices ?? []).map((c) => (
        <ChoiceButton
          key={c.value}
          label={c.gloss ?? c.value}
          state={c.value === correctValue ? 'correct' : c.value === wrongValue ? 'wrong' : 'idle'}
          disabled={correctValue !== null} // lock all options during the green beat — no re-tap
          onPress={() => pick(c.value, c.correct)}
        />
      ))}
      {wrongValue ? <TryAgainNote onRetry={() => setWrongValue(null)} /> : null}
    </CardShell>
  );
}
