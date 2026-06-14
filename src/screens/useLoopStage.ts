// useLoopStage — the local UI state machine shared by full-loop cards
// (choose -> speak -> rec -> result). Per README "State Management": cards own ONLY this
// ephemeral state. Recording/scoring/intervals are NOT here — they flow through callbacks.
import { useState, useCallback } from 'react';

export type LoopStage = 'choose' | 'speak' | 'rec' | 'result';

export interface LoopMachine {
  stage: LoopStage;
  picked: string | null;
  /** advance choose -> speak after a correct pick */
  pick: (value: string) => void;
  /** speak -> rec when the mic starts */
  beginRec: () => void;
  /** rec -> result when the mic stops */
  finishRec: () => void;
  reset: () => void;
}

export function useLoopStage(): LoopMachine {
  const [stage, setStage] = useState<LoopStage>('choose');
  const [picked, setPicked] = useState<string | null>(null);

  const pick = useCallback((value: string) => {
    setPicked(value);
    setStage('speak');
  }, []);
  const beginRec = useCallback(() => setStage('rec'), []);
  const finishRec = useCallback(() => setStage('result'), []);
  const reset = useCallback(() => {
    setStage('choose');
    setPicked(null);
  }, []);

  return { stage, picked, pick, beginRec, finishRec, reset };
}
