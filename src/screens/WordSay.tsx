// word/say — production review, inverse (BACKEND_INTEGRATION §4). The GLOSS is the cue; choices are
// WORDS. Stages choose -> speak -> rec -> result. Out: { correct, spoke:true, recording }.
// LOCKED wrong-answer rule lives in useLoopStage (no advance / redden chosen / never reveal / remember).
// Visual: matches mockup word/say (gloss cue + word list -> say it -> native/you compare).
import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, PlayOrb, MicOrb, ChoiceButton, CtaButton, SpeedChip, TryAgainNote, LiveWaveform, usePlayClip, FRAME_MS } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { Eyebrow, WordHero, GlossLine, Caption, FootNote, PromptText, CardBody, CardFooter, CompareRow, PlayBackToBack, ResultNote } from '../components/cardChrome';
import { useLoopStage } from './useLoopStage';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

type Props = RecordingCardProps & ChoiceCardProps;

export function WordSay(props: Props): React.JSX.Element {
  const { item, onPlay, onAnswer, onRecordStart, onRecordStop, onPlayCompare, onComplete, speed, onSpeedChange } = props;
  const T = useTheme();
  const m = useLoopStage();
  const choices = item.choices ?? [];
  const { playing, play } = usePlayClip(item.audio.envelope); // reactive soundbar gate
  const replay = (): void => play(() => onPlay('native'));
  const recStarted = useRef(false);
  const startRec = (): void => {
    if (recStarted.current) return;
    recStarted.current = true;
    onRecordStart();
    m.beginRec();
  };

  return (
    <Screen>
      {m.stage === 'choose' ? (
        <>
          <CardBody>
            <Eyebrow>Review · say it</Eyebrow>
            <Text style={[styles.cue, { color: T.ink }]}>{item.gloss}</Text>
            <PromptText>Which word says it?</PromptText>
            <View style={styles.choices}>
              {choices.map((c) => (
                <ChoiceButton
                  key={c.value}
                  label={c.value}
                  state={c.value === m.wrongValue ? 'wrong' : 'idle'}
                  disabled={c.value === m.wrongValue}
                  onPress={() => { onAnswer(c.value, c.correct); m.pick(c.value, c.correct); }}
                />
              ))}
            </View>
            {m.wrongValue ? <TryAgainNote onRetry={m.retry} /> : null}
          </CardBody>
          <CardFooter>
            <FootNote>Recalling the word from its meaning is the strongest review.</FootNote>
          </CardFooter>
        </>
      ) : null}

      {m.stage === 'speak' || m.stage === 'rec' ? (
        <>
          <CardBody>
            <Text style={[styles.cueSmall, { color: T.sub }]}>{item.gloss}</Text>
            <WordHero size={52}>{item.target}</WordHero>
            {item.pron ? <GlossLine gloss={item.pron} size={13.5} /> : null}
            <View style={styles.wave}>
              <LiveWaveform envelope={item.audio.envelope} playing={playing} frameMs={FRAME_MS} height={36} count={32} />
            </View>
            <PlayOrb size={58} filled={false} playing={playing} onPress={replay} />
            <SpeedChip value={speed} onChange={onSpeedChange} />
            <View style={styles.mic}>
              <MicOrb rec={m.stage === 'rec'} onPress={() => { if (m.stage === 'rec') { onRecordStop(); m.finishRec(); } else { startRec(); } }} />
              <Caption>{m.stage === 'rec' ? 'Listening… tap to stop' : 'Now say it'}</Caption>
            </View>
          </CardBody>
          <CardFooter>
            <FootNote>Speaking it closes the loop.</FootNote>
          </CardFooter>
        </>
      ) : null}

      {m.stage === 'result' ? (
        <>
          <CardBody>
            <WordHero size={52}>{item.target}</WordHero>
            <GlossLine gloss={item.gloss} pron={item.pron} />
            <View style={styles.compare}>
              <CompareRow label="Native" icon="speaker" envelope={item.audio.envelope} onPress={() => onPlayCompare?.('native')} />
              <CompareRow label="You" icon="mic" onPress={() => onPlayCompare?.('you')} />
            </View>
            <PlayBackToBack onPress={() => onPlayCompare?.('native')} />
            <ResultNote>Sounded right — next review in 6 days.</ResultNote>
          </CardBody>
          <CardFooter>
            <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'word/say', correct: !m.missed, spoke: true })} />
          </CardFooter>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cue: { fontSize: 27, fontWeight: '500', letterSpacing: -0.3, textAlign: 'center' },
  cueSmall: { fontSize: 15, textAlign: 'center' },
  choices: { width: '100%', rowGap: 10, marginTop: 8 },
  wave: { width: '70%', marginTop: 4 },
  mic: { alignItems: 'center', rowGap: 12, marginTop: 8 },
  compare: { width: '100%', rowGap: 10, marginTop: 8 },
});
