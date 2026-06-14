// word/say — production review, inverse (BACKEND_INTEGRATION §4). The GLOSS is the cue; choices
// are WORDS. Stages choose -> speak -> rec -> result. Out: { correct, spoke:true, recording }.
import React from 'react';
import { View } from 'react-native';
import { MicOrb, ChoiceButton, CtaButton, Waveform } from '../components';
import { CardShell } from './CardShell';
import { useLoopStage } from './useLoopStage';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

type Props = RecordingCardProps & ChoiceCardProps;

export function WordSay(props: Props): React.JSX.Element {
  const { item, onAnswer, onRecordStart, onRecordStop, onPlayCompare, onComplete } = props;
  const m = useLoopStage();

  return (
    <CardShell eyebrow="Say it" gloss={item.gloss}>
      {m.stage === 'choose'
        ? (item.choices ?? []).map((c) => (
            <ChoiceButton
              key={c.value}
              label={c.value}
              onPress={() => {
                onAnswer(c.value, c.correct);
                if (c.correct) m.pick(c.value);
              }}
            />
          ))
        : null}

      {m.stage === 'speak' ? (
        <MicOrb onPress={() => { onRecordStart(); m.beginRec(); }} />
      ) : null}
      {m.stage === 'rec' ? (
        <MicOrb rec onPress={() => { onRecordStop('stub://recording'); m.finishRec(); }} />
      ) : null}

      {m.stage === 'result' ? (
        <View style={{ rowGap: 12 }}>
          <Waveform seed={`${item.id}-native`} played={1} />
          <Waveform seed={`${item.id}-you`} played={1} />
          <CtaButton title="Play back-to-back" variant="outline" onPress={() => onPlayCompare?.('native')} />
          <CtaButton
            title="Continue"
            onPress={() =>
              onComplete({ itemId: item.id, cardKind: 'word/say', correct: true, spoke: true })
            }
          />
        </View>
      ) : null}
    </CardShell>
  );
}
