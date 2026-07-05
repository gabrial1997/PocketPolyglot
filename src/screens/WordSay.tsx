// word/say — production review, inverse (BACKEND_INTEGRATION §4). The GLOSS is the cue; choices are
// WORDS. Stages choose -> speak -> rec -> result. Out: { correct, spoke:true, recording }.
// LOCKED wrong-answer rule lives in useLoopStage (no advance / redden chosen / never reveal / remember).
// Visual: matches mockup word/say (gloss cue + word list -> say it -> native/you compare).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, PlayOrb, MicOrb, ChoiceButton, CtaButton, SpeedChip, TryAgainNote, LiveWaveform, usePlayClip, FRAME_MS, StageFade, type Speed } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { Eyebrow, WordHero, GlossLine, Caption, FootNote, PromptText, CardBody, CardFooter, CompareRow, PlayBackToBack, ResultNote, loopResultNote } from '../components/cardChrome';
import { useLoopStage } from './useLoopStage';
import { shouldShowGloss } from './glossVisibility';
import type { RecordingCardProps, ChoiceCardProps } from './cardProps';

type Props = RecordingCardProps & ChoiceCardProps;

export function WordSay(props: Props): React.JSX.Element {
  const { item, onPlay, onStop, onPreload, onAnswer, onRecordStart, onRecordStop, onPlayCompare, onComplete, speed: speedProp, onSpeedChange, recConsent = true } = props;
  // GDPR record gate: when false, hide the record affordance and skip the rec stage.
  const T = useTheme();
  const m = useLoopStage();
  const choices = item.choices ?? [];
  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip drives it.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  // translationVisibility gating (Module C5): ephemeral reveal state lives here.
  const [tappedReveal, setTappedReveal] = useState(false);
  const mode = item.translationVisibility ?? 'auto';
  // showGlossCue: whether the English gloss cue on the choose stage is visible.
  // auto = always; hint = after a miss (m.missed); on-demand = after explicit tap.
  const showGlossCue = shouldShowGloss(mode, m.missed, tappedReveal);
  const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(item.audio?.envelope); // reactive soundbar gate
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
            <Eyebrow>Review · say it</Eyebrow>
            {showGlossCue ? (
              <Text style={[styles.cue, { color: T.ink }]}>{item.gloss}</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setTappedReveal(true)}
                style={[styles.revealBtn, { borderColor: T.hair }]}
              >
                <Text style={[styles.revealText, { color: T.sub }]}>Show meaning</Text>
              </Pressable>
            )}
            <PromptText>Which word says it?</PromptText>
            <View style={styles.choices}>
              {choices.map((c) => (
                <ChoiceButton
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
            <FootNote>Recalling the word from its meaning is the strongest review.</FootNote>
          </CardFooter>
        </>
      ) : null}

      {m.stage === 'speak' || m.stage === 'rec' ? (
        <>
          <CardBody>
            <Text style={[styles.cueSmall, { color: T.sub }]}>{item.gloss}</Text>
            <WordHero size={52}>{item.target}</WordHero>
            {item.pron ? <GlossLine gloss={item.pron} size={13.5} /> : null}
            <View style={styles.wave}>
              <LiveWaveform envelope={item.audio?.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={36} count={32} />
            </View>
            <PlayOrb size={58} filled={false} playing={playing} onPress={replay} />
            <SpeedChip value={speed} onChange={changeSpeed} />
            {recConsent ? (
              <View style={styles.mic}>
                <MicOrb rec={m.stage === 'rec'} onPress={() => { if (m.stage === 'rec') { onRecordStop(); m.finishRec(); } else { startRec(); } }} />
                <Caption>{m.stage === 'rec' ? 'Listening… tap to stop' : 'Now say it'}</Caption>
              </View>
            ) : (
              <View style={styles.mic}>
                <Caption>Recording is off — turn it on in Settings to hear yourself.</Caption>
              </View>
            )}
          </CardBody>
          <CardFooter>
            {recConsent ? (
              <FootNote>Speaking it closes the loop.</FootNote>
            ) : (
              <CtaButton title="Continue" onPress={() => { m.finishRec(); }} />
            )}
          </CardFooter>
        </>
      ) : null}

      {m.stage === 'result' ? (
        <>
          <CardBody>
            <WordHero size={52}>{item.target}</WordHero>
            <GlossLine gloss={item.gloss} pron={item.pron} />
            <View style={styles.compare}>
              <CompareRow label="Native" icon="speaker" envelope={item.audio?.envelope} onPress={() => onPlayCompare?.('native')} />
              {/* No recording can exist without consent — never offer a "You" playback that is silent. */}
              {recConsent ? <CompareRow label="You" icon="mic" onPress={() => onPlayCompare?.('you')} /> : null}
            </View>
            {recConsent ? <PlayBackToBack onPress={() => onPlayCompare?.('native')} /> : null}
            <ResultNote>{loopResultNote(m.missed, item.reviewPreview)}</ResultNote>
          </CardBody>
          <CardFooter>
            <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'word/say', correct: !m.missed, spoke: true })} />
          </CardFooter>
        </>
      ) : null}
      </StageFade>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cue: { fontSize: 27, fontWeight: '500', letterSpacing: -0.3, textAlign: 'center' },
  cueSmall: { fontSize: 15, textAlign: 'center' },
  choices: { width: '100%', rowGap: 10, marginTop: 8 },
  wave: { width: '70%', marginTop: 4 },
  mic: { alignItems: 'center', rowGap: 12, marginTop: 8 },
  compare: { width: '100%', rowGap: 10, marginTop: 8 },
  revealBtn: { paddingVertical: 11, paddingHorizontal: 28, borderRadius: 99, borderWidth: 1.5, alignSelf: 'center' },
  revealText: { fontSize: 14, fontWeight: '600' },
});
