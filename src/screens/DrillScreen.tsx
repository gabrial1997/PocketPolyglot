// drill — minimal-pair perception drill (ports kit screens-drill.jsx `DrillScreen`).
// Loop: HEAR the clip -> DISCRIMINATE which glyph it was -> SAY IT BACK. Minimal-pair contrasts
// (palatalization, vowel length, …) are ones English ears miss. Pure card: data-in (item) /
// events-out (callbacks); only ephemeral state. The pair data is GENERIC — all contrast copy
// (eyebrow, feedback, result note) renders from item/pair fields, never hard-coded phonetics.
//
// LOCKED wrong-answer rule (CLAUDE.md): a wrong pick does NOT advance — only the chosen wrong glyph
// reddens, the correct glyph is NEVER revealed (its word stays hidden, no green badge), the miss is
// remembered (`missed`). A correct pick reveals that glyph's word + a green badge, then unlocks
// "Say it back".
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup. Centered eyebrow + serif prompt;
// audio hero (waveform + PlayOrb 72 + SpeedChip); two big glyph cards (radius 24); the green/carmine
// feedback line; the say-it-back stage (hero word + outline PlayOrb 54 + MicOrb -> ResultNote); and
// the staged bottom CTA (Play again / Try again / Say it back / Next pair).
//
// Per-side copy (hints) are optional/additive on ReviewPair (front-end-sync handoff PATCH): aHint,
// bHint. They degrade gracefully — absent, the idle card just shows its glyph.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, PlayOrb, MicOrb, LiveWaveform, usePlayClip, FRAME_MS, SpeedChip, type Speed } from '../components';
import { CardIcon, ResultNote } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, fonts } from '../theme/tokens';
import type { RecordingCardProps } from './cardProps';
import type { ReviewPair } from '../types/reviewItem';

type Side = 'a' | 'b';
type Say = null | 'idle' | 'rec' | 'done';

