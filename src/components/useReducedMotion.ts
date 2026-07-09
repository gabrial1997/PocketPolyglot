// useReducedMotion — the shared mount-time reduce-motion probe (extracted from GlideViewport /
// StageFade, which copy-pasted the same async AccessibilityInfo check). Returns a ref, not state:
// the flag is read imperatively inside animation effects and must never trigger a re-render.
// Mount-time only by design — no change listener; a mid-session OS toggle applies on next mount
// (identical to the previous inline behavior).
import { useEffect, useRef, type MutableRefObject } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): MutableRefObject<boolean> {
  const reduceMotion = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => {
        reduceMotion.current = !!on;
      })
      .catch(() => {});
  }, []);
  return reduceMotion;
}
