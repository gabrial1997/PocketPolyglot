// useLoopStage — the local UI state machine shared by full-loop cards
// (choose -> speak -> rec -> result). Per README "State Management": cards own ONLY this
// ephemeral state. Recording/scoring/intervals are NOT here — they flow through callbacks.
//
// The choose step also owns the LOCKED wrong-answer rule (APP_HANDOFF.md): a wrong pick does NOT
// advance, only the chosen wrong option is reddened (`wrongValue`), the correct answer is never
// revealed, and the first-try miss is remembered (`missed`) for honest SRS correctness. This lives
// here, not per-card, so every full-loop card enforces the rule identically.
import { useState, useCallback } from 'react';

export type LoopStage = 'choose' | 'speak' | 'rec' | 'result';

export interface LoopMachine {
  stage: LoopStage;
  picked: string | null;
  /** The chosen wrong option to redden — transient, cleared by retry(). Null when none. */
  wrongValue: string | null;
  /** Sticky: a wrong answer happened at least once (drives first-try `correct`). */
  missed: boolean;
  /** Answer the choose step. Correct -> advance to speak; wrong -> stay, redden, remember the miss. */
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
  const [missed, setMissed] = useState(false);

  const pick = useCallback((value: string, correct: boolean) => {
    if (correct) {
      setPicked(value);
      setStage('speak');
    } else {
      setMissed(true);
      setWrongValue(value);
    }
  }, []);
  const retry = useCallback(() => setWrongValue(null), []);
  const beginRec = useCallback(() => setStage('rec'), []);
  const finishRec = useCallback(() => setStage('result'), []);
  const reset = useCallback(() => {
    setStage('choose');
    setPicked(null);
    setWrongValue(null);
    setMissed(false);
  }, []);

  return { stage, picked, wrongValue, missed, pick, retry, beginRec, finishRec, reset };
}
