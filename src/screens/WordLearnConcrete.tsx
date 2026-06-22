// word/learn-concrete — picturable-noun first-exposure card (WIRING_MAP §1, BACKEND_INTEGRATION §4).
// In: item (target, gloss, pron, audio, media.imageUrl[/Dark]). Image swaps to imageUrlDark in dark.
// Out: onComplete({ spoke:false }) — exposure only; backend schedules first review.
// Visual: matches mockup learn-concrete (full-width house image, word hero, audio hero).
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, PlayOrb, CtaButton, SpeedChip, LiveWaveform, usePlayClip, FRAME_MS, type Speed } from '../components';
import { Eyebrow, WordTag, WordHero, GlossLine, Caption, FootNote, CardBody, CardFooter, HeadRow, LiteralNote, wordTagFor } from '../components/cardChrome';
import { CardImage } from './CardImage';
import type { BaseCardProps } from './cardProps';

export function WordLearnConcrete({ item, onPlay, onStop, onPreload, onComplete, speed: speedProp, onSpeedChange }: BaseCardProps): React.JSX.Element {
  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip drives it.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(item.audio.envelope); // reactive soundbar gate
  const tag = wordTagFor(item.wordClass);
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
        <LiteralNote literal={item.literal} usageNote={item.usageNote} />
        <View style={styles.audio}>
          <View style={styles.wave}>
            <LiveWaveform envelope={item.audio.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={44} count={36} />
          </View>
          <PlayOrb size={66} playing={playing} onPress={replay} />
          <SpeedChip value={speed} onChange={changeSpeed} />
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
