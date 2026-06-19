// phrase/hear — first exposure (BACKEND_INTEGRATION §4). Input first: hear the phrase, with the
// meaning demoted behind a tap. The live soundbar (LiveWaveform) moves with the real voice while
// the clip plays. Out: { spoke:false }.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-phrase.jsx `PhraseHear`). Eyebrow
// "NEW PHRASE"; PhraseLine with the just-learned word in primary + underlined; the "dzert, here as
// 'dzeru'" hint; audio hero (soundbar + PlayOrb 78 + SpeedChip); "Show meaning" toggle; footer
// "First review tomorrow." + Continue. Soundbar gate timing preserved from the prior card.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, PlayOrb, SpeedChip, LiveWaveform, CtaButton } from '../components';
import { CardIcon, Eyebrow, PhraseLine } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import type { BaseCardProps } from './cardProps';
import type { ReviewItem } from '../types/reviewItem';

const FRAME_MS = 30; // must match content-pipeline/tts.mjs envelope frame size
const TAIL_MS = 200;
const FALLBACK_MS = 1600;
export const REPEAT_DELAY_MS = 700; // gap after the first clip finishes before the repeat

type HearExtra = { newForm?: string; newLemma?: string };

export function PhraseHear({ item, onPlay, onComplete, speed, onSpeedChange }: BaseCardProps): React.JSX.Element {
  const T = useTheme();
  const x = item as ReviewItem & HearExtra;
  const env = item.audio.envelope;
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // STOPGAP (unchanged): the card can't observe playback end through the service boundary yet, so
  // we run the soundbar for the clip's known length. Amplitudes are real; only the stop gate is
  // approximated. Deeper fix deferred (surface playback position via AudioService — see soundbar.md).
  const playClip = (): void => {
    onPlay('native');
    if (timer.current) clearTimeout(timer.current);
    setPlaying(true);
    const ms = env && env.length ? env.length * FRAME_MS + TAIL_MS : FALLBACK_MS;
    timer.current = setTimeout(() => setPlaying(false), ms);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // First exposure SAYS the phrase, then REPEATS it once (BACKEND_INTEGRATION §4 / 2026-06-19 spec).
  // The repeat waits out the first clip's length (+ a short gap) so it doesn't overlap playback.
  // Runs once on mount — GlideViewport remounts the card per item, so each new phrase replays.
  useEffect(() => {
    playClip(); // say it
    const ms = (env && env.length ? env.length * FRAME_MS + TAIL_MS : FALLBACK_MS) + REPEAT_DELAY_MS;
    const t = setTimeout(() => playClip(), ms); // repeat it once
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <View style={styles.body}>
        <Eyebrow>New phrase</Eyebrow>

        <View style={{ marginTop: 22 }}>
          <PhraseLine phrase={item.target} highlight={x.newForm} size={34} />
        </View>

        {x.newLemma || x.newForm ? (
          <Text style={[styles.hint, { color: T.faint }]}>
            <Text style={{ fontFamily: fonts.headline, fontWeight: '600', color: T.primary }}>{x.newLemma ?? x.newForm}</Text>
            {x.newForm ? `, here as “${x.newForm}”` : ''}
          </Text>
        ) : null}

        {/* audio hero */}
        <View style={styles.audio}>
          <View style={styles.wave}>
            <LiveWaveform envelope={env} playing={playing} frameMs={FRAME_MS} height={58} count={44} />
          </View>
          <PlayOrb size={78} playing={playing} onPress={playClip} />
          <SpeedChip value={speed} onChange={onSpeedChange} />
        </View>

        {/* meaning — demoted behind a tap */}
        <View style={styles.meaning}>
          {shown ? (
            <Text style={[styles.meaningText, { color: T.sub }]}>{item.gloss}</Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setShown(true)} style={[styles.showBtn, { borderColor: T.hair }]}>
              <CardIcon name="text" size={16} color={T.sub} />
              <Text style={[styles.showText, { color: T.sub }]}>Show meaning</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.review, { color: T.faint }]}>
          First review <Text style={{ color: T.sub, fontWeight: '600' }}>tomorrow</Text>.
        </Text>
        <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'phrase/hear', spoke: false })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 8 },
  hint: { fontSize: 13, marginTop: 12 },
  audio: { width: '100%', marginTop: 32, alignItems: 'center', rowGap: 20 },
  wave: { width: '78%' },
  meaning: { height: 70, marginTop: 24, alignItems: 'center', justifyContent: 'flex-start' },
  meaningText: { fontSize: 19, fontWeight: '500' },
  showBtn: { flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 99, borderWidth: 1.5 },
  showText: { fontSize: 14, fontWeight: '600' },
  footer: { paddingBottom: 30, rowGap: 11 },
  review: { fontSize: 13.5, fontWeight: '500', textAlign: 'center' },
});
