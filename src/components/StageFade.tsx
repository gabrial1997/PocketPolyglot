// StageFade — a brief opacity fade when a full-loop card moves between stages (choose -> speak ->
// rec -> result). Cards stay pure; this is ephemeral presentation only. Keyed on `stageKey`: when it
// changes the new stage body fades in (~200ms); within a stage, children render live (unanimated) so
// the waveform/mic stay reactive. Reduced motion → instant swap. Pure RN Animated (mirrors the
// useReducedMotion probe shared with GlideViewport.tsx).
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

const DURATION = 200;

export function StageFade({
  stageKey,
  children,
}: {
  stageKey: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;
  const [animating, setAnimating] = useState(false);
  const reduceMotion = useReducedMotion();
  const mounted = useRef(false);

  // useLayoutEffect (not useEffect): apply opacity 0 + animating BEFORE the new stage paints. Under a
  // plain effect the new stage rendered once at full opacity (animating still false) and only then
  // dropped to 0 to fade in — a one-frame flash of the next stage's content (the "flicker").
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true; // no fade on the card's first appearance (GlideViewport owns entry)
      return;
    }
    if (reduceMotion.current) {
      opacity.setValue(1);
      setAnimating(false);
      return;
    }
    setAnimating(true);
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: DURATION,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    // Settle on a timer (not the Animated callback): the native-driver callback is unreliable under
    // Jest fake timers — same approach as GlideViewport.
    const done = setTimeout(() => setAnimating(false), DURATION + 20);
    return () => clearTimeout(done);
  }, [stageKey, opacity, reduceMotion]); // reduceMotion is a stable ref — listed to satisfy exhaustive-deps

  return (
    <Animated.View testID="stage-fade" style={{ flex: 1, opacity: animating ? opacity : 1 }}>
      {children}
    </Animated.View>
  );
}
