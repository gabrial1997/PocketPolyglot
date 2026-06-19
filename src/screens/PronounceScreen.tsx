/* eslint-disable react/prop-types */
// pron — pronunciation comparison (BACKEND_INTEGRATION §4, README 05). Hear the native model, record
// yourself, compare the two waveforms + pitch curves. Real scoring is backend ML (§7); the match note
// here is presentational. Out: { spoke:true, recording }.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-b.jsx `PronounceScreen`). Word hero +
// "SAY IT BACK" eyebrow; Native / You compare rows (surface radius 22, icon chip + 0:01 + waveform);
// SpeedChip (slows the native model only); a pitch-curve overlay card (native dashed vs you solid
// primary); the green match note; bottom Record + Compare controls.
//
// Flow: Record cycles the take (onRecordStart -> rec -> onRecordStop). Compare plays the two clips
// back-to-back (onPlayCompare) and then completes the card after a readable beat — comparing is the
// terminal beat of this practice card (the old standalone "Continue" is folded into Compare).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Screen, Waveform, SpeedChip } from '../components';
import { CardIcon } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, fonts } from '../theme/tokens';
import type { RecordingCardProps } from './cardProps';

const COMPARE_MS = 1700; // play native+you back-to-back, then complete

// Deterministic smooth pitch curve from a seed (mirrors kit Pitch helper).
function pitchPoints(seed: string): string {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) { s ^= seed.charCodeAt(i); s = Math.imul(s, 16777619); }
  const rnd = (): number => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  return Array.from({ length: 24 }, (_, i) => `${((i / 23) * 300).toFixed(1)},${(42 - rnd() * 30 - 4).toFixed(1)}`).join(' ');
}

export function PronounceScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onRecordStart, onRecordStop, onPlayCompare, onComplete, speed, onSpeedChange } = props;
  const T = useTheme();
  const [rec, setRec] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [comparing, setComparing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const toggleRecord = (): void => {
    if (rec) { onRecordStop(); setRec(false); setRecorded(true); }
    else { onRecordStart(); setRec(true); }
  };
  const doCompare = (): void => {
    if (!recorded || comparing) return;
    setComparing(true);
    onPlayCompare?.('native');
    timer.current = setTimeout(() => onPlayCompare?.('you'), COMPARE_MS / 2);
    timer.current = setTimeout(() => onComplete({ itemId: item.id, cardKind: 'pron', spoke: true }), COMPARE_MS);
  };

  const Row = ({ icon, label, you, seed }: { icon: 'speaker' | 'mic'; label: string; you?: boolean; seed: string }): React.JSX.Element => (
    <View style={[styles.row, { backgroundColor: T.surface, borderColor: you ? hexA(T.primary, 0.4) : T.hair }, T.shadow]}>
      <View style={styles.rowHead}>
        <View style={[styles.chip, { backgroundColor: you ? T.primarySoft : T.sunken }]}>
          <CardIcon name={icon} size={17} color={you ? T.primary : T.sub} />
        </View>
        <Text style={[styles.rowLabel, { color: T.ink }]}>{label}</Text>
        <Text style={[styles.rowTime, { color: T.faint }]}>0:01</Text>
      </View>
      <Waveform seed={seed} played={0} height={42} count={40} envelope={you ? undefined : item.audio.envelope} />
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
          <Row icon="speaker" label="Native" seed={`${item.id}-native`} />
          {recorded ? (
            <Row icon="mic" label="You" you seed={`${item.id}-you`} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: T.surface, borderColor: T.hair }]}>
              <Text style={[styles.placeholderText, { color: T.faint }]}>Record yourself to compare</Text>
            </View>
          )}
        </View>

        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <SpeedChip value={speed} onChange={onSpeedChange} />
        </View>

        {recorded ? (
          <View style={[styles.pitchCard, { backgroundColor: T.surface, borderColor: T.hair }, T.shadow]}>
            <View style={styles.pitchHead}>
              <Text style={[styles.pitchTitle, { color: T.faint }]}>PITCH</Text>
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendDash, { backgroundColor: T.waveRest }]} /><Text style={[styles.legendText, { color: T.sub }]}>Native</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDash, { backgroundColor: T.primary }]} /><Text style={[styles.legendText, { color: T.primary }]}>You</Text></View>
              </View>
            </View>
            <Svg width="100%" height={46} viewBox="0 0 300 46" preserveAspectRatio="none">
              <Polyline points={pitchPoints(`${item.id}-native-p`)} fill="none" stroke={T.waveRest} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 6" />
              <Polyline points={pitchPoints(`${item.id}-you-p`)} fill="none" stroke={T.primary} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        {recorded ? (
          <View style={styles.matchNote}>
            <View style={[styles.matchCircle, { backgroundColor: T.goodSoft }]}>
              <CardIcon name="check" size={13} color={T.good} sw={2.4} />
            </View>
            <Text style={[styles.matchText, { color: T.sub }]}>Close. Lengthen the <Text style={{ color: T.ink }}>ie</Text> a touch.</Text>
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
  hero: { fontSize: 52, fontWeight: '500', letterSpacing: -0.8, lineHeight: 52, fontFamily: fonts.headline },
  pron: { fontSize: 16, marginTop: 8 },
  rows: { rowGap: 12 },
  row: { borderRadius: 22, padding: 18, borderWidth: StyleSheet.hairlineWidth },
  rowHead: { flexDirection: 'row', alignItems: 'center', columnGap: 10, marginBottom: 13 },
  chip: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  rowTime: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  placeholder: { borderRadius: 22, paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  placeholderText: { fontSize: 14 },
  pitchCard: { borderRadius: 22, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, marginTop: 12, borderWidth: StyleSheet.hairlineWidth },
  pitchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  pitchTitle: { fontSize: 11.5, fontWeight: '600', letterSpacing: 1 },
  legend: { flexDirection: 'row', columnGap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', columnGap: 5 },
  legendDash: { width: 14, height: 2.5, borderRadius: 2 },
  legendText: { fontSize: 11.5, fontWeight: '600' },
  matchNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, marginBottom: 16 },
  matchCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  matchText: { fontSize: 14, fontWeight: '500' },
  controls: { flexDirection: 'row', alignItems: 'center', columnGap: 12, paddingBottom: 30 },
  ctrl: { flex: 1, height: 56, borderRadius: 18, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 },
  ctrlFilled: { borderWidth: 0, shadowOpacity: 0.24, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  recDot: { width: 11, height: 11, borderRadius: 6 },
  ctrlText: { fontSize: 16, fontWeight: '600' },
});
