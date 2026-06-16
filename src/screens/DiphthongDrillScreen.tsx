// diphthong — the hard 'ie' glide drill (ports kit screens-drill.jsx `DiphthongDrillScreen`).
// Stage machine: meet -> contrast -> say -> done. 'ie' is one gliding sound English ears flatten
// to a long ē, so we TEACH the movement first (GlideTrack), then test the minimal-pair contrast,
// then have the learner produce it.
//   · meet     — feel the glide before hearing it (item.glide -> GlideTrack).
//   · contrast — minimal-pair pick (item.pair). WRONG pick does NOT advance / reveal (CLAUDE.md).
//   · say      — produce it (record), glide as the on-screen guide.
//   · done     — Continue -> onComplete { correct, spoke:true }.
// Pure card: data-in (item) / events-out (callbacks). No service imports; only ephemeral UI state.
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, PlayOrb, MicOrb, Waveform, SpeedChip, ChoiceButton, CtaButton, TryAgainNote } from '../components';
import { GlideTrack } from '../components/GlideTrack';
import { useTheme } from '../theme/ThemeProvider';
import { type, fonts } from '../theme/tokens';
import type { RecordingCardProps } from './cardProps';

type Phase = 'meet' | 'contrast' | 'say';
type Say = 'idle' | 'rec' | 'done';

export function DiphthongDrillScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onRecordStart, onRecordStop, onComplete, speed, onSpeedChange } = props;
  const T = useTheme();

  const [phase, setPhase] = useState<Phase>('meet');
  // A wrong pick does NOT advance (CLAUDE.md): `committed` is only set by the CORRECT side and is
  // what unlocks the say-it step; `wrongPick` reddens only the chosen wrong side; `missed` keeps
  // honest first-try correctness for the SRS interval. The correct side is never revealed.
  const [committed, setCommitted] = useState<'a' | 'b' | null>(null);
  const [wrongPick, setWrongPick] = useState<'a' | 'b' | null>(null);
  const [missed, setMissed] = useState(false);
  const [say, setSay] = useState<Say>('idle');

  const glide = item.glide;
  const pair = item.pair;

  // ── MEET: feel the glide before hearing the contrast ──
  if (phase === 'meet') {
    return (
      <Screen>
        <View style={styles.meetBody}>
          <Text style={[styles.eyebrow, { color: T.faint }]}>HARD COMBINATION</Text>
          <Text style={[styles.combo, { color: T.ink, fontFamily: fonts.headline }]}>{glide?.combo ?? 'ie'}</Text>
          <Text style={[styles.lede, { color: T.sub }]}>
            Not “ee” and not a flat “e” — it glides from {glide?.from ?? 'i'} to {glide?.to ?? 'e'} in one move.
          </Text>
          <View style={styles.glideWrap}>
            <GlideTrack from={glide?.from} to={glide?.to} color={T.primary} />
          </View>
          <PlayOrb size={66} onPress={() => onPlay('native')} />
          <SpeedChip value={speed} onChange={onSpeedChange} />
          <Text style={[styles.hint, { color: T.faint }]}>Tap to hear the glide</Text>
        </View>
        <View style={styles.footer}>
          <CtaButton title="Hear it in a word" onPress={() => setPhase('contrast')} />
        </View>
      </Screen>
    );
  }

  // ── SAY: produce it, glide as the guide ──
  if (phase === 'say') {
    return (
      <Screen>
        <View style={styles.meetBody}>
          <Text style={[styles.eyebrow, { color: T.faint }]}>SAY IT BACK</Text>
          <Text style={[styles.hero, { color: T.ink, fontFamily: fonts.headline }]}>{item.target}</Text>
          <Text style={[styles.pron, { color: T.faint }]}>{item.gloss}{item.pron ? ` · ${item.pron}` : ''}</Text>
          <View style={styles.glideWrap}>
            <GlideTrack from={glide?.from} to={glide?.to} color={T.primary} width={230} />
          </View>
          <PlayOrb size={50} filled={false} onPress={() => onPlay('native')} />
          <SpeedChip value={speed} onChange={onSpeedChange} />
          <View style={styles.sayControls}>
            {say === 'idle' ? (
              <MicOrb onPress={() => { onRecordStart(); setSay('rec'); }} />
            ) : null}
            {say === 'rec' ? (
              <>
                <MicOrb rec onPress={() => { onRecordStop(); setSay('done'); }} />
                <Text style={[styles.recHint, { color: T.record }]}>Listening… tap to stop</Text>
              </>
            ) : null}
            {say === 'done' ? (
              <CtaButton
                title="Continue"
                onPress={() =>
                  onComplete({
                    itemId: item.id,
                    cardKind: 'diphthong',
                    correct: !missed,
                    spoke: true,
                  })
                }
              />
            ) : null}
          </View>
        </View>
      </Screen>
    );
  }

  // ── CONTRAST: minimal pair that only ie vs ē separates ──
  const choose = (side: 'a' | 'b'): void => {
    if (!pair) return;
    if (side === pair.correct) setCommitted(side); // correct: advance to say-it
    else {
      setWrongPick(side);
      setMissed(true); // wrong: stay, redden only this side, never advance
    }
  };

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: T.faint }]}>SOUND CHECK · THE GLIDE VS FLAT Ē</Text>
        <Text style={[styles.prompt, { color: T.ink, fontFamily: fonts.headline }]}>Which did you hear?</Text>
        <View style={styles.waveWrap}>
          <Waveform
            seed={pair ? `${pair.a}-${pair.b}` : 'ie-pair'}
            envelope={item.audio.envelope}
            height={52}
            count={34}
          />
        </View>
        <PlayOrb onPress={() => onPlay('native')} />
        <SpeedChip value={speed} onChange={onSpeedChange} />
        {committed === null && pair ? (
          <>
            <ChoiceButton label={pair.a} state={wrongPick === 'a' ? 'wrong' : 'idle'} onPress={() => choose('a')} />
            <ChoiceButton label={pair.b} state={wrongPick === 'b' ? 'wrong' : 'idle'} onPress={() => choose('b')} />
            {wrongPick ? <TryAgainNote onRetry={() => setWrongPick(null)} /> : null}
          </>
        ) : null}
        {committed !== null ? (
          <CtaButton title="Say it back" onPress={() => setPhase('say')} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', rowGap: 12 },
  meetBody: { flex: 1, justifyContent: 'center', alignItems: 'center', rowGap: 12 },
  footer: { paddingBottom: 30 },
  eyebrow: { fontSize: type.eyebrow, fontWeight: '700', letterSpacing: type.eyebrowSpacing },
  combo: { fontSize: 76, fontWeight: '500', letterSpacing: -1 },
  lede: { fontSize: type.body, textAlign: 'center', maxWidth: 280, lineHeight: 22 },
  hero: { fontSize: type.wordHero, letterSpacing: type.wordHeroSpacing },
  pron: { fontSize: type.pron },
  prompt: { fontSize: 27, fontWeight: '500', letterSpacing: -0.3, textAlign: 'center' },
  hint: { fontSize: type.label, fontWeight: '500' },
  glideWrap: { marginVertical: 8, alignItems: 'center' },
  waveWrap: { width: '64%', alignSelf: 'center' },
  sayControls: { alignItems: 'center', rowGap: 12, marginTop: 8 },
  recHint: { fontSize: type.label, fontWeight: '600' },
});
