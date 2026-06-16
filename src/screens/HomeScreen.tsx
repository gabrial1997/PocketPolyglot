// home (Tier B) — daily session entry (WIRING_MAP §3, README 01 / mockup `home.png`).
// LOCKED CONSTRAINT: no streaks, no confetti, no gamification, NO time claims ("10 min").
// Pure presentational: greeting + due summary + coverage come in as props (HomeHost supplies them).
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
  podcastTitle = 'Rita saruna',
  podcastSubtitle = 'Only words you know',
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
        <Text style={[styles.date, { color: T.faint }]}>{dateLabel ?? ''}</Text>
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
          <Text style={[styles.count, { color: T.sub }]}>{newCount} new</Text>
          <Text style={[styles.count, { color: T.sub }]}>{reviewCount} to review</Text>
        </View>
        <View style={styles.wave}>
          <Waveform seed="today-session" played={0} height={42} count={48} />
        </View>
        <CtaButton title="Begin listening" onPress={onStart} icon={<PlayIcon size={13} color={T.onPrimary} />} />
      </View>

      <View style={styles.spacer} />

      {/* Podcast teaser */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${podcastTitle} — ${podcastSubtitle}`}
        onPress={onOpenPodcast}
        style={[styles.podcast, { backgroundColor: T.surface, borderColor: T.hair }]}
      >
        <View style={[styles.podIcon, { backgroundColor: T.primaryFaint }]}>
          <SoundIcon size={18} color={T.primary} />
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
  date: { fontSize: type.caption, letterSpacing: 0.2 },
  toggle: { width: 38, height: 38, borderRadius: radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 33, letterSpacing: -0.6, marginTop: 12 },
  subtitle: { fontSize: type.body, marginTop: 8, marginBottom: 22 },
  card: { borderRadius: radii.surface, borderWidth: 1, padding: 20 },
  eyebrow: { fontSize: type.eyebrow, letterSpacing: type.eyebrowSpacing, fontWeight: '700' },
  numRow: { flexDirection: 'row', alignItems: 'baseline', columnGap: 8, marginTop: 12 },
  bigNum: { fontSize: 46, letterSpacing: -1 },
  wordsLabel: { fontSize: type.body },
  counts: { flexDirection: 'row', columnGap: 18, marginTop: 6 },
  count: { fontSize: type.label },
  wave: { marginTop: 18, marginBottom: 18 },
  spacer: { flex: 1, minHeight: 24 },
  podcast: { flexDirection: 'row', alignItems: 'center', columnGap: 12, padding: 14, borderRadius: radii.choice, borderWidth: 1 },
  podIcon: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  podText: { flex: 1 },
  podTitle: { fontSize: type.body, fontWeight: '600' },
  podSub: { fontSize: type.caption, marginTop: 2 },
  progress: { marginTop: 16, marginBottom: 8 },
  track: { height: 4, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 4, borderRadius: radii.pill },
  progressLabel: { fontSize: type.caption, marginTop: 8, textAlign: 'right' },
});
