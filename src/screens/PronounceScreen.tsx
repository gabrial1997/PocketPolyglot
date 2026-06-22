/* eslint-disable react/prop-types */
// pron — pronunciation comparison (BACKEND_INTEGRATION §4, README 05). Hear the native model, record
// yourself, compare the two takes by ear. Out: { spoke:true, recording }.
//
// Phase-0 honesty: there is NO pronunciation scoring yet (GOP lands with the Phase-1 ML service, §7).
// So this card shows ONLY what's real — the native amplitude waveform + A/B self-compare. It does
// NOT render a fabricated pitch curve or a fabricated "close, lengthen the ie" verdict; the closing
// note simply points the learner at their own ear. The pitch overlay returns when real pitch data does.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-b.jsx `PronounceScreen`). Word hero +
// "SAY IT BACK" eyebrow; Native / You compare rows (surface radius 22, icon chip + 0:01 + waveform);
// SpeedChip (slows the native model only); bottom Record + Compare controls.
//
// Flow: Record cycles the take (onRecordStart -> rec -> onRecordStop). Compare plays the two clips
// back-to-back (onPlayCompare) and then completes the card after a readable beat — comparing is the
// terminal beat of this practice card (the old standalone "Continue" is folded into Compare).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, LiveWaveform, FRAME_MS, SpeedChip, type Speed } from '../components';
import { CardIcon } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, fonts } from '../theme/tokens';
import type { RecordingCardProps } from './cardProps';

const COMPARE_MS = 1700; // play native+you back-to-back, then complete

export function PronounceScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onRecordStart, onRecordStop, onPlayCompare, onComplete, speed: speedProp, onSpeedChange } = props;
  const T = useTheme();
  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip slows the native model.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const [rec, setRec] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [comparing, setComparing] = useState(false);
  // Which clip is sounding during a compare, so its row's soundbar moves and the other rests.
  const [playingSide, setPlayingSide] = useState<'native' | 'you' | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const toggleRecord = (): void => {
    if (rec) { onRecordStop(); setRec(false); setRecorded(true); }
    else { onRecordStart(); setRec(true); }
  };
  const doCompare = (): void => {
    if (!recorded || comparing) return;
    setComparing(true);
    setPlayingSide('native');
    onPlayCompare?.('native', speed);
    // The native model plays at `speed`, so it lasts ~1/speed longer; stretch its segment to match
    // so a slowed take is heard in full before the (always natural-rate) "You" take follows.
    const half = COMPARE_MS / 2;
    const nativeDur = half / speed;
    timers.current.push(setTimeout(() => { setPlayingSide('you'); onPlayCompare?.('you'); }, nativeDur));
    timers.current.push(setTimeout(() => { setPlayingSide(null); onComplete({ itemId: item.id, cardKind: 'pron', spoke: true }); }, nativeDur + half));
  };

  const Row = ({ icon, label, you, playing }: { icon: 'speaker' | 'mic'; label: string; you?: boolean; playing: boolean }): React.JSX.Element => (
    <View style={[styles.row, { backgroundColor: T.surface, borderColor: you ? hexA(T.primary, 0.4) : T.hair }, T.shadow]}>
      <View style={styles.rowHead}>
        <View style={[styles.chip, { backgroundColor: you ? T.primarySoft : T.sunken }]}>
          <CardIcon name={icon} size={17} color={you ? T.primary : T.sub} />
        </View>
        <Text style={[styles.rowLabel, { color: T.ink }]}>{label}</Text>
        <Text style={[styles.rowTime, { color: T.faint }]}>0:01</Text>
      </View>
      {/* The "You" take has no precomputed envelope, so its bar honestly rests rather than faking
          motion (locked constraint: the soundbar moves with REAL amplitude only). */}
      <LiveWaveform envelope={you ? undefined : item.audio?.envelope} playing={playing} frameMs={FRAME_MS} height={42} count={40} />
    </View>
  );

  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.wordBlock}>
          <Text style={[styles.eyebrow, { color: T.faint }]}>SAY IT BACK</Text>
          <Text style={[styles.hero, { color: T.ink }]}>{item.target}</Text>
          <Text style={[styles.pron, { color: T.sub }]}>
            {item.gloss}{item.pron ? <Text style={{ color: T.faint }}> · {item.pron}</Text> : null}
          </Text>
        </View>

        <View style={styles.rows}>
          <Row icon="speaker" label="Native" playing={playingSide === 'native'} />
          {recorded ? (
            <Row icon="mic" label="You" you playing={playingSide === 'you'} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: T.surface, borderColor: T.hair }]}>
              <Text style={[styles.placeholderText, { color: T.faint }]}>Record yourself to compare</Text>
            </View>
          )}
        </View>

        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <SpeedChip value={speed} onChange={changeSpeed} />
        </View>

        <View style={{ flex: 1 }} />

        {/* No pronunciation grade in Phase 0 — point the learner at their own ear instead of
            fabricating a verdict. A real match note returns with the GOP scoring service (§7). */}
        {recorded ? (
          <View style={styles.matchNote}>
            <Text style={[styles.matchText, { color: T.sub }]}>Play both back to compare — trust your ear.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Pressable accessibilityRole="button" onPress={toggleRecord} style={[styles.ctrl, { borderColor: rec ? hexA(T.record, 0.5) : T.hair, backgroundColor: rec ? hexA(T.record, T.dark ? 0.12 : 0.06) : 'transparent' }]}>
          <View style={[styles.recDot, { backgroundColor: T.record }]} />
          <Text style={[styles.ctrlText, { color: rec ? T.record : T.sub }]}>{rec ? 'Recording…' : 'Record'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!recorded || comparing} onPress={doCompare} style={[styles.ctrl, styles.ctrlFilled, { backgroundColor: T.primary, opacity: !recorded || comparing ? 0.5 : 1, shadowColor: T.primary }]}>
          <CardIcon name="play" size={16} color={T.onPrimary} />
          <Text style={[styles.ctrlText, { color: T.onPrimary }]}>Compare</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  wordBlock: { alignItems: 'center', marginTop: 18, marginBottom: 22 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.4, marginBottom: 8 },
  // lineHeight > fontSize so a top macron on the target word isn't cropped (device-walk clip fix).
  hero: { fontSize: 52, fontWeight: '500', letterSpacing: -0.8, lineHeight: 62, fontFamily: fonts.headline },
  pron: { fontSize: 16, marginTop: 8 },
  rows: { rowGap: 12 },
  row: { borderRadius: 22, padding: 18, borderWidth: StyleSheet.hairlineWidth },
  rowHead: { flexDirection: 'row', alignItems: 'center', columnGap: 10, marginBottom: 13 },
  chip: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  rowTime: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  placeholder: { borderRadius: 22, paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  placeholderText: { fontSize: 14 },
  matchNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, marginBottom: 16 },
  matchText: { fontSize: 14, fontWeight: '500' },
  controls: { flexDirection: 'row', alignItems: 'center', columnGap: 12, paddingBottom: 30 },
  ctrl: { flex: 1, height: 56, borderRadius: 18, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 },
  ctrlFilled: { borderWidth: 0, shadowOpacity: 0.24, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  recDot: { width: 11, height: 11, borderRadius: 6 },
  ctrlText: { fontSize: 16, fontWeight: '600' },
});
