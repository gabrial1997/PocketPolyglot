/* eslint-disable react/prop-types */
// drill — consonant minimal-pair perception drill, L vs Ļ (ports kit screens-drill.jsx `DrillScreen`).
// Loop: HEAR the clip -> DISCRIMINATE which glyph it was -> SAY IT BACK. The palatalization contrast
// is one English ears miss. Pure card: data-in (item) / events-out (callbacks); only ephemeral state.
//
// LOCKED wrong-answer rule (CLAUDE.md): a wrong pick does NOT advance — only the chosen wrong glyph
// reddens, the correct glyph is NEVER revealed (its word stays hidden, no green badge), the miss is
// remembered (`missed`). A correct pick reveals that glyph's word + a green badge, then unlocks
// "Say it back".
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup. Centered "SOUND CHECK · CONSONANT" + serif prompt;
// audio hero (waveform + PlayOrb 72 + SpeedChip); two big glyph cards (radius 24); the green/carmine
// feedback line; the say-it-back stage (hero word + outline PlayOrb 54 + MicOrb -> ResultNote); and
// the staged bottom CTA (Play again / Try again / Say it back / Next pair).
//
// Per-side copy (hints) are optional/additive on ReviewPair (front-end-sync handoff PATCH): aHint,
// bHint. They degrade gracefully — absent, the idle card just shows its glyph.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, PlayOrb, MicOrb, LiveWaveform, usePlayClip, FRAME_MS, SpeedChip } from '../components';
import { CardIcon, ResultNote } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, fonts } from '../theme/tokens';
import type { RecordingCardProps } from './cardProps';
import type { ReviewPair } from '../types/reviewItem';

type Side = 'a' | 'b';
type Say = null | 'idle' | 'rec' | 'done';
type PairHints = ReviewPair & { aHint?: string; bHint?: string };

