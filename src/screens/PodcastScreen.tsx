// pod (Tier B) — AI podcast player (WIRING_MAP §3, README 06). A generated episode (audio + transcript)
// built only from words the learner already knows. NOT a card — no CardResult; the PodcastHost owns
// playback + data and passes them in.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-b.jsx `PodcastScreen`). Header (collapse /
// "AI EPISODE" / settings); serif title + "3 min · built from 92 words you know"; the VoiceOrb hero
// flanked by ±15s skip; SpeedChip; slim progress line with position / duration; a Transcript toggle;
// the transcript itself (current line in primary, past lines dimmed, bottom mask-fade).
//
// Props expanded (Tier-B screen, not a card contract): structured transcript + playback metadata,
// all with mockup defaults so it renders 1:1 out of the box; the host overrides with real data.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Screen, SpeedChip } from '../components';
import { VoiceOrb } from '../components/VoiceOrb';
import { CardIcon } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';

export interface TranscriptLine {
  lv: string;
  en: string;
  state?: 'past' | 'current' | 'upcoming';
}

const DEFAULT_TRANSCRIPT: TranscriptLine[] = [
  { lv: 'Labrīt! Šodien ir silta diena.', en: 'Good morning! Today is a warm day.', state: 'past' },
  { lv: 'Es dzeru kafiju un lasu grāmatu.', en: 'I drink coffee and read a book.', state: 'current' },
  { lv: 'Vēlāk es eju uz tirgu.', en: 'Later I go to the market.' },
  { lv: 'Tur pērku maizi un ābolus.', en: 'There I buy bread and apples.' },
];

function SkipIcon({ color, back }: { color: string; back?: boolean }): React.JSX.Element {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {back ? (
        <>
          <Path d="M11 4a8 8 0 1 0 5 1.5" />
          <Path d="M11 1.5l-2.5 2.5L11 6.5" />
        </>
      ) : (
        <>
          <Path d="M13 4a8 8 0 1 1-5 1.5" />
          <Path d="M13 1.5l2.5 2.5L13 6.5" />
        </>
      )}
    </Svg>
  );
}

export function PodcastScreen({
  title = 'Rīta saruna',
  durationLabel = '3 min',
  wordsKnown = 92,
  position = '1:09',
  duration = '3:04',
  progress = 0.38,
  transcript = DEFAULT_TRANSCRIPT,
  onPlay,
  onClose,
  onSkipBack,
  onSkipForward,
}: {
  title?: string;
  durationLabel?: string;
  wordsKnown?: number;
  position?: string;
  duration?: string;
  progress?: number;
  transcript?: TranscriptLine[];
  onPlay?: () => void;
  onClose?: () => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const [playing, setPlaying] = useState(true);
  const [showT, setShowT] = useState(true);
  const [speed, setSpeed] = useState<1 | 0.75 | 0.5>(1);

  const skipBtn = (back: boolean, onPress?: () => void): React.JSX.Element => (
    <Pressable accessibilityRole="button" accessibilityLabel={back ? 'Back 15 seconds' : 'Forward 15 seconds'} onPress={onPress} style={styles.skip}>
      <SkipIcon color={T.sub} back={back} />
      <Text style={[styles.skipLabel, { color: T.sub }]}>15</Text>
    </Pressable>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Collapse" onPress={onClose} style={[styles.iconBtn, { backgroundColor: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(26,39,51,0.05)' }]}>
          <CardIcon name="chevD" size={19} color={T.sub} />
        </Pressable>
        <Text style={[styles.eyebrow, { color: T.faint }]}>AI EPISODE</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" style={styles.iconBtn}>
          <CardIcon name="settings" size={19} color={T.sub} />
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: T.ink, fontFamily: fonts.headline }]}>{title}</Text>
        <Text style={[styles.sub, { color: T.sub }]}>
          {durationLabel} · built from <Text style={{ color: T.primary, fontWeight: '600' }}>{wordsKnown} words</Text> you know
        </Text>
      </View>

      <View style={styles.heroRow}>
        {skipBtn(true, onSkipBack)}
        <VoiceOrb size={184} playing={playing} onPress={() => { setPlaying((p) => !p); onPlay?.(); }} />
        {skipBtn(false, onSkipForward)}
      </View>

      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <SpeedChip value={speed} onChange={(s) => setSpeed(s)} />
      </View>

      <View style={{ marginTop: 18 }}>
        <View style={[styles.track, { backgroundColor: T.dark ? 'rgba(255,255,255,0.09)' : 'rgba(26,39,51,0.08)' }]}>
          <View style={[styles.trackFill, { backgroundColor: T.primary, width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={[styles.time, { color: T.faint }]}>{position}</Text>
          <Text style={[styles.time, { color: T.faint }]}>{duration}</Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', marginTop: 22 }}>
        <Pressable accessibilityRole="button" onPress={() => setShowT((s) => !s)} style={[styles.transToggle, { backgroundColor: showT ? T.primarySoft : 'transparent', borderColor: showT ? 'transparent' : T.hair }]}>
          <CardIcon name="text" size={16} color={showT ? T.primary : T.sub} />
          <Text style={[styles.transToggleText, { color: showT ? T.primary : T.sub }]}>Transcript</Text>
        </Pressable>
      </View>

      {showT ? (
        <View style={styles.transcript}>
          {transcript.map((l, i) => {
            const current = l.state === 'current';
            const past = l.state === 'past';
            return (
              <View key={i} style={{ opacity: past ? 0.4 : 1 }}>
                <Text style={[styles.lineLv, { color: current ? T.primary : T.ink, fontFamily: fonts.headline }]}>{l.lv}</Text>
                <Text style={[styles.lineEn, { color: T.sub }]}>{l.en}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.4 },
  titleBlock: { alignItems: 'center', marginTop: 22 },
  title: { fontSize: 30, fontWeight: '500', letterSpacing: -0.4 },
  sub: { fontSize: 14, marginTop: 8 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 24, marginTop: 26 },
  skip: { alignItems: 'center' },
  skipLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  track: { height: 4, borderRadius: 99, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: 99 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  time: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  transToggle: { flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1 },
  transToggleText: { fontSize: 13.5, fontWeight: '600' },
  transcript: { flex: 1, marginTop: 16, rowGap: 16, overflow: 'hidden' },
  lineLv: { fontSize: 19, fontWeight: '500', lineHeight: 25, letterSpacing: -0.1 },
  lineEn: { fontSize: 13.5, marginTop: 3 },
});
