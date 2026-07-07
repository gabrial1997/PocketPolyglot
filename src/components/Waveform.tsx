// Waveform — bars visual driven by a `played` ratio (ports kit.jsx `Waveform` bars style).
// Seeded so the same word always renders the same shape (kit ppSeed/ppBars). RN: react-native-svg.
// Animated/skia upgrade noted in WIRING_MAP §5; this stub is static + correct.
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

function ppSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ppBars(seed: number, n: number): number[] {
  let s = seed || 1;
  const rnd = (): number => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out: number[] = [];
  const peaks = 2 + Math.floor(rnd() * 3);
  const centers = Array.from({ length: peaks }, () => 0.1 + rnd() * 0.8);
  const wid = Array.from({ length: peaks }, () => 0.1 + rnd() * 0.16);
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : i / (n - 1); // same n===1 guard as envBars — avoids a NaN bar height
    let env = 0;
    for (let p = 0; p < peaks; p++) {
      const d = (x - (centers[p] ?? 0)) / (wid[p] ?? 1);
      env = Math.max(env, Math.exp(-d * d));
    }
    const jitter = 0.45 + rnd() * 0.55;
    out.push(Math.max(0.08, env * jitter));
  }
  return out;
}

/** Resample a 0..1 amplitude envelope to exactly `n` bars (nearest-frame), floored at 0.08. */
function envBars(env: number[], n: number): number[] {
  if (env.length === 0) return new Array(n).fill(0.08);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const src = n === 1 ? 0 : Math.round((i / (n - 1)) * (env.length - 1));
    out.push(Math.max(0.08, Math.min(1, env[src] ?? 0.08)));
  }
  return out;
}

export function Waveform({
  seed = 'x',
  played = 0,
  height = 60,
  count = 46,
  gap = 3,
  envelope,
}: {
  seed?: string;
  played?: number; // 0..1 progress
  height?: number;
  count?: number;
  gap?: number;
  // Real RMS amplitude envelope (0..1). When present, bar heights come from the seeded clip's
  // actual amplitude instead of the deterministic-from-seed shape. Backwards-compatible/optional.
  envelope?: number[];
}): React.JSX.Element {
  const T = useTheme();
  const data = useMemo(
    () => (envelope && envelope.length ? envBars(envelope, count) : ppBars(ppSeed(seed), count)),
    [seed, count, envelope],
  );
  const playIdx = played * count;
  return (
    <View style={[styles.row, { height, columnGap: gap }]}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.round(v * height),
            borderRadius: 3,
            backgroundColor: i < playIdx ? T.wavePlayed : T.waveRest,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', width: '100%' },
});
