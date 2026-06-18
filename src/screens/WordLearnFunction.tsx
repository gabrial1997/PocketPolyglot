// word/learn-function — grammatical-word first-exposure card: meaning via example sentences,
// each independently playable (onPlay(exampleIndex)). Out: onComplete({ spoke:false }).
// Visual: matches mockup learn-function (word hero, gloss, three playable example rows, audio hero).
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, PlayOrb, CtaButton, SpeedChip } from '../components';
import { Eyebrow, WordTag, WordHero, GlossLine, Caption, FootNote, CardBody, CardFooter, HeadRow, ExampleRow, wordTagFor } from '../components/cardChrome';
import type { BaseCardProps } from './cardProps';

export function WordLearnFunction({ item, onPlay, onComplete, speed, onSpeedChange }: BaseCardProps): React.JSX.Element {
  const [playing, setPlaying] = useState(false);
  const tag = wordTagFor(item.wordClass) ?? { label: 'Function word', tone: 'neutral' as const };
  const play = (): void => { setPlaying((p) => !p); onPlay('native'); };
  return (
    <Screen>
      <CardBody>
        <HeadRow>
          <Eyebrow>New word</Eyebrow>
          <WordTag label={tag.label} tone={tag.tone} />
        </HeadRow>
        <WordHero size={52}>{item.target}</WordHero>
        <GlossLine gloss={item.gloss} pron={item.pron} size={17} />
        <View style={styles.examples}>
          {(item.examples ?? []).map((ex, i) => (
            <ExampleRow key={i} pre={ex.pre} w={ex.w} post={ex.post} en={ex.en} onPress={() => onPlay(i)} />
          ))}
        </View>
        <View style={styles.audio}>
          <PlayOrb size={58} playing={playing} onPress={play} />
          <SpeedChip value={speed} onChange={onSpeedChange} />
          <Caption>Tap to hear</Caption>
        </View>
      </CardBody>
      <CardFooter>
        <FootNote>First review tomorrow.</FootNote>
        <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'word/learn-function', spoke: false })} />
      </CardFooter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  examples: { width: '100%', rowGap: 16, marginTop: 6 },
  audio: { alignItems: 'center', rowGap: 12, marginTop: 6 },
});
