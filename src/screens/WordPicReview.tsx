// word/pic-review — THE core loop, picture-prompted (BACKEND_INTEGRATION §4, README 02.2).
// Stages: choose -> speak -> rec -> result. Picture+audio in -> pick word -> say it -> compare.
// Out: { correct, spoke:true, recording }. LOCKED wrong-answer rule lives in useLoopStage.
// Visual: matches mockup pic-review (full image + 2×2 word grid -> word hero + mic -> compare).
import React, { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, PlayOrb, MicOrb, CtaButton, SpeedChip } from '../components';
import { Eyebrow, WordHero, GlossLine, Caption, FootNote, PromptText, CardBody, CardFooter, GridChoiceButton, CompareRow, PlayBackToBack, ResultNote } from '../components/cardChrome';
import { TryAgainNote } from '../components';
import { CardImage } from './CardImage';
import { useLoopStage } from './useLoopStage';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

type Props = RecordingCardProps & ChoiceCardProps;

export function WordPicReview(props: Props): React.JSX.Element {
  const { item, onPlay, onAnswer, onRecordStart, onRecordStop, onPlayCompare, onComplete, speed, onSpeedChange } = props;
  const m = useLoopStage();
  const choices = item.choices ?? [];
  const [playing, setPlaying] = useState(false);
  const [playWho, setPlayWho] = useState<'native' | 'you' | null>(null);
  const recStarted = useRef(false);
  const startRec = (): void => {
    if (recStarted.current) return;
    recStarted.current = true;
    onRecordStart();
    m.beginRec();
  };
  const compare = (who: 'native' | 'you'): void => { setPlayWho(who); onPlayCompare?.(who); };

  return (
    <Screen>
      {m.stage === 'choose' ? (
        <>
          <CardBody>
            <Eyebrow>Review · picture</Eyebrow>
            <CardImage media={item.media} word={item.target} full height={168} />
            <View style={styles.playRow}>
              <PlayOrb size={44} filled={false} playing={playing} onPress={() => { setPlaying((p) => !p); onPlay('native'); }} />
              <SpeedChip value={speed} onChange={onSpeedChange} />
            </View>
            <PromptText>Which word names it?</PromptText>
            <View style={styles.grid}>
              {choices.map((c) => (
                <GridChoiceButton
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
            <PlayOrb size={52} filled={false} playing={playing} onPress={() => { setPlaying((p) => !p); onPlay('native'); }} />
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
            <CardImage media={item.media} word={item.target} size={104} />
            <WordHero size={48}>{item.target}</WordHero>
            <GlossLine gloss={item.gloss} pron={item.pron} />
            <View style={styles.compare}>
              <CompareRow label="Native" icon="speaker" seed={`${item.id}-native`} envelope={item.audio.envelope} active={playWho === 'native'} onPress={() => compare('native')} />
              <CompareRow label="You" icon="mic" seed={`${item.id}-you`} active={playWho === 'you'} onPress={() => compare('you')} />
            </View>
            <PlayBackToBack onPress={() => { setPlayWho('native'); onPlayCompare?.('native'); }} />
            <ResultNote>Sounded right — next review in 5 days.</ResultNote>
          </CardBody>
          <CardFooter>
            <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'word/pic-review', correct: !m.missed, spoke: true })} />
          </CardFooter>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  playRow: { flexDirection: 'row', alignItems: 'center', columnGap: 10, marginTop: 4 },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 10, marginTop: 6 },
  mic: { alignItems: 'center', rowGap: 12, marginTop: 8 },
  compare: { width: '100%', rowGap: 10, marginTop: 8 },
});
