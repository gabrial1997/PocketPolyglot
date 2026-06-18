// word/learn-concrete — picturable-noun first-exposure card (WIRING_MAP §1, BACKEND_INTEGRATION §4).
// In: item (target, gloss, pron, audio, media.imageUrl[/Dark]). Image swaps to imageUrlDark in dark.
// Out: onComplete({ spoke:false }) — exposure only; backend schedules first review.
// Visual: matches mockup learn-concrete (full-width house image, word hero, audio hero).
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, PlayOrb, CtaButton, SpeedChip, Waveform } from '../components';
import { Eyebrow, WordTag, WordHero, GlossLine, Caption, FootNote, CardBody, CardFooter, HeadRow, wordTagFor } from '../components/cardChrome';
import { CardImage } from './CardImage';
import type { BaseCardProps } from './cardProps';

export function WordLearnConcrete({ item, onPlay, onComplete, speed, onSpeedChange }: BaseCardProps): React.JSX.Element {
  const [playing, setPlaying] = useState(false);
  const tag = wordTagFor(item.wordClass);
  const play = (): void => { setPlaying((p) => !p); onPlay('native'); };
  return (
    <Screen>
      <CardBody>
        <HeadRow>
          <Eyebrow>New word</Eyebrow>
          {tag ? <WordTag label={tag.label} tone={tag.tone} /> : null}
        </HeadRow>
        <CardImage media={item.media} word={item.target} full height={180} />
        <WordHero size={52}>{item.target}</WordHero>
        <GlossLine gloss={item.gloss} pron={item.pron} size={17} />
        <View style={styles.audio}>
          <View style={styles.wave}>
            <Waveform seed={item.id} played={playing ? 0.66 : 0} height={44} count={36} envelope={item.audio.envelope} />
          </View>
          <PlayOrb size={66} playing={playing} onPress={play} />
          <SpeedChip value={speed} onChange={onSpeedChange} />
          <Caption>Tap to hear</Caption>
        </View>
      </CardBody>
      <CardFooter>
        <FootNote>First review tomorrow.</FootNote>
        <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'word/learn-concrete', spoke: false })} />
      </CardFooter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  audio: { alignItems: 'center', rowGap: 12, marginTop: 4 },
  wave: { width: 240 },
});
