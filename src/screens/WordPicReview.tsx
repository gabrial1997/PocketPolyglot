// word/pic-review — THE core loop, picture-prompted (BACKEND_INTEGRATION §4, README 02.2).
// Stages: choose -> speak -> rec -> result. Picture+audio in -> pick word -> say it -> compare.
// Out: { correct, spoke:true, recording }. Owns only stage/picked (useLoopStage).
import React, { useState } from 'react';
import { View } from 'react-native';
import { PlayOrb, MicOrb, ChoiceButton, CtaButton, Waveform, SpeedChip } from '../components';
import { CardShell } from './CardShell';
import { useLoopStage } from './useLoopStage';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

type Props = RecordingCardProps & ChoiceCardProps;

export function WordPicReview(props: Props): React.JSX.Element {
  const { item, onPlay, onAnswer, onRecordStart, onRecordStop, onPlayCompare, onComplete } = props;
  const m = useLoopStage();
  // Ephemeral UI state only: whether the first answer was wrong, so the result reports honest
  // first-try correctness (the SRS interval depends on it). The recorder owns the take, not us.
  const [missed, setMissed] = useState(false);
  const choices = item.choices ?? [];
  // Starting to speak always begins recording, whether the user taps the prompt or the mic orb.
  const startRec = () => {
    onRecordStart();
    m.beginRec();
  };

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
              state={m.stage === 'choose' && !c.correct && missed ? 'wrong' : 'idle'}
              onPress={() => {
                onAnswer(c.value, c.correct);
                if (c.correct) m.pick(c.value);
                else setMissed(true); // wrong: stay on choose, remember the miss
              }}
            />
          ))
        : null}

      {m.stage === 'speak' ? <CtaButton title="Now say it" onPress={startRec} /> : null}

      {m.stage === 'rec' ? (
        <MicOrb
          rec
          onPress={() => {
            onRecordStop(); // signal stop; the injected RecorderService produces the take
            m.finishRec();
          }}
        />
      ) : null}
      {m.stage === 'speak' ? <MicOrb onPress={startRec} /> : null}

      {m.stage === 'result' ? (
        <View style={{ rowGap: 12 }}>
          <Waveform seed={`${item.id}-native`} played={1} />
          <Waveform seed={`${item.id}-you`} played={1} />
          {/* A/B self-compare (a locked product pillar): replay the native model and your take. */}
          <CtaButton title="Play original" variant="outline" onPress={() => onPlayCompare?.('native')} />
          <CtaButton title="Play yours" variant="outline" onPress={() => onPlayCompare?.('you')} />
          <CtaButton
            title="Continue"
            onPress={() =>
              onComplete({
                itemId: item.id,
                cardKind: 'word/pic-review',
                correct: !missed,
                spoke: true,
              })
            }
          />
        </View>
      ) : null}
    </CardShell>
  );
}
