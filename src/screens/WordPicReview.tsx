// word/pic-review — THE core loop, picture-prompted (BACKEND_INTEGRATION §4, README 02.2).
// Stages: choose -> speak -> rec -> result. Picture+audio in -> pick word -> say it -> compare.
// Out: { correct, spoke:true, recording }. LOCKED wrong-answer rule lives in useLoopStage.
// Visual: matches mockup pic-review (full image + 2×2 word grid -> word hero + mic -> compare).
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, PlayOrb, MicOrb, CtaButton, SpeedChip, LiveWaveform, usePlayClip, FRAME_MS, StageFade, type Speed } from '../components';
import { Eyebrow, WordHero, GlossLine, Caption, FootNote, PromptText, CardBody, CardFooter, GridChoiceButton, CompareRow, PlayBackToBack, ResultNote, loopResultNote } from '../components/cardChrome';
import { TryAgainNote } from '../components';
import { CardImage } from './CardImage';
import { useLoopStage } from './useLoopStage';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

type Props = RecordingCardProps & ChoiceCardProps;

export function WordPicReview(props: Props): React.JSX.Element {
  const { item, onPlay, onStop, onPreload, onAnswer, onRecordStart, onRecordStop, onPlayCompare, onComplete, speed: speedProp, onSpeedChange } = props;
  const m = useLoopStage();
  const choices = item.choices ?? [];
  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip drives it.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(item.audio.envelope); // reactive soundbar gate
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
  const recStarted = useRef(false);
  const startRec = (): void => {
    if (recStarted.current) return;
    recStarted.current = true;
    onRecordStart();
    m.beginRec();
  };

  return (
    <Screen>
      <StageFade stageKey={m.stage}>
      {m.stage === 'choose' ? (
        <>
          <CardBody>
            <Eyebrow>Review · picture</Eyebrow>
            <CardImage media={item.media} word={item.target} full height={168} />
            <View style={styles.playRow}>
              <PlayOrb size={44} filled={false} playing={playing} onPress={replay} />
              <View style={{ flex: 1 }}>
                <LiveWaveform envelope={item.audio.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={28} count={28} />
              </View>
              <SpeedChip value={speed} onChange={changeSpeed} />
            </View>
            <PromptText>Which word names it?</PromptText>
            <View style={styles.grid}>
              {choices.map((c) => (
                <GridChoiceButton
                  key={c.value}
                  label={c.value}
                  state={c.value === m.rightValue ? 'correct' : c.value === m.wrongValue ? 'wrong' : 'idle'}
                  disabled={c.value === m.wrongValue || m.rightValue !== null}
                  onPress={() => { onAnswer(c.value, c.correct); m.pick(c.value, c.correct); }}
                />
              ))}
            </View>
            {m.wrongValue ? <TryAgainNote onRetry={m.retry} /> : null}
          </CardBody>
          <CardFooter>
            <FootNote>Name the picture, then say it — that’s the full loop.</FootNote>
          </CardFooter>
        </>
      ) : null}

      {m.stage === 'speak' || m.stage === 'rec' ? (
        <>
          <CardBody>
            <CardImage media={item.media} word={item.target} size={116} />
            <WordHero size={50}>{item.target}</WordHero>
            <GlossLine gloss={item.gloss} pron={item.pron} size={13.5} />
            <View style={styles.wave}>
              <LiveWaveform envelope={item.audio.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={34} count={30} />
            </View>
            <PlayOrb size={52} filled={false} playing={playing} onPress={replay} />
            <SpeedChip value={speed} onChange={changeSpeed} />
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
            <CardImage media={item.media} word={item.target} size={104} />
            <WordHero size={48}>{item.target}</WordHero>
            <GlossLine gloss={item.gloss} pron={item.pron} />
            <View style={styles.compare}>
              <CompareRow label="Native" icon="speaker" envelope={item.audio.envelope} onPress={() => onPlayCompare?.('native')} />
              <CompareRow label="You" icon="mic" onPress={() => onPlayCompare?.('you')} />
            </View>
            <PlayBackToBack onPress={() => onPlayCompare?.('native')} />
            <ResultNote>{loopResultNote(m.missed, item.reviewPreview)}</ResultNote>
          </CardBody>
          <CardFooter>
            <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'word/pic-review', correct: !m.missed, spoke: true })} />
          </CardFooter>
        </>
      ) : null}
      </StageFade>
    </Screen>
  );
}

const styles = StyleSheet.create({
  playRow: { width: '100%', flexDirection: 'row', alignItems: 'center', columnGap: 10, marginTop: 4 },
  wave: { width: '64%', marginTop: 2 },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 10, marginTop: 6 },
  mic: { alignItems: 'center', rowGap: 12, marginTop: 8 },
  compare: { width: '100%', rowGap: 10, marginTop: 8 },
});