// Hoisted out of the render body (a component defined inside render remounts on every render,
// losing native view state and defeating reconciliation).
function GlyphCard({ side, glyph, hint, picked, right, pair, word, gloss, onChoose }: {
  side: Side;
  glyph: string;
  hint?: string;
  picked: Side | null;
  right: boolean;
  pair: ReviewPair;
  word: string;
  gloss: string;
  onChoose: (side: Side) => void;
}): React.JSX.Element {
  const T = useTheme();
  const isPicked = picked === side;
  const isCorrect = side === pair.correct;
  let bg = T.surface, bd = T.hair, fg = T.ink, accent = false;
  if (picked !== null) {
    if (right && isCorrect) { bg = T.goodSoft; bd = hexA(T.good, 0.5); fg = T.good; accent = true; }
    else if (isPicked) { bg = hexA(T.record, T.dark ? 0.12 : 0.07); bd = hexA(T.record, 0.45); fg = T.record; }
  }
  return (
    <Pressable accessibilityRole="button" disabled={picked !== null} onPress={() => onChoose(side)} style={[styles.glyphCard, { backgroundColor: bg, borderColor: bd }, picked === null ? T.shadow : null]}>
      {accent ? (
        <View style={[styles.badge, { backgroundColor: T.good }]}><CardIcon name="check" size={16} color={T.onPrimary} sw={2.4} /></View>
      ) : null}
      {/* The "glyph" is the whole pair word (e.g. lācis/ļoti), not a single letter — long words
          overflow the half-width card at 64px and clip. Shrink-to-fit on one line keeps them whole. */}
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.glyph, { color: accent ? T.good : fg, fontFamily: fonts.headline }]}>{glyph}</Text>
      {accent ? (
        <>
          <Text style={[styles.cardWord, { color: T.ink, fontFamily: fonts.headline }]}>{word}</Text>
          <Text style={[styles.cardGloss, { color: T.sub }]}>{gloss}</Text>
        </>
      ) : hint ? (
        <Text style={[styles.cardHint, { color: T.faint }]}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

export function DrillScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onStop, onPreload, onRecordStart, onRecordStop, onComplete, speed: speedProp, onSpeedChange, recConsent = true } = props;
  // GDPR record gate: when false, hide the record affordance on the say-it-back stage.
  const T = useTheme();
  const pair = item.pair;

  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip drives it.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const [picked, setPicked] = useState<Side | null>(null);
  const { playing, positionMs, rate, play, stop } = usePlayClip(item.audio?.envelope); // reactive soundbar gate
  // The orb is a play/pause toggle (bug 3): tapping mid-clip stops the voice; tapping at rest replays.
  const replay = (): void => {
    if (playing) { onStop?.(); stop(); }
    else play(() => onPlay('native', speed), speed);
  };
  // Stage transitions must silence the REAL clip too, not just the local soundbar gate —
  // otherwise audio keeps sounding across the stage change (same pairing the replay toggle uses).
  const stopAll = (): void => { onStop?.(); stop(); };
  // Warm the native clip on mount so the first orb tap starts without a load stall (bug 1).
  useEffect(() => {
    onPreload?.('native');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [say, setSay] = useState<Say>(null);
  // `missed` is sticky across a Try-again reset so the first-try miss is remembered for honest SRS
  // correctness (locked rule + this card's header comment). `right` is the current selection state.
  const [missed, setMissed] = useState(false);
  const right = picked !== null && pair != null && picked === pair.correct;

  if (!pair) return <Screen><View style={styles.body} /></Screen>;
  const correctGlyph = pair.correct === 'a' ? pair.a : pair.b;
  // The eyebrow derives from the pair itself — the drill data is generic (palatalization, vowel
  // length, …), so naming a fixed contrast class here would lie for most pairs.
  const eyebrow = `Sound check · ${pair.a} vs ${pair.b}`.toUpperCase();

  const choose = (side: Side): void => {
    if (picked === null) {
      setPicked(side);
      if (pair != null && side !== pair.correct) setMissed(true);
    }
  };

  // ── SAY IT BACK ──
  if (say !== null) {
    return (
      <Screen>
        <View style={styles.body}>
          <View style={styles.headBlock}>
            <Text style={[styles.eyebrow, { color: T.faint }]}>{eyebrow}</Text>
            <Text style={[styles.prompt, { color: T.ink, fontFamily: fonts.headline }]}>Say it back</Text>
          </View>
          <Text style={[styles.sayHero, { color: T.ink, fontFamily: fonts.headline }]}>{item.target}</Text>
          <Text style={[styles.sayPron, { color: T.sub }]}>
            {item.gloss}{item.pron ? <Text style={{ color: T.faint }}> · {item.pron}</Text> : null}
          </Text>
          <View style={styles.sayControls}>
            <PlayOrb size={54} filled={false} playing={playing} onPress={replay} />
            <SpeedChip value={speed} onChange={changeSpeed} />
          </View>
          <View style={styles.sayMic}>
            {say === 'done' ? (
              // No production grade in Phase 0 — acknowledge finishing the loop and reinforce the
              // target sound, without claiming the recording "sounded right" (that needs GOP scoring).
              <ResultNote>Nice work — hold on to that <Text style={{ fontWeight: '700', color: T.ink }}>{correctGlyph}</Text>.</ResultNote>
            ) : recConsent ? (
              <>
                <MicOrb size={72} rec={say === 'rec'} onPress={() => { if (say === 'rec') { onRecordStop(); setSay('done'); } else { onRecordStart(); setSay('rec'); } }} />
                <Text style={[styles.micHint, { color: say === 'rec' ? T.record : T.faint, fontWeight: say === 'rec' ? '600' : '400' }]}>
                  {say === 'rec' ? 'Listening… tap to stop' : 'Now say it'}
                </Text>
              </>
            ) : (
              <Text style={[styles.micHint, { color: T.faint }]}>Recording is off — turn it on in Settings to hear yourself.</Text>
            )}
          </View>
        </View>
        <View style={styles.footer}>
          {say === 'done' || !recConsent ? (
            // spoke is honest: true only when a take was actually recorded (never without consent).
            <Pressable accessibilityRole="button" onPress={() => onComplete({ itemId: item.id, cardKind: 'drill', correct: !missed, spoke: say === 'done' })} style={[styles.cta, { backgroundColor: T.primary }]}>
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
          <Text style={[styles.eyebrow, { color: T.faint }]}>{eyebrow}</Text>
          <Text style={[styles.prompt, { color: T.ink, fontFamily: fonts.headline }]}>Which did you hear?</Text>
        </View>

        <View style={styles.audio}>
          <View style={styles.wave}>
            <LiveWaveform envelope={item.audio?.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={52} count={34} />
          </View>
          <PlayOrb size={72} playing={playing} onPress={replay} />
          <SpeedChip value={speed} onChange={changeSpeed} />
        </View>

        <View style={styles.cards}>
          <GlyphCard side="a" glyph={pair.a} hint={pair.aHint} picked={picked} right={right} pair={pair} word={item.target} gloss={item.gloss} onChoose={choose} />
          <GlyphCard side="b" glyph={pair.b} hint={pair.bHint} picked={picked} right={right} pair={pair} word={item.target} gloss={item.gloss} onChoose={choose} />
        </View>

        <View style={styles.feedbackWrap}>
          {picked !== null ? (
            <Text style={[styles.feedback, { color: right ? T.good : T.record }]}>
              {right
                ? <>Right — that was <Text style={{ fontWeight: '700' }}>{correctGlyph}</Text>.</>
                : 'Not quite — give it another try.'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        {right ? (
          <Pressable accessibilityRole="button" onPress={() => { setSay('idle'); stopAll(); }} style={[styles.cta, { backgroundColor: T.primary }]}>
            <CardIcon name="mic" size={18} color={T.onPrimary} />
            <Text style={[styles.ctaText, { color: T.onPrimary }]}>Say it back</Text>
          </Pressable>
        ) : picked !== null ? (
          <Pressable accessibilityRole="button" onPress={() => { setPicked(null); stopAll(); }} style={[styles.cta, { backgroundColor: T.record }]}>
            <CardIcon name="replay" size={18} color={T.onPrimary} />
            <Text style={[styles.ctaText, { color: T.onPrimary }]}>Try again</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={replay} style={[styles.ctaOutline, { borderColor: T.hair }]}>
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
  // lineHeight > fontSize reserves headroom above the cap so a top macron (ā/ī/ū) isn't cropped by
  // the line box; paddingTop nudges the glyph down for the same reason. (~1.22× — device-walk fix.)
  glyph: { fontSize: 64, fontWeight: '500', lineHeight: 78, paddingTop: 4 },
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
