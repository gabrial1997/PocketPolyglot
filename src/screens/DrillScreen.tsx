// drill — consonant minimal-pair perception drill, L vs Ļ (ports kit screens-drill.jsx `DrillScreen`).
// Stage machine: listen -> chosen -> say -> done. The L/Ļ palatalization contrast is one English
// ears miss, so we HEAR the sound, DISCRIMINATE which glyph it was, then SAY IT BACK.
//   · listen  — hear the clip (item.pair audio) and pick which sound it was.
//   · chosen  — a CORRECT pick commits + unlocks say-it; a WRONG pick does NOT advance / reveal
//               (CLAUDE.md: red "Try again", chosen side reddens, correct answer stays hidden).
//   · say     — produce it (record), the target word as the on-screen guide.
//   · done    — Continue -> onComplete { correct, spoke:true }.
// Pure card: data-in (item) / events-out (callbacks). No service imports; only ephemeral UI state.
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, PlayOrb, MicOrb, Waveform, SpeedChip, ChoiceButton, CtaButton, TryAgainNote } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { type, fonts } from '../theme/tokens';
import type { RecordingCardProps } from './cardProps';

type Say = 'idle' | 'rec' | 'done';

export function DrillScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onRecordStart, onRecordStop, onComplete, speed, onSpeedChange } = props;
  const T = useTheme();

  // A wrong pick does NOT advance (CLAUDE.md): `committed` is only set by the CORRECT side and is
  // what unlocks the say-it step; `wrongPick` reddens only the chosen wrong side; `missed` keeps
  // honest first-try correctness for the SRS interval. The correct side is never revealed.
  const [committed, setCommitted] = useState<'a' | 'b' | null>(null);
  const [wrongPick, setWrongPick] = useState<'a' | 'b' | null>(null);
  const [missed, setMissed] = useState(false);
  const [say, setSay] = useState<Say>('idle');

  const pair = item.pair;

  // ── SAY: produce the sound, the target word as the guide ──
  if (committed !== null) {
    return (
      <Screen>
        <View style={styles.sayBody}>
          <Text style={[styles.eyebrow, { color: T.faint }]}>SAY IT BACK</Text>
          <Text style={[styles.hero, { color: T.ink, fontFamily: fonts.headline }]}>{item.target}</Text>
          <Text style={[styles.pron, { color: T.faint }]}>
            {item.gloss}
            {item.pron ? ` · ${item.pron}` : ''}
          </Text>
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
                  onComplete({ itemId: item.id, cardKind: 'drill', correct: !missed, spoke: true })
                }
              />
            ) : null}
          </View>
        </View>
      </Screen>
    );
  }

  // ── LISTEN: hear the clip, then discriminate which sound it was ──
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
        <Text style={[styles.eyebrow, { color: T.faint }]}>SOUND CHECK · CONSONANT</Text>
        <Text style={[styles.prompt, { color: T.ink, fontFamily: fonts.headline }]}>Which did you hear?</Text>
        <View style={styles.waveWrap}>
          <Waveform seed={pair ? `${pair.a}-${pair.b}` : 'l-pair'} height={52} count={34} />
        </View>
        <PlayOrb onPress={() => onPlay('native')} />
        <SpeedChip value={speed} onChange={onSpeedChange} />
        {pair ? (
          <>
            <ChoiceButton label={pair.a} state={wrongPick === 'a' ? 'wrong' : 'idle'} onPress={() => choose('a')} />
            <ChoiceButton label={pair.b} state={wrongPick === 'b' ? 'wrong' : 'idle'} onPress={() => choose('b')} />
            {wrongPick ? <TryAgainNote onRetry={() => setWrongPick(null)} /> : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', rowGap: 12 },
  sayBody: { flex: 1, justifyContent: 'center', alignItems: 'center', rowGap: 12 },
  eyebrow: { fontSize: type.eyebrow, fontWeight: '700', letterSpacing: type.eyebrowSpacing },
  prompt: { fontSize: 27, fontWeight: '500', letterSpacing: -0.3, textAlign: 'center' },
  hero: { fontSize: type.wordHero, letterSpacing: type.wordHeroSpacing },
  pron: { fontSize: type.pron },
  waveWrap: { width: '64%', alignSelf: 'center' },
  sayControls: { alignItems: 'center', rowGap: 12, marginTop: 8 },
  recHint: { fontSize: type.label, fontWeight: '600' },
});
