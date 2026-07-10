// prog (Tier B) — coverage of the ~1,000 most-common words (WIRING_MAP §3, README 07).
// Coverage is progress, NOT a game: no streaks / XP / leagues / confetti. Frames how much everyday
// speech the learner can already follow. NOT a card.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-b.jsx `ProgressScreen`). "Progress" serif
// title; the hero stat (big serif "62%" in primary) + "of everyday Latvian speech you can already
// follow." + "615 of the 1,000 most common words"; a 1000-dot coverage grid (known dots in primary,
// fading by frequency); four frequency bands with progress bars (a completed band shows good + check).
// The bottom Today/Listen/Progress tab bar is app navigation chrome (mounted by the navigator), not
// this screen — omitted here, matching the HomeScreen drop-in.
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { CardIcon } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { computeBands } from './coverageBands';

const COLS = 40;
const ROWS = 25;

export function ProgressScreen({
  total = 1000,
  knownRanks = [],
}: {
  /** Size of the core-word corpus (spec 2026-07-06). */
  total?: number;
  /** Frequency ranks (1-based) of the learner's known words — drives hero, bands, and grid. */
  knownRanks?: number[];
}): React.JSX.Element {
  const T = useTheme();
  const known = knownRanks.length;
  // Floor (not round) so Progress can never read a % point above the podcast lock screen's
  // (both derive from the same knownRanks/total coverage — see PodcastHost.tsx).
  const pct = total > 0 ? Math.floor((known / total) * 100) : 0;
  const bands = useMemo(() => computeBands(knownRanks, total), [knownRanks, total]);
  // Dot i (0-based) = frequency rank i+1 — a known word lights its TRUE slot on the
  // most-common → rarer axis, not a sequential fill.
  const dots = useMemo(() => {
    const knownSet = new Set(knownRanks);
    return Array.from({ length: COLS * ROWS }, (_, i) => knownSet.has(i + 1));
  }, [knownRanks]);

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.title, { color: T.ink, fontFamily: fonts.headline }]}>Progress</Text>

        {/* hero stat */}
        <View style={styles.heroRow}>
          <Text style={[styles.heroNum, { color: T.primary, fontFamily: fonts.headline }]}>{pct}</Text>
          <Text style={[styles.heroPct, { color: T.primary, fontFamily: fonts.headline }]}>%</Text>
        </View>
        <Text style={[styles.heroLine, { color: T.ink }]}>of everyday Latvian speech you can already follow.</Text>
        <Text style={[styles.heroSub, { color: T.sub }]}>
          <Text style={{ color: T.ink, fontWeight: '600' }}>{known}</Text> of the {total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} most common words
        </Text>

        {/* 1000-dot coverage grid */}
        <View style={[styles.gridCard, { backgroundColor: T.surface, borderColor: T.hair }, T.shadow]}>
          <View style={styles.grid}>
            {dots.map((on, i) => (
              <View
                key={i}
                style={{
                  width: `${100 / COLS}%`,
                  aspectRatio: 1,
                  padding: 1.2,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: 99,
                    backgroundColor: on ? T.primary : (T.dark ? 'rgba(255,255,255,0.08)' : 'rgba(26,39,51,0.07)'),
                    // Fade by rank position (most-common brightest), matching the axis labels.
                    opacity: on ? 0.5 + 0.5 * (1 - i / (COLS * ROWS)) : 1,
                  }}
                />
              </View>
            ))}
          </View>
          <View style={styles.gridLabels}>
            <Text style={[styles.gridLabel, { color: T.faint }]}>most common</Text>
            <Text style={[styles.gridLabel, { color: T.faint }]}>rarer</Text>
          </View>
        </View>

        {/* frequency bands */}
        <View style={styles.bands}>
          {bands.map((b, i) => {
            const done = b.pct >= 100;
            return (
              <View key={i} style={styles.bandRow}>
                <View style={styles.bandMeta}>
                  <Text style={[styles.bandLabel, { color: T.ink }]}>{b.label}</Text>
                  <Text style={[styles.bandSub, { color: T.faint }]}>{b.sub}</Text>
                </View>
                <View style={[styles.bandTrack, { backgroundColor: T.dark ? 'rgba(255,255,255,0.07)' : 'rgba(26,39,51,0.06)' }]}>
                  <View style={{ width: `${b.pct}%`, height: '100%', borderRadius: 99, backgroundColor: done ? T.good : T.primary }} />
                </View>
                <View style={styles.bandPct}>
                  {done ? <CardIcon name="check" size={16} color={T.good} sw={2.4} /> : <Text style={[styles.bandPctText, { color: T.sub }]}>{b.pct}%</Text>}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingTop: 46 },
  title: { fontSize: 32, fontWeight: '500', letterSpacing: -0.3 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', columnGap: 6, marginTop: 22 },
  heroNum: { fontSize: 72, fontWeight: '500', lineHeight: 84, letterSpacing: -2 },
  heroPct: { fontSize: 34, fontWeight: '500', lineHeight: 38 },
  heroLine: { fontSize: 16.5, marginTop: 12, lineHeight: 23, maxWidth: 300 },
  heroSub: { fontSize: 14, marginTop: 6 },
  gridCard: { marginTop: 20, borderRadius: 22, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, borderWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 },
  gridLabel: { fontSize: 11.5, fontWeight: '500' },
  bands: { marginTop: 16, rowGap: 13 },
  bandRow: { flexDirection: 'row', alignItems: 'center', columnGap: 14 },
  bandMeta: { width: 78 },
  bandLabel: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  bandSub: { fontSize: 11.5 },
  bandTrack: { flex: 1, height: 7, borderRadius: 99, overflow: 'hidden' },
  bandPct: { width: 38, alignItems: 'flex-end' },
  bandPctText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
