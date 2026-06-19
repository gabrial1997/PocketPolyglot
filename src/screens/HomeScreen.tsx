// home (Tier B) — daily session entry (WIRING_MAP §3, README 01 / mockup `home.png`).
// LOCKED CONSTRAINT: no streaks, no confetti, no gamification, NO time claims ("10 min").
// Pure presentational: greeting + due summary + coverage come in as props (HomeHost supplies them).
//
// 2026-06-18 VISUAL SYNC: values realigned to the mockup (kit.jsx + screens-a.jsx HomeScreen).
// Changed vs prior: greeting 33→34 / ls -0.6→-0.2 / lineHeight; card radius 20→28 + padding 24/22/22;
// big number 46→56 + lineHeight 0.9; counts row now has bold-ink numerals + faint "·" separator;
// waveform height 42→50; podcast icon circle→rounded-square (r13) on primarySoft, title 16→15.5,
// sub 11→13; coverage label 11→12.5; date 11/faint→15/sub. Dark-mode toggle kept (real-app affordance,
// not in the static mockup — leave it).
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, CtaButton, Waveform } from '../components';
import { PlayIcon, ChevronRightIcon, SunIcon, MoonIcon, SoundIcon } from '../components/icons';
import { useTheme, useThemeMode } from '../theme/ThemeProvider';
import { type, fonts, radii } from '../theme/tokens';

export function HomeScreen({
  greeting = 'Labrīt',
  name,
  dateLabel,
  newCount = 0,
  reviewCount = 0,
  knownCount = 0,
  totalWords = 1000,
  podcastTitle = 'Rīta saruna',
  podcastSubtitle = '3 min · only words you know',
  onStart,
  onOpenPodcast,
}: {
  greeting?: string;
  name?: string;
  dateLabel?: string;
  newCount?: number;
  reviewCount?: number;
  knownCount?: number;
  totalWords?: number;
  podcastTitle?: string;
  podcastSubtitle?: string;
  onStart?: () => void;
  onOpenPodcast?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const { dark, setMode } = useThemeMode();
  const total = newCount + reviewCount;
  const coverage = totalWords > 0 ? Math.max(0, Math.min(1, knownCount / totalWords)) : 0;
  const heading = name ? `${greeting}, ${name}.` : `${greeting}.`;

  return (
    <Screen>
      {/* Header: today's date + light/dark toggle */}
      <View style={styles.header}>
        <Text style={[styles.date, { color: T.sub }]}>{dateLabel ?? ''}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          hitSlop={10}
          onPress={() => setMode(dark ? 'light' : 'dark')}
          style={[styles.toggle, { borderColor: T.hair, backgroundColor: T.surface }]}
        >
          {dark ? <SunIcon size={18} color={T.sub} /> : <MoonIcon size={18} color={T.sub} />}
        </Pressable>
      </View>

      {/* Greeting + subtitle */}
      <Text style={[styles.greeting, { color: T.ink, fontFamily: fonts.headline }]}>{heading}</Text>
      <Text style={[styles.subtitle, { color: T.sub }]}>A few new words, and the ones to review.</Text>

      {/* Today's session card */}
      <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.hair }, T.shadowCard]}>
        <Text style={[styles.eyebrow, { color: T.faint }]}>TODAY’S SESSION</Text>
        <View style={styles.numRow}>
          <Text style={[styles.bigNum, { color: T.ink, fontFamily: fonts.headline }]}>{total}</Text>
          <Text style={[styles.wordsLabel, { color: T.sub }]}>words</Text>
        </View>
        <View style={styles.counts}>
          <Text style={[styles.count, { color: T.sub }]}>
            <Text style={[styles.countNum, { color: T.ink }]}>{newCount}</Text> new
          </Text>
          <Text style={[styles.dot, { color: T.faint }]}>·</Text>
          <Text style={[styles.count, { color: T.sub }]}>
            <Text style={[styles.countNum, { color: T.ink }]}>{reviewCount}</Text> to review
          </Text>
        </View>
        <View style={styles.wave}>
          <Waveform seed="today-session" played={0} height={50} count={48} />
        </View>
        {/* Multi-modal session (hear/choose/say) — not audio-first; keep the label modality-neutral. */}
        <CtaButton title="Begin session" onPress={onStart} icon={<PlayIcon size={13} color={T.onPrimary} />} />
      </View>

      <View style={styles.spacer} />

      {/* Podcast teaser */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${podcastTitle} — ${podcastSubtitle}`}
        onPress={onOpenPodcast}
        style={[styles.podcast, { backgroundColor: T.surface, borderColor: T.hair }]}
      >
        <View style={[styles.podIcon, { backgroundColor: T.primarySoft }]}>
          <SoundIcon size={22} color={T.primary} />
        </View>
        <View style={styles.podText}>
          <Text style={[styles.podTitle, { color: T.ink }]}>{podcastTitle}</Text>
          <Text style={[styles.podSub, { color: T.faint }]}>{podcastSubtitle}</Text>
        </View>
        <ChevronRightIcon size={18} color={T.faint} />
      </Pressable>

      {/* Coverage progress (NOT a score — % of everyday speech covered) */}
      <View style={styles.progress}>
        <View style={[styles.track, { backgroundColor: T.hair }]}>
          <View style={[styles.fill, { backgroundColor: T.primary, width: `${coverage * 100}%` }]} />
        </View>
        <Text style={[styles.progressLabel, { color: T.faint }]}>
          {knownCount} / {totalWords} words
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  date: { fontSize: 15, fontWeight: '500', letterSpacing: 0.2 },
  toggle: { width: 38, height: 38, borderRadius: radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 34, letterSpacing: -0.2, lineHeight: 38, marginTop: 6 },
  subtitle: { fontSize: 15.5, marginTop: 7, marginBottom: 24 },
  card: { borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 22 },
  eyebrow: { fontSize: 12, letterSpacing: 1.4, fontWeight: '600' },
  numRow: { flexDirection: 'row', alignItems: 'baseline', columnGap: 10, marginTop: 16 },
  bigNum: { fontSize: 56, lineHeight: 68, letterSpacing: -1 },
  wordsLabel: { fontSize: type.body, fontWeight: '500' },
  counts: { flexDirection: 'row', alignItems: 'center', columnGap: 16, marginTop: 10 },
  count: { fontSize: 14 },
  countNum: { fontWeight: '600' },
  dot: { fontSize: 14 },
  wave: { marginTop: 20, marginBottom: 22 },
  spacer: { flex: 1, minHeight: 14 },
  podcast: { flexDirection: 'row', alignItems: 'center', columnGap: 14, padding: 14, borderRadius: radii.surface, borderWidth: StyleSheet.hairlineWidth },
  podIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  podText: { flex: 1 },
  podTitle: { fontSize: 15.5, fontWeight: '600' },
  podSub: { fontSize: type.label, marginTop: 1 },
  progress: { marginTop: 16, marginBottom: 8 },
  track: { height: 4, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 4, borderRadius: radii.pill },
  progressLabel: { fontSize: 12.5, marginTop: 8, textAlign: 'right' },
});
