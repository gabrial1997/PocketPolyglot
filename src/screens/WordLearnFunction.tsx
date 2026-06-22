// word/learn-function — grammatical-word first-exposure card: meaning via example sentences,
// each independently playable (onPlay(exampleIndex)). Out: onComplete({ spoke:false }).
// Visual: matches mockup learn-function (word hero, gloss, three playable example rows, audio hero).
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, PlayOrb, CtaButton, SpeedChip, LiveWaveform, usePlayClip, FRAME_MS, type Speed } from '../components';
import { Eyebrow, WordTag, WordHero, GlossLine, Caption, FootNote, CardBody, CardFooter, HeadRow, ExampleRow, LiteralNote, wordTagFor } from '../components/cardChrome';
import type { BaseCardProps } from './cardProps';

export function WordLearnFunction({ item, onPlay, onStop, onComplete, speed: speedProp, onSpeedChange }: BaseCardProps): React.JSX.Element {
  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip drives it.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(item.audio.envelope); // reactive soundbar gate
  const tag = wordTagFor(item.wordClass) ?? { label: 'Function word', tone: 'neutral' as const };
  // The orb is a play/pause toggle (bug 3): tapping mid-clip stops the voice; tapping at rest replays.
  const replay = (): void => {
    if (playing) { onStop?.(); stopGate(); }
    else play(() => onPlay('native', speed), speed);
  };
  return (
    <Screen>
      <CardBody>
        <HeadRow>
          <Eyebrow>New word</Eyebrow>
          <WordTag label={tag.label} tone={tag.tone} />
        </HeadRow>
        <WordHero size={52}>{item.target}</WordHero>
        <GlossLine gloss={item.gloss} pron={item.pron} size={17} />
        <LiteralNote literal={item.literal} usageNote={item.usageNote} />
        <View style={styles.examples}>
          {(item.examples ?? []).map((ex, i) => (
            <ExampleRow key={i} pre={ex.pre} w={ex.w} post={ex.post} en={ex.en} onPress={() => onPlay(i)} />
          ))}
        </View>
        <View style={styles.audio}>
          <View style={styles.wave}>
            <LiveWaveform envelope={item.audio.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={36} count={32} />
          </View>
          <PlayOrb size={58} playing={playing} onPress={replay} />
          <SpeedChip value={speed} onChange={changeSpeed} />
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
  wave: { width: 220 },
});
