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
    const x = i / (n - 1);
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

export function Waveform({
  seed = 'x',
  played = 0,
  height = 60,
  count = 46,
  gap = 3,
}: {
  seed?: string;
  played?: number; // 0..1 progress
  height?: number;
  count?: number;
  gap?: number;
}): React.JSX.Element {
  const T = useTheme();
  const data = useMemo(() => ppBars(ppSeed(seed), count), [seed, count]);
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
