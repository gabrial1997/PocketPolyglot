// phrase/meaning — comprehension check, idioms only (BACKEND_INTEGRATION §4). Out: { correct }.
//
// LOCKED wrong-answer rule (CLAUDE.md): a wrong pick does NOT advance — only the chosen wrong option
// reddens, the correct answer is never revealed, and the first-try miss is remembered (`missed`) for
// honest SRS correctness. A correct pick turns green and reveals the literal-gloss explanation;
// Continue stays disabled until correct (the mockup uses an explicit Continue, not auto-advance).
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-phrase.jsx `PhraseMeaning`). Eyebrow
// "NEW PHRASE · IDIOM"; PhraseLine; a compact audio row (PlayOrb 46 + waveform) + SpeedChip; serif
// "What does it mean?"; the 3-option choice list; the carmine/green feedback line; footer Continue.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, PlayOrb, ChoiceButton, SpeedChip, LiveWaveform, usePlayClip, FRAME_MS, CtaButton, type Speed } from '../components';
import { PromptText, LiteralNote } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import type { ChoiceCardProps } from './cardProps';

export function PhraseMeaning({ item, onPlay, onStop, onPreload, onAnswer, onComplete, speed: speedProp, onSpeedChange }: ChoiceCardProps): React.JSX.Element {
  const T = useTheme();
  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip drives it.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(item.audio?.envelope); // reactive soundbar gate
  // The orb is a play/pause toggle (bug 3): tapping mid-clip stops the voice; tapping at rest replays.
  const replay = (): void => {
    if (playing) { onStop?.(); stopGate(); }
    else play(() => onPlay('native', speed), speed);
  };
  // Warm the native clip on mount so the first orb tap starts without a load stall (bug 1).
  useEffect(() => {
    onPreload?.('native');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [wrongValue, setWrongValue] = useState<string | null>(null);
  const [correctValue, setCorrectValue] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const choices = item.choices ?? [];

  const pick = (value: string, correct: boolean): void => {
    if (correctValue !== null) return; // locked once answered correctly
    onAnswer(value, correct);
    if (correct) { setWrongValue(null); setCorrectValue(value); }
    else { setMissed(true); setWrongValue(value); }
  };

  const solved = correctValue !== null;
  // Once solved, the usage note (the functional "what it really means" nuance) becomes the
  // feedback line; the literal word-for-word reading is shown below it via LiteralNote.
  const feedback = solved
    ? (item.usageNote ?? (item.isIdiom ? 'That’s it — the words don’t add up literally.' : 'That’s right.'))
    : wrongValue
      ? 'Not quite — give it another try.'
      : '';

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: T.faint }]}>
          WHICH MEANING?{item.isIdiom ? <Text style={{ color: T.primary }}> · IDIOM</Text> : null}
        </Text>

        <View style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={[styles.phrase, { color: T.ink }]}>{item.target}</Text>
        </View>

        {/* compact audio row */}
        <View style={styles.audioRow}>
          <PlayOrb size={46} playing={playing} onPress={replay} />
          <View style={{ flex: 1 }}>
            <LiveWaveform envelope={item.audio?.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={34} count={36} />
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <SpeedChip value={speed} onChange={changeSpeed} />
        </View>

        <View style={{ marginTop: 30 }}>
          <PromptText variant="serif">What does it mean?</PromptText>
        </View>

        <View style={styles.choices}>
          {choices.map((c) => (
            <ChoiceButton
              key={c.value}
              label={c.gloss ?? c.value}
              state={c.value === correctValue ? 'correct' : c.value === wrongValue ? 'wrong' : 'idle'}
              disabled={solved}
              onPress={() => pick(c.value, c.correct)}
            />
          ))}
        </View>

        <Text style={[styles.feedback, { color: solved ? T.sub : T.record }]}>{feedback}</Text>
        {/* literal word-for-word reading, revealed once solved — only when a literal reading is authored */}
        {solved && item.literal ? <LiteralNote literal={item.literal} usageNote={undefined} /> : null}
      </View>

      <View style={styles.footer}>
        <CtaButton
          title="Continue"
          disabled={!solved}
          onPress={() => onComplete({ itemId: item.id, cardKind: 'phrase/meaning', correct: !missed })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 8 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.4, textAlign: 'center' },
  phrase: { fontFamily: fonts.headline, fontSize: 32, fontWeight: '500', letterSpacing: -0.5, textAlign: 'center' },
  audioRow: { width: '84%', marginTop: 24, flexDirection: 'row', alignItems: 'center', columnGap: 12 },
  choices: { width: '100%', marginTop: 18, rowGap: 10 },
  feedback: { fontSize: 13, marginTop: 16, minHeight: 18, textAlign: 'center', paddingHorizontal: 12 },
  footer: { paddingBottom: 30 },
});