export function DrillScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onRecordStart, onRecordStop, onComplete, speed, onSpeedChange } = props;
  const T = useTheme();
  const pair = item.pair as PairHints | undefined;

  const [picked, setPicked] = useState<Side | null>(null);
  const { playing, play, stop } = usePlayClip(item.audio.envelope); // reactive soundbar gate
  const [say, setSay] = useState<Say>(null);
  // `missed` is sticky across a Try-again reset so the first-try miss is remembered for honest SRS
  // correctness (locked rule + this card's header comment). `right` is the current selection state.
  const [missed, setMissed] = useState(false);
  const right = picked !== null && pair != null && picked === pair.correct;

  if (!pair) return <Screen><View style={styles.body} /></Screen>;
  const correctGlyph = pair.correct === 'a' ? pair.a : pair.b;

  const choose = (side: Side): void => {
    if (picked === null) {
      setPicked(side);
      if (pair != null && side !== pair.correct) setMissed(true);
    }
  };

  const GlyphCard = ({ side, glyph, hint }: { side: Side; glyph: string; hint?: string }): React.JSX.Element => {
    const isPicked = picked === side;
    const isCorrect = side === pair.correct;
    let bg = T.surface, bd = T.hair, fg = T.ink, accent = false;
    if (picked !== null) {
      if (right && isCorrect) { bg = T.goodSoft; bd = hexA(T.good, 0.5); fg = T.good; accent = true; }
      else if (isPicked) { bg = hexA(T.record, T.dark ? 0.12 : 0.07); bd = hexA(T.record, 0.45); fg = T.record; }
    }
    return (
      <Pressable accessibilityRole="button" disabled={picked !== null} onPress={() => choose(side)} style={[styles.glyphCard, { backgroundColor: bg, borderColor: bd }, picked === null ? T.shadow : null]}>
        {accent ? (
          <View style={[styles.badge, { backgroundColor: T.good }]}><CardIcon name="check" size={16} color="#fff" sw={2.4} /></View>
        ) : null}
        {/* The "glyph" is the whole pair word (e.g. lācis/ļoti), not a single letter — long words
            overflow the half-width card at 64px and clip. Shrink-to-fit on one line keeps them whole. */}
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.glyph, { color: accent ? T.good : fg, fontFamily: fonts.headline }]}>{glyph}</Text>
        {accent ? (
          <>
            <Text style={[styles.cardWord, { color: T.ink, fontFamily: fonts.headline }]}>{item.target}</Text>
            <Text style={[styles.cardGloss, { color: T.sub }]}>{item.gloss}</Text>
          </>
        ) : hint ? (
          <Text style={[styles.cardHint, { color: T.faint }]}>{hint}</Text>
        ) : null}
      </Pressable>
    );
  };

  // ── SAY IT BACK ──
  if (say !== null) {
    return (
      <Screen>
        <View style={styles.body}>
          <View style={styles.headBlock}>
            <Text style={[styles.eyebrow, { color: T.faint }]}>SOUND CHECK · CONSONANT</Text>
            <Text style={[styles.prompt, { color: T.ink, fontFamily: fonts.headline }]}>Say it back</Text>
          </View>
          <Text style={[styles.sayHero, { color: T.ink, fontFamily: fonts.headline }]}>{item.target}</Text>
          <Text style={[styles.sayPron, { color: T.sub }]}>
            {item.gloss}{item.pron ? <Text style={{ color: T.faint }}> · {item.pron}</Text> : null}
          </Text>
          <View style={styles.sayControls}>
            <PlayOrb size={54} filled={false} playing={playing} onPress={() => play(() => onPlay('native'))} />
            <SpeedChip value={speed} onChange={onSpeedChange} />
          </View>
          <View style={styles.sayMic}>
            {say === 'done' ? (
              // No production grade in Phase 0 — acknowledge finishing the loop and reinforce the
              // target sound, without claiming the recording "sounded right" (that needs GOP scoring).
              <ResultNote>Nice work — keep that <Text style={{ fontWeight: '700', color: T.ink }}>{correctGlyph}</Text> soft.</ResultNote>
            ) : (
              <>
                <MicOrb size={72} rec={say === 'rec'} onPress={() => { if (say === 'rec') { onRecordStop(); setSay('done'); } else { onRecordStart(); setSay('rec'); } }} />
                <Text style={[styles.micHint, { color: say === 'rec' ? T.record : T.faint, fontWeight: say === 'rec' ? '600' : '400' }]}>
                  {say === 'rec' ? 'Listening… tap to stop' : 'Now say it'}
                </Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.footer}>
          {say === 'done' ? (
            <Pressable accessibilityRole="button" onPress={() => onComplete({ itemId: item.id, cardKind: 'drill', correct: !missed, spoke: true })} style={[styles.cta, { backgroundColor: T.primary }]}>
              <Text style={[styles.ctaText, { color: T.onPrimary }]}>Next pair</Text>
              <CardIcon name="chevR" size={17} color={T.onPrimary} />
            </Pressable>
          ) : (
            <Text style={[styles.footNote, { color: T.faint }]}>Saying it locks the sound in.</Text>
          )}
        </View>
      </Screen>
    );
  }

  // ── HEAR + DISCRIMINATE ──
  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.headBlock}>
          <Text style={[styles.eyebrow, { color: T.faint }]}>SOUND CHECK · CONSONANT</Text>
          <Text style={[styles.prompt, { color: T.ink, fontFamily: fonts.headline }]}>Which did you hear?</Text>
        </View>

        <View style={styles.audio}>
          <View style={styles.wave}>
            <LiveWaveform envelope={item.audio.envelope} playing={playing} frameMs={FRAME_MS} height={52} count={34} />
          </View>
          <PlayOrb size={72} playing={playing} onPress={() => play(() => onPlay('native'))} />
          <SpeedChip value={speed} onChange={onSpeedChange} />
        </View>

        <View style={styles.cards}>
          <GlyphCard side="a" glyph={pair.a} hint={pair.aHint} />
          <GlyphCard side="b" glyph={pair.b} hint={pair.bHint} />
        </View>

        <View style={styles.feedbackWrap}>
          {picked !== null ? (
            <Text style={[styles.feedback, { color: right ? T.good : T.record }]}>
              {right
                ? <>Right — that’s the soft <Text style={{ fontWeight: '700' }}>{correctGlyph}</Text>.</>
                : 'Not quite — listen again and try.'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        {right ? (
          <Pressable accessibilityRole="button" onPress={() => { setSay('idle'); stop(); }} style={[styles.cta, { backgroundColor: T.primary }]}>
            <CardIcon name="mic" size={18} color={T.onPrimary} />
            <Text style={[styles.ctaText, { color: T.onPrimary }]}>Say it back</Text>
          </Pressable>
        ) : picked !== null ? (
          <Pressable accessibilityRole="button" onPress={() => { setPicked(null); stop(); }} style={[styles.cta, { backgroundColor: T.record }]}>
            <CardIcon name="replay" size={18} color="#fff" />
            <Text style={[styles.ctaText, { color: '#fff' }]}>Try again</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => play(() => onPlay('native'))} style={[styles.ctaOutline, { borderColor: T.hair }]}>
            <CardIcon name="replay" size={18} color={T.sub} />
            <Text style={[styles.ctaText, { color: T.sub }]}>Play again</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  headBlock: { alignItems: 'center', marginBottom: 4 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.4, textAlign: 'center' },
  prompt: { fontSize: 27, fontWeight: '500', letterSpacing: -0.3, marginTop: 8, textAlign: 'center' },
  audio: { alignItems: 'center', rowGap: 18, marginVertical: 32 },
  wave: { width: '64%' },
  cards: { flexDirection: 'row', columnGap: 14 },
  glyphCard: { flex: 1, borderRadius: 24, borderWidth: 1.5, paddingTop: 26, paddingBottom: 20, paddingHorizontal: 14, alignItems: 'center', rowGap: 6 },
  badge: { position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 64, fontWeight: '500', lineHeight: 64 },
  cardWord: { fontSize: 20, fontWeight: '500', marginTop: 4 },
  cardGloss: { fontSize: 13 },
  cardHint: { fontSize: 13, marginTop: 2 },
  feedbackWrap: { height: 46, marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  feedback: { fontSize: 14.5, fontWeight: '500' },
  sayHero: { fontSize: 56, fontWeight: '500', textAlign: 'center', marginTop: 28 },
  sayPron: { fontSize: 14.5, textAlign: 'center', marginTop: 10 },
  sayControls: { alignItems: 'center', rowGap: 11, marginTop: 24 },
  sayMic: { height: 110, marginTop: 20, alignItems: 'center', justifyContent: 'flex-start', rowGap: 12 },
  micHint: { fontSize: 13 },
  footer: { paddingBottom: 30 },
  cta: { height: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 },
  ctaOutline: { height: 54, borderRadius: 18, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 },
  ctaText: { fontSize: 16.5, fontWeight: '600' },
  footNote: { fontSize: 13.5, fontWeight: '500', textAlign: 'center', paddingVertical: 17 },
});
