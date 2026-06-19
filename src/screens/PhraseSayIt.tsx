// phrase/sayit — mature production review (BACKEND_INTEGRATION §4). English cue -> record (from
// memory, no pre-hear: translation recall) -> compare native vs you -> self-rate. Native audio
// appears only in the compare stage. Out: { spoke:true, recording, selfRating }.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-phrase.jsx `PhraseSayIt`). Eyebrow
// "REVIEW · SAY IT"; cue stage = English prompt + "Say it in Latvian." + a generous record orb;
// compare stage = the phrase + native/you CompareRows + "Play back-to-back" + SpeedChip + the
// next-review note; footer self-rate (Not yet / Got it). The "again" copy says "shortly" — never a
// "10 minutes" time claim (locked product rule).
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, MicOrb, SpeedChip } from '../components';
import { Eyebrow, PhraseLine, CompareRow, PlayBackToBack } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import type { RecordingCardProps } from './cardProps';
type Stage = 'cue' | 'rec' | 'compare';

export function PhraseSayIt(props: RecordingCardProps): React.JSX.Element {
  const { item, onRecordStart, onRecordStop, onPlayCompare, onComplete, speed, onSpeedChange } = props;
  const T = useTheme();
  const [stage, setStage] = useState<Stage>('cue');
  const [rated, setRated] = useState<'good' | 'again' | null>(null);

  const rate = (selfRating: 'good' | 'again'): void => {
    setRated(selfRating);
    onComplete({ itemId: item.id, cardKind: 'phrase/sayit', spoke: true, selfRating });
  };

  return (
    <Screen>
      <View style={styles.body}>
        <Eyebrow>Review · say it</Eyebrow>

        {stage !== 'compare' ? (
          <>
            <Text style={[styles.cue, { color: T.ink }]}>{item.gloss}</Text>
            <Text style={[styles.cueSub, { color: T.sub }]}>Say it in Latvian.</Text>
            <View style={styles.mic}>
              <MicOrb
                size={84}
                rec={stage === 'rec'}
                onPress={() => {
                  if (stage === 'rec') { onRecordStop(); setStage('compare'); }
                  else { onRecordStart(); setStage('rec'); }
                }}
              />
              <Text style={[styles.recHint, { color: stage === 'rec' ? T.record : T.faint, fontWeight: stage === 'rec' ? '600' : '400' }]}>
                {stage === 'rec' ? 'Listening… tap to stop' : 'Tap to record'}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={{ marginTop: 20 }}>
              <PhraseLine phrase={item.target} size={29} />
            </View>
            <Text style={[styles.cueSub, { color: T.sub, marginTop: 10 }]}>{item.gloss}</Text>

            <View style={styles.compare}>
              <CompareRow label="Native" icon="speaker" envelope={item.audio.envelope} onPress={() => onPlayCompare?.('native')} />
              <CompareRow label="You" icon="mic" onPress={() => onPlayCompare?.('you')} />
            </View>

            <View style={{ marginTop: 18 }}>
              <PlayBackToBack onPress={() => onPlayCompare?.('native')} />
            </View>
            <View style={{ marginTop: 12 }}>
              <SpeedChip value={speed} onChange={onSpeedChange} />
            </View>
            <Text style={[styles.note, { color: rated === 'good' ? T.good : T.sub }]}>
              {rated === 'good'
                ? // REAL projected interval carried on the item (never a fabricated number); a
                  // neutral truthful fallback when there is no live schedule (stub/sample data).
                  `${item.reviewPreview?.pass ?? 'Your next review is scheduled'}.`
                : rated === 'again'
                  ? <>We’ll come back to it <Text style={{ fontWeight: '700', color: T.ink }}>shortly</Text>.</>
                  : ''}
            </Text>
          </>
        )}
      </View>

      <View style={styles.footer}>
        {stage !== 'compare' ? (
          <Pressable accessibilityRole="button" onPress={() => setStage('compare')} style={styles.ghost}>
            <Text style={[styles.ghostText, { color: T.faint }]}>Show the phrase</Text>
          </Pressable>
        ) : (
          <View style={styles.rateRow}>
            <Pressable accessibilityRole="button" onPress={() => rate('again')} style={[styles.rateBtn, { borderColor: T.hair, backgroundColor: rated === 'again' ? (T.dark ? 'rgba(255,255,255,0.08)' : 'rgba(26,39,51,0.06)') : 'transparent' }]}>
              <Text style={[styles.rateText, { color: T.sub }]}>Not yet</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => rate('good')} style={[styles.rateBtn, styles.rateGood, { backgroundColor: rated === 'good' ? T.good : T.primary, shadowColor: rated === 'good' ? T.good : T.primary }]}>
              <Text style={[styles.rateText, { color: '#fff' }]}>Got it</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 8 },
  cue: { fontSize: 26, fontWeight: '500', letterSpacing: -0.3, textAlign: 'center', marginTop: 26 },
  cueSub: { fontSize: 14.5, textAlign: 'center', marginTop: 12 },
  mic: { alignItems: 'center', rowGap: 16, marginTop: 44 },
  recHint: { fontSize: 13 },
  compare: { width: '100%', marginTop: 26, rowGap: 10 },
  note: { fontSize: 13.5, fontWeight: '500', marginTop: 14, minHeight: 18, textAlign: 'center' },
  footer: { paddingBottom: 30 },
  ghost: { height: 48, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 14.5, fontWeight: '600' },
  rateRow: { flexDirection: 'row', columnGap: 12 },
  rateBtn: { flex: 1, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  rateGood: { borderWidth: 0, shadowOpacity: 0.24, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  rateText: { fontSize: 16, fontWeight: '600' },
});
