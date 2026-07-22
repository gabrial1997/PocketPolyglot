// useChoiceHaptic — fires correct/wrong on the choice-state TRANSITION. Lives here (not in the
// buttons) so ChoiceButton and GridChoiceButton stay in visual lockstep on feel exactly as they
// are on color. Mount is deliberately silent: snapshot fixtures mount pre-answered states.
import { useEffect, useRef } from 'react';
import { useHaptics } from './HapticsProvider';

export type ChoiceHapticState = 'idle' | 'correct' | 'wrong' | 'faded';

export function useChoiceHaptic(state: ChoiceHapticState): void {
  const h = useHaptics();
  const prev = useRef(state);
  useEffect(() => {
    if (prev.current === state) return;
    prev.current = state;
    if (state === 'correct') h.correct();
    else if (state === 'wrong') h.wrong();
  }, [state, h]);
}
