// VoiceOrb — the AI-podcast hero (ports kit.jsx `VoiceOrb`). A radial equalizer (seeded tick
// lengths so it reads like speech, not noise) inside expanding pulse rings, wrapped around a
// central play/pause button. Pure presentational: tap calls `onPress`; the parent wires it to the
// PodcastService. The pulse rings + a gentle halo breathe only while `playing` and only when
// reduced-motion is off; the equalizer tick lengths are static (the mockup is a still frame and a
// 44-tick per-frame RN animation would not earn its battery cost — Reanimated upgrade noted).
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

// Deterministic, speech-like tick lengths (0.32..1) — same seed every render so the burst is stable.
function tickScale(n: number): number[] {
  let s = 9176;
  const rnd = (): number => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  return Array.from({ length: n }, (_, i) => {
    const env = 0.5 + 0.5 * Math.sin(i * 0.8); // a couple of soft lobes around the ring
    return 0.34 + 0.66 * Math.max(0.1, Math.min(1, env * (0.5 + rnd() * 0.7)));
  });
}

export function VoiceOrb({
  size = 184,
  playing = false, // inert by default (like every sibling orb) — three Animated.loops must be opted into
  onPress,
  bars = 44,
}: {
  size?: number;
  playing?: boolean;
  onPress?: () => void;
  bars?: number;
}): React.JSX.Element {
  const T = useTheme();
  const core = Math.round(size * 0.42); // central button diameter
  const barMax = size * 0.13; // max tick length
  const radius = core / 2 + size * 0.06; // inner edge of the tick ring
  const scales = useMemo(() => tickScale(bars), [bars]);

  // Three staggered expanding rings, looping while playing.
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!playing) { rings.forEach((r) => { r.stopAnimation(); r.setValue(0); }); return; }
    const loops = rings.map((r, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 930),
          Animated.timing(r, { toValue: 1, duration: 2790, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [playing, rings]);

  const ringBox = size * 0.62;
  const glyph = core * 0.32;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* pulse rings */}
      {rings.map((r, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: ringBox,
              height: ringBox,
              borderRadius: ringBox / 2,
              borderColor: T.primary,
              opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.55] }) }],
            },
          ]}
        />
      ))}

      {/* radial equalizer ticks */}
      {scales.map((sc, i) => {
        const angle = (360 / bars) * i;
        return (
          <View key={i} pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${angle}deg` }] }]}>
            <View
              style={{
                position: 'absolute',
                top: size / 2 - radius - barMax,
                width: 2.5,
                height: barMax * sc,
                borderRadius: 2,
                backgroundColor: T.primary,
                opacity: T.dark ? 0.85 : 0.7,
              }}
            />
          </View>
        );
      })}

      {/* soft halo */}
      <View style={{ position: 'absolute', width: core * 1.7, height: core * 1.7, borderRadius: core * 0.85, backgroundColor: T.primarySoft }} />

      {/* central play / pause */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        onPress={onPress}
        style={[
          styles.core,
          {
            width: core,
            height: core,
            borderRadius: core / 2,
            backgroundColor: T.primary,
            shadowColor: T.primary,
            shadowOpacity: T.dark ? 0.45 : 0.32,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          },
        ]}
      >
        <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
          {playing ? (
            <>
              <Rect x="5" y="3.5" width="5" height="17" rx="1.6" fill={T.onPrimary} />
              <Rect x="14" y="3.5" width="5" height="17" rx="1.6" fill={T.onPrimary} />
            </>
          ) : (
            <Path d="M6 4.5v15a1 1 0 0 0 1.5.87l12-7.5a1 1 0 0 0 0-1.74l-12-7.5A1 1 0 0 0 6 4.5z" fill={T.onPrimary} />
          )}
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5 },
  core: { alignItems: 'center', justifyContent: 'center' },
});
