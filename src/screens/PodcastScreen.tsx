// pod (Tier B) — AI podcast player (WIRING_MAP §3, README 06). A generated episode (audio + transcript)
// built only from words the learner already knows. NOT a card — no CardResult; the PodcastHost owns
// playback + data and passes them in.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-b.jsx `PodcastScreen`). Header (collapse /
// "AI EPISODE"); serif title; the VoiceOrb hero flanked by ±15s skip; SpeedChip; slim progress line
// with position / duration; a Transcript toggle; the transcript itself.
//
// 2026-07-06 HONESTY FIX: all mockup sample data (fake title/transcript/"3 min · built from 92
// words"/38% progress) is gone. Every element renders ONLY from real data supplied by the host:
// no episode → an honest empty state; unknown duration/known-word count/progress → those lines
// simply don't render. Playback is a real play/stop contract (onPlay / onStop, stop on unmount)
// and the orb starts idle, not "playing". Dead affordances (settings button with no handler,
// skip/collapse controls without callbacks) are not rendered.
import React, { useEffect, useRef, useState } from 'react';
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
  title,
  durationLabel,
  wordsKnown,
  position,
  duration,
  progress,
  transcript,
  onPlay,
  onStop,
  onClose,
  onSkipBack,
  onSkipForward,
}: {
  /** Real episode title. Absent → the screen renders an honest "no episode" state. */
  title?: string;
  /** Real episode duration (e.g. "3:04" clip length) — only when derived from real data. */
  durationLabel?: string;
  /** Real count of known words the episode was built from — only when the backend supplies it. */
  wordsKnown?: number;
  position?: string;
  duration?: string;
  progress?: number;
  transcript?: TranscriptLine[];
  onPlay?: () => void;
  /** Stops playback. Called on the pause tap and on unmount (leaving the tab must stop audio). */
  onStop?: () => void;
  onClose?: () => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const [playing, setPlaying] = useState(false);
  const [showT, setShowT] = useState(true);
  const [speed, setSpeed] = useState<1 | 0.75 | 0.5>(1);

  // Stop audio when the screen unmounts while playing (tab leave / collapse). Refs so the
  // cleanup sees the latest values without re-registering.
  const playingRef = useRef(false);
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;
  useEffect(
    () => () => {
      if (playingRef.current) onStopRef.current?.();
    },
    [],
  );

  const togglePlay = (): void => {
    const next = !playing;
    setPlaying(next);
    playingRef.current = next;
    if (next) onPlay?.();
    else onStop?.();
  };

  const hasTranscript = !!transcript && transcript.length > 0;

  // Honest empty state — no episode row (or none ready yet): say so, show nothing fabricated.
  if (!title) {
    return (
      <Screen>
        <View style={styles.header}>
          <View style={styles.iconBtn} />
          <Text style={[styles.eyebrow, { color: T.faint }]}>AI EPISODE</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.empty}>
          <Text style={[styles.title, { color: T.ink, fontFamily: fonts.headline }]}>No episode yet</Text>
          <Text style={[styles.emptySub, { color: T.sub }]}>
            Episodes built from the words you know will appear here once one is ready.
          </Text>
        </View>
      </Screen>
    );
  }

  const skipBtn = (back: boolean, onPress: () => void): React.JSX.Element => (
    <Pressable accessibilityRole="button" accessibilityLabel={back ? 'Back 15 seconds' : 'Forward 15 seconds'} onPress={onPress} style={styles.skip}>
      <SkipIcon color={T.sub} back={back} />
      <Text style={[styles.skipLabel, { color: T.sub }]}>15</Text>
    </Pressable>
  );

  return (
    <Screen>
      <View style={styles.header}>
        {onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Collapse" onPress={onClose} style={[styles.iconBtn, { backgroundColor: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(26,39,51,0.05)' }]}>
            <CardIcon name="chevD" size={19} color={T.sub} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <Text style={[styles.eyebrow, { color: T.faint }]}>AI EPISODE</Text>
        {/* right spacer keeps the eyebrow centered; the mockup's settings button had no action */}
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: T.ink, fontFamily: fonts.headline }]}>{title}</Text>
        {durationLabel || wordsKnown !== undefined ? (
          <Text style={[styles.sub, { color: T.sub }]}>
            {durationLabel ?? ''}
            {durationLabel && wordsKnown !== undefined ? ' · ' : ''}
            {wordsKnown !== undefined ? (
              <>
                built from <Text style={{ color: T.primary, fontWeight: '600' }}>{wordsKnown} words</Text> you know
              </>
            ) : null}
          </Text>
        ) : null}
      </View>

      <View style={styles.heroRow}>
        {onSkipBack ? skipBtn(true, onSkipBack) : null}
        <VoiceOrb size={184} playing={playing} onPress={togglePlay} />
        {onSkipForward ? skipBtn(false, onSkipForward) : null}
      </View>

      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <SpeedChip value={speed} onChange={(s) => setSpeed(s)} />
      </View>

      {/* progress line — only when real playback progress is known (no fabricated 38%) */}
      {progress !== undefined ? (
        <View style={{ marginTop: 18 }}>
          <View style={[styles.track, { backgroundColor: T.dark ? 'rgba(255,255,255,0.09)' : 'rgba(26,39,51,0.08)' }]}>
            <View style={[styles.trackFill, { backgroundColor: T.primary, width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
          </View>
          {position && duration ? (
            <View style={styles.timeRow}>
              <Text style={[styles.time, { color: T.faint }]}>{position}</Text>
              <Text style={[styles.time, { color: T.faint }]}>{duration}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {hasTranscript ? (
        <>
          <View style={{ alignItems: 'center', marginTop: 22 }}>
            <Pressable accessibilityRole="button" onPress={() => setShowT((s) => !s)} style={[styles.transToggle, { backgroundColor: showT ? T.primarySoft : 'transparent', borderColor: showT ? 'transparent' : T.hair }]}>
              <CardIcon name="text" size={16} color={showT ? T.primary : T.sub} />
              <Text style={[styles.transToggleText, { color: showT ? T.primary : T.sub }]}>Transcript</Text>
            </Pressable>
          </View>

          {showT ? (
            <View style={styles.transcript}>
              {transcript?.map((l, i) => {
                const current = l.state === 'current';
                const past = l.state === 'past';
                return (
                  <View key={i} style={{ opacity: past ? 0.4 : 1 }}>
                    <Text style={[styles.lineLv, { color: current ? T.primary : T.ink, fontFamily: fonts.headline }]}>{l.lv}</Text>
                    {l.en ? <Text style={[styles.lineEn, { color: T.sub }]}>{l.en}</Text> : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', rowGap: 12, paddingHorizontal: 24 },
  emptySub: { fontSize: 14.5, lineHeight: 21, textAlign: 'center', maxWidth: 280 },
});
