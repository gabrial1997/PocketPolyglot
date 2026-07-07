// useLoopStage — the local UI state machine shared by full-loop cards
// (choose -> speak -> rec -> result). Per README "State Management": cards own ONLY this
// ephemeral state. Recording/scoring/intervals are NOT here — they flow through callbacks.
//
// The choose step owns BOTH locked answer rules (APP_HANDOFF.md):
//  - WRONG pick does NOT advance: only the chosen wrong option reddens (`wrongValue`), the correct
//    answer is never revealed, and the first-try miss is remembered (`missed`) for honest SRS.
//  - CORRECT pick → green confirm, THEN advance: the chosen option is marked correct (`rightValue`)
//    and the stage holds on 'choose' for CONFIRM_MS so the green state is visible before advancing
//    to 'speak'. This lives here, not per-card, so every full-loop card behaves identically.
import { useState, useCallback, useRef, useEffect } from 'react';

export type LoopStage = 'choose' | 'speak' | 'rec' | 'result';

/** How long the green confirmation is held on the choose step before advancing to speak. */
export const CONFIRM_MS = 420;

export interface LoopMachine {
  stage: LoopStage;
  picked: string | null;
  /** The chosen wrong option to redden — transient, cleared by retry(). Null when none. */
  wrongValue: string | null;
  /** The correct option to render green during the confirm beat — set on a correct pick. Null when none. */
  rightValue: string | null;
  /** Sticky: a wrong answer happened at least once (drives first-try `correct`). */
  missed: boolean;
  /** Answer the choose step. Correct -> green confirm then advance; wrong -> stay, redden, remember. */
  pick: (value: string, correct: boolean) => void;
  /** Clear the wrong highlight so the learner can pick again (the answer is never revealed). */
  retry: () => void;
  /** speak -> rec when the mic starts */
  beginRec: () => void;
  /** rec -> result when the mic stops */
  finishRec: () => void;
  reset: () => void;
}

export function useLoopStage(): LoopMachine {
  const [stage, setStage] = useState<LoopStage>('choose');
  const [picked, setPicked] = useState<string | null>(null);
  const [wrongValue, setWrongValue] = useState<string | null>(null);
  const [rightValue, setRightValue] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAdvance = useCallback(() => {
    if (advanceTimer.current !== null) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  const pick = useCallback(
    (value: string, correct: boolean) => {
      // Ignore further taps once a correct pick is being confirmed (the choice is locked in).
      if (rightValue !== null) return;
      if (correct) {
        // Clear a stale red highlight (wrong pick -> correct pick directly, skipping Try again):
        // the confirm beat must show ONLY the green state, never green + red + retry note at once.
        setWrongValue(null);
        setRightValue(value);
        setPicked(value);
        clearAdvance();
        advanceTimer.current = setTimeout(() => {
          advanceTimer.current = null;
          setStage('speak');
        }, CONFIRM_MS);
      } else {
        setMissed(true);
        setWrongValue(value);
      }
    },
    [rightValue, clearAdvance],
  );
  const retry = useCallback(() => setWrongValue(null), []);
  const beginRec = useCallback(() => setStage('rec'), []);
  const finishRec = useCallback(() => setStage('result'), []);
  const reset = useCallback(() => {
    clearAdvance();
    setStage('choose');
    setPicked(null);
    setWrongValue(null);
    setRightValue(null);
    setMissed(false);
  }, [clearAdvance]);

  // Cancel a pending advance if the card unmounts mid-confirm (no setState after unmount).
  useEffect(() => clearAdvance, [clearAdvance]);

  return { stage, picked, wrongValue, rightValue, missed, pick, retry, beginRec, finishRec, reset };
}
