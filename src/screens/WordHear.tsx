// word/hear — recognition review (BACKEND_INTEGRATION §4). Audio is the cue; choices are GLOSSES.
// Out: { correct, spoke:false }. No recording stage.
//
// LOCKED wrong-answer rule (CLAUDE.md): a wrong pick does NOT advance — only the chosen wrong option
// reddens, the correct answer is never revealed, and the first-try miss is remembered (`missed`) for
// honest SRS correctness. A correct pick turns green, then completes after a short readable beat.
// Visual: matches mockup word/hear choose stage (eyebrow, audio hero, choice list).
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, PlayOrb, ChoiceButton, SpeedChip, LiveWaveform, usePlayClip, FRAME_MS, TryAgainNote, type Speed } from '../components';
import { Eyebrow, Caption, CardBody } from '../components/cardChrome';
import type { ChoiceCardProps } from './cardProps';

const ADVANCE_DELAY_MS = 500;

export function WordHear({ item, onPlay, onStop, onPreload, onAnswer, onComplete, speed: speedProp, onSpeedChange }: ChoiceCardProps): React.JSX.Element {
  // Playback speed is ephemeral card state (CLAUDE.md boundary). The chip drives it; an explicit
  // prop seeds the initial value and an optional listener is notified for any external interest.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(item.audio.envelope); // reactive soundbar gate
  const [wrongValue, setWrongValue] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const [correctValue, setCorrectValue] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Warm the native clip on mount so the first orb tap starts without a load stall (bug 1).
  useEffect(() => {
    onPreload?.('native');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (value: string, correct: boolean): void => {
    if (correctValue !== null) return;
    onAnswer(value, correct);
    if (correct) {
      setWrongValue(null);
      setCorrectValue(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onComplete({ itemId: item.id, cardKind: 'word/hear', correct: !missed, spoke: false });
      }, ADVANCE_DELAY_MS);
    } else {
      setMissed(true);
      setWrongValue(value);
    }
  };

  // The orb is a play/pause toggle (bug 3): tapping mid-clip stops the voice (stopGate clears the
  // local fallback gate too, for the no-real-audio path); tapping at rest replays.
  const replay = (): void => {
    if (playing) { onStop?.(); stopGate(); }
    else play(() => onPlay('native', speed), speed);
  };

  return (
    <Screen>
      <CardBody>
        <Eyebrow>Listen — which meaning?</Eyebrow>
        <View style={styles.wave}>
          <LiveWaveform envelope={item.audio.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={48} count={42} />
        </View>
        <PlayOrb size={64} playing={playing} onPress={replay} />
        <SpeedChip value={speed} onChange={changeSpeed} />
        <Caption>Tap to replay</Caption>
        <View style={styles.choices}>
          {(item.choices ?? []).map((c) => (
            <ChoiceButton
              key={c.value}
              label={c.gloss ?? c.value}
              state={c.value === correctValue ? 'correct' : c.value === wrongValue ? 'wrong' : 'idle'}
              disabled={correctValue !== null}
              onPress={() => pick(c.value, c.correct)}
            />
          ))}
        </View>
        {wrongValue ? <TryAgainNote onRetry={() => setWrongValue(null)} /> : null}
      </CardBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wave: { width: '78%', marginTop: 4 },
  choices: { width: '100%', rowGap: 10, marginTop: 10 },
});
