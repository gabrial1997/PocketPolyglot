// GlideTrack — the diphthong as one gliding movement (ports kit.jsx `GlideTrack`).
// Two vowel nodes (`from` → `to`) joined by a dotted quadratic arc; a dot travels the arc
// while `playing`. Pure presentational primitive: the card passes the theme `color`; the dot's
// motion is driven by an Animated.Value (0→1) interpolated along the bezier — the web original
// animates CSS `offset-distance`, here we compute x/y on the quadratic curve (WIRING_MAP §5).
// The node letters + caption are RN <Text> overlaid on the SVG (the web used a position:relative
// wrapper too) — keeps them crisp with the headline font and queryable.
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, fonts } from '../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Quadratic bezier point at parameter `t` for control points P0, P1 (control), P2.
function quad(t: number, p0: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

export function GlideTrack({
  from = 'i',
  to = 'e',
  playing = false,
  color,
  width = 250,
}: {
  from?: string;
  to?: string;
  playing?: boolean;
  /** Accent for the leading node/arc/dot. Defaults to the theme primary. */
  color?: string;
  width?: number;
}): React.JSX.Element {
  const T = useTheme();
  const c = color ?? T.primary;

  // Geometry (ported verbatim from kit.jsx GlideTrack).
  const H = 84;
  const x0 = 30;
  const x1 = width - 30;
  const cx = width / 2; // control point x
  const cy = 8; // control point y
  const y = 56;
  const r = 17;
  const path = `M ${x0} ${y} Q ${cx} ${cy} ${x1} ${y}`;

  // Sample the curve so the dot's x/y can be interpolated by a single 0→1 Animated.Value.
  const { xs, ys } = useMemo(() => {
    const steps = 24;
    const xOut: number[] = [];
    const yOut: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      xOut.push(quad(t, x0, cx, x1));
      yOut.push(quad(t, y, cy, y));
    }
    return { xs: xOut, ys: yOut };
  }, [x0, cx, x1, y, cy]);

  const progress = useRef(new Animated.Value(0)).current;

  // Run the travelling-dot loop only while `playing`; clean up otherwise. Guarded so the
  // jest render (playing=false) never starts a loop.
  useEffect(() => {
    if (!playing) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1150,
        easing: Easing.bezier(0.5, 0, 0.5, 1),
        useNativeDriver: false, // SVG attrs animate on the JS thread — native driver unsupported
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [playing, progress]);

  const inputRange = useMemo(() => xs.map((_, i) => i / (xs.length - 1)), [xs]);
  const dotX = progress.interpolate({ inputRange, outputRange: xs });
  const dotY = progress.interpolate({ inputRange, outputRange: ys });
  // Fade in/out at the ends (matches the web keyframe: 0→14% in, 86→100% out).
  const dotOpacity = progress.interpolate({
    inputRange: [0, 0.14, 0.86, 1],
    outputRange: [0, 1, 1, 0],
  });

  const nodeBox = r * 2;
  const letter = (x: number, ch: string, lead: boolean): React.JSX.Element => (
    <Text
      style={[
        styles.letter,
        {
          left: x - r,
          top: y - r,
          width: nodeBox,
          height: nodeBox,
          lineHeight: nodeBox,
          fontFamily: fonts.headline,
          color: lead ? c : T.ink,
        },
      ]}
    >
      {ch}
    </Text>
  );

  return (
    <View style={[styles.wrap, { width, height: H }]}>
      <Svg width={width} height={H} viewBox={`0 0 ${width} ${H}`}>
        <Path
          d={path}
          fill="none"
          stroke={hexA(c, 0.32)}
          strokeWidth={2}
          strokeDasharray="1.5 6"
          strokeLinecap="round"
        />
        {/* node circles (letters are RN <Text> overlays below) */}
        <Circle cx={x0} cy={y} r={r} fill={T.surface} stroke={hexA(c, 0.5)} strokeWidth={1.5} />
        <Circle cx={x1} cy={y} r={r} fill={T.surface} stroke={T.hair} strokeWidth={1.5} />
        <AnimatedCircle cx={dotX} cy={dotY} r={6.5} fill={c} opacity={dotOpacity} />
      </Svg>
      {letter(x0, from, true)}
      {letter(x1, to, false)}
      <Text style={[styles.caption, { top: y + 22, width, color: T.faint, fontFamily: fonts.ui }]}>
        one gliding sound
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  letter: {
    position: 'absolute',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '500',
  },
  caption: {
    position: 'absolute',
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
});
