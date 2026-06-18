// GlideViewport — the "Glide Left" card transition (handoff:
// handover/design_handoff_glide_transition/). Host-level plumbing: it wraps ONE child and, when
// `itemKey` changes, eases the previous child left (scale↓, fade↓) while the next glides in from
// the right (scale↑, fade↑) over 600ms on an easeOutExpo curve. Pure RN Animated — no blur
// (RN can't animate filter blur cheaply; position+scale+opacity carry the feel). Cards stay pure;
// they don't know they're being transitioned. Reduced motion → instant swap.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions, AccessibilityInfo, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const DURATION = 600;
const FADE = Math.round(DURATION * 0.8); // 480ms — opacity leads position
const MOVE_EASE = Easing.bezier(0.16, 1, 0.3, 1); // easeOutExpo
const FADE_EASE = Easing.bezier(0.4, 0, 0.5, 1);
const RADIUS = 36;

interface Frame {
  key: string;
  node: React.ReactNode;
}

export function GlideViewport({
  itemKey,
  children,
}: {
  itemKey: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const T = useTheme();
  const [current, setCurrent] = useState<Frame>({ key: itemKey, node: children });
  const [leaving, setLeaving] = useState<Frame | null>(null);

  // Animated progress 0→1 for the move (position+scale) and a separate value for opacity.
  const move = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((on) => { reduceMotion.current = !!on; }).catch(() => {});
  }, []);

  // Detect a key change → start a transition (capture the OLD frame as `leaving`).
  useEffect(() => {
    if (itemKey === current.key) {
      // same item re-rendered with new children: keep node fresh, no animation
      setCurrent((c) => ({ key: c.key, node: children }));
      return;
    }
    if (reduceMotion.current) {
      setLeaving(null);
      setCurrent({ key: itemKey, node: children });
      return;
    }
    setLeaving(current);
    setCurrent({ key: itemKey, node: children });
    move.setValue(0);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(move, { toValue: 1, duration: DURATION, easing: MOVE_EASE, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(fade, { toValue: 1, duration: FADE, easing: FADE_EASE, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    // Commit on a timer (not the Animated callback): the native-driver callback is unreliable under
    // Jest fake timers, and this matches the handoff's setTimeout(commit, duration+40) mechanism.
    const commit = setTimeout(() => setLeaving(null), DURATION + 40);
    return () => clearTimeout(commit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  const leavingStyle = {
    zIndex: 2,
    opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [
      { translateX: move.interpolate({ inputRange: [0, 1], outputRange: [0, -0.32 * width] }) },
      { scale: move.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] }) },
    ],
  };
  const enteringStyle = {
    zIndex: 3,
    opacity: fade, // 0→1
    transform: [
      { translateX: move.interpolate({ inputRange: [0, 1], outputRange: [0.34 * width, 0] }) },
      { scale: move.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
    ],
  };

  return (
    <View style={[styles.viewport, { backgroundColor: T.bg }]}>
      {leaving ? (
        <Animated.View key={leaving.key} style={[styles.layer, { backgroundColor: T.bg }, leavingStyle]}>
          {leaving.node}
        </Animated.View>
      ) : null}
      <Animated.View
        key={current.key}
        style={[
          styles.layer,
          { backgroundColor: T.bg },
          leaving
            ? [enteringStyle, { borderRadius: RADIUS, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 28, shadowOffset: { width: 0, height: 26 }, elevation: 12 }]
            : { zIndex: 1 },
        ]}
      >
        {current.node}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden' },
  layer: { ...StyleSheet.absoluteFillObject },
});
