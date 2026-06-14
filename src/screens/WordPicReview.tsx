// word/pic-review — THE core loop, picture-prompted (BACKEND_INTEGRATION §4, README 02.2).
// Stages: choose -> speak -> rec -> result. Picture+audio in -> pick word -> say it -> compare.
// Out: { correct, spoke:true, recording }. Owns only stage/picked (useLoopStage).
import React from 'react';
import { View } from 'react-native';
import { PlayOrb, MicOrb, ChoiceButton, CtaButton, Waveform, SpeedChip } from '../components';
import { CardShell } from './CardShell';
import { useLoopStage } from './useLoopStage';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

type Props = RecordingCardProps & ChoiceCardProps;

export function WordPicReview(props: Props): React.JSX.Element {
  const { item, onPlay, onAnswer, onRecordStart, onRecordStop, onPlayCompare, onComplete } = props;
  const m = useLoopStage();
  const choices = item.choices ?? [];

  return (
    <CardShell eyebrow="Picture review" target={m.stage === 'choose' ? undefined : item.target}>
      {/* image = T.dark ? item.media?.imageUrlDark : item.media?.imageUrl (wire when assets land) */}
      <PlayOrb onPress={() => onPlay('native')} />
      <SpeedChip value={props.speed} onChange={props.onSpeedChange} />

      {m.stage === 'choose'
        ? choices.map((c) => (
            <ChoiceButton
              key={c.value}
              label={c.value}
              gloss={c.gloss}
              onPress={() => {
                onAnswer(c.value, c.correct);
                if (c.correct) m.pick(c.value);
              }}
            />
          ))
        : null}

      {m.stage === 'speak' ? <CtaButton title="Now say it" onPress={m.beginRec} /> : null}

      {m.stage === 'rec' ? (
        <MicOrb
          rec
          onPress={() => {
            onRecordStop('stub://recording');
            m.finishRec();
          }}
        />
      ) : null}
      {m.stage === 'speak' ? <MicOrb onPress={() => { onRecordStart(); m.beginRec(); }} /> : null}

      {m.stage === 'result' ? (
        <View style={{ rowGap: 12 }}>
          <Waveform seed={`${item.id}-native`} played={1} />
          <Waveform seed={`${item.id}-you`} played={1} />
          <CtaButton title="Play back-to-back" variant="outline" onPress={() => onPlayCompare?.('native')} />
          <CtaButton
            title="Continue"
            onPress={() =>
              onComplete({ itemId: item.id, cardKind: 'word/pic-review', correct: true, spoke: true })
            }
          />
        </View>
      ) : null}
    </CardShell>
  );
}
