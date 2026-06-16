// word/pic-review — THE core loop, picture-prompted (BACKEND_INTEGRATION §4, README 02.2).
// Stages: choose -> speak -> rec -> result. Picture+audio in -> pick word -> say it -> compare.
// Out: { correct, spoke:true, recording }. Owns only stage/picked (useLoopStage).
import React from 'react';
import { View } from 'react-native';
import { PlayOrb, MicOrb, ChoiceButton, CtaButton, Waveform, SpeedChip, TryAgainNote } from '../components';
import { CardShell } from './CardShell';
import { CardImage } from './CardImage';
import { useLoopStage } from './useLoopStage';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

type Props = RecordingCardProps & ChoiceCardProps;

export function WordPicReview(props: Props): React.JSX.Element {
  const { item, onPlay, onAnswer, onRecordStart, onRecordStop, onPlayCompare, onComplete } = props;
  // useLoopStage owns the choose-stage wrong-answer rule (no advance / redden chosen / never reveal /
  // remember the miss). The recorder owns the take, not us.
  const m = useLoopStage();
  const choices = item.choices ?? [];
  // Starting to speak always begins recording, whether the user taps the prompt or the mic orb.
  const startRec = () => {
    onRecordStart();
    m.beginRec();
  };

  return (
    <CardShell eyebrow="Picture review" target={m.stage === 'choose' ? undefined : item.target}>
      <CardImage media={item.media} word={item.target} />
      <PlayOrb onPress={() => onPlay('native')} />
      <SpeedChip value={props.speed} onChange={props.onSpeedChange} />

      {m.stage === 'choose' ? (
        <>
          {choices.map((c) => (
            <ChoiceButton
              key={c.value}
              label={c.value}
              gloss={c.gloss}
              // Only the chosen wrong option reddens; the correct one is NEVER highlighted.
              state={c.value === m.wrongValue ? 'wrong' : 'idle'}
              onPress={() => {
                onAnswer(c.value, c.correct);
                m.pick(c.value, c.correct);
              }}
            />
          ))}
          {m.wrongValue ? <TryAgainNote onRetry={m.retry} /> : null}
        </>
      ) : null}

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
          {/* Native model bars come from the seeded RMS envelope when present (soundbar.md,
              Option A); the user's own take has no envelope, so it stays seed-shaped. */}
          <Waveform seed={`${item.id}-native`} played={1} envelope={item.audio.envelope} />
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
                correct: !m.missed,
                spoke: true,
              })
            }
          />
        </View>
      ) : null}
    </CardShell>
  );
}
