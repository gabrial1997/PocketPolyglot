// word/learn-abstract — abstract-word first-exposure card with sound-alike mnemonic.
// In: item (target, gloss, pron, mnemonic { soundsLike, note }, examples?). Out: onComplete({ spoke:false }).
// Visual: matches mockup learn-abstract (word hero, gloss, mnemonic card, optional example, audio hero).
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, PlayOrb, CtaButton, SpeedChip } from '../components';
import { Eyebrow, WordTag, WordHero, GlossLine, Caption, FootNote, CardBody, CardFooter, HeadRow, MnemonicCard, ExampleRow, wordTagFor } from '../components/cardChrome';
import type { BaseCardProps } from './cardProps';

export function WordLearnAbstract({ item, onPlay, onComplete, speed, onSpeedChange }: BaseCardProps): React.JSX.Element {
  const [playing, setPlaying] = useState(false);
  const tag = wordTagFor(item.wordClass) ?? { label: 'Abstract word', tone: 'good' as const };
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
        {item.mnemonic ? <MnemonicCard soundsLike={item.mnemonic.soundsLike} note={item.mnemonic.note} /> : null}
        {(item.examples ?? []).map((ex, i) => (
          <ExampleRow key={i} pre={ex.pre} w={ex.w} post={ex.post} en={ex.en} onPress={() => onPlay(i)} />
        ))}
        <View style={styles.audio}>
          <PlayOrb size={58} playing={playing} onPress={play} />
          <SpeedChip value={speed} onChange={onSpeedChange} />
          <Caption>Tap to hear</Caption>
        </View>
      </CardBody>
      <CardFooter>
        <FootNote>First review tomorrow.</FootNote>
        <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'word/learn-abstract', spoke: false })} />
      </CardFooter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  audio: { alignItems: 'center', rowGap: 12, marginTop: 4 },
});
