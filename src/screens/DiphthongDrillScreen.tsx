// diphthong — the hard 'ie' glide drill (ports kit screens-drill.jsx `DiphthongDrillScreen`).
// MEET the glide (GlideTrack teaches the i→e movement) -> CONTRAST a minimal pair that only ie vs ē
// separates -> SAY it with the glide as the guide. 'ie' is one gliding sound English ears flatten to
// a long ē, so we teach the movement before testing it. Pure card: data-in / events-out only.
//
// LOCKED wrong-answer rule (CLAUDE.md): in CONTRAST a wrong pick does NOT advance — the chosen card
// reddens, the correct card is NEVER marked, the miss is remembered (`missed`). A correct pick marks
// the card green and unlocks "Say it back".
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup. MEET = "HARD COMBINATION" + DIPHTHONG tag, big serif
// combo, the lede, GlideTrack, outline-less PlayOrb 66 + SpeedChip; CONTRAST = a "SOUND CHECK" eyebrow
// derived from the pair notes + minimal-pair cards with glide/flat indicators; SAY = serif word with
// the combo in primary + GlideTrack guide + MicOrb -> green ResultNote. Staged bottom CTAs match
// (Hear it in a word / Try again / Say it back / Next combination). The pair/glide data is generic —
// all contrast copy renders from item fields (glide.combo/from/to, pair aNote/bNote), never
// hard-coded phonetics.
//
// Per-side contrast copy is optional/additive on ReviewPair (handoff PATCH): aKind/bKind ('glide' |
// 'flat'), aNote/bNote (the vowel, e.g. "ie" / "ē"), aEn/bEn (the gloss). All degrade gracefully.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Screen, PlayOrb, MicOrb, LiveWaveform, usePlayClip, FRAME_MS, SpeedChip, type Speed } from '../components';
import { GlideTrack } from '../components/GlideTrack';
import { CardIcon, ResultNote, WordTag } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, fonts } from '../theme/tokens';
import type { RecordingCardProps } from './cardProps';

type Side = 'a' | 'b';
type Phase = 'meet' | 'contrast' | 'say';
type Say = 'idle' | 'rec' | 'done';

function GlideMini({ color }: { color: string }): React.JSX.Element {
  return <Svg width={30} height={16} viewBox="0 0 30 16"><Path d="M4 13 Q15 2 26 13" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" /></Svg>;
}
function FlatMini({ color }: { color: string }): React.JSX.Element {
  return <Svg width={30} height={16} viewBox="0 0 30 16"><Path d="M4 8.5 H26" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" /></Svg>;
}

export function DiphthongDrillScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onStop, onPreload, onRecordStart, onRecordStop, onComplete, speed: speedProp, onSpeedChange, recConsent = true } = props;
  // GDPR record gate: when false, hide the record affordance on the say stage.
  const T = useTheme();
  const glide = item.glide;
  const pair = item.pair;

  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip drives it.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const [phase, setPhase] = useState<Phase>('meet');
  const [picked, setPicked] = useState<Side | null>(null);
  const [say, setSay] = useState<Say>('idle');
  const { playing, positionMs, rate, play, stop } = usePlayClip(item.audio?.envelope); // reactive soundbar gate
  // The orbs are play/pause toggles (bug 3): tapping mid-clip stops the voice; tapping at rest replays.
  const replayNative = (): void => {
    if (playing) { onStop?.(); stop(); }
    else play(() => onPlay('native', speed), speed);
  };
  const replayGlide = (): void => {
    if (playing) { onStop?.(); stop(); }
    else play(() => onPlay('glide', speed), speed);
  };
  // Stage transitions must silence the REAL clip too, not just the local soundbar gate —
  // otherwise audio keeps sounding across the stage change (same pairing the replay toggles use).
  const stopAll = (): void => { onStop?.(); stop(); };
  // Warm the clips on mount so the first orb tap starts without a load stall (bug 1). The MEET
  // phase's first tap plays the isolated GLIDE clip, so warm it first; native follows for contrast/say.
  useEffect(() => {
    onPreload?.('glide');
    onPreload?.('native');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const right = picked !== null && pair != null && picked === pair.correct;
  // `missed` is STICKY across a Try-again reset (which clears `picked`) so the first-try miss is
  // remembered for honest SRS correctness — matching DrillScreen and the locked wrong-answer rule.
  // Deriving it from `picked` would erase the miss the moment Try-again resets the selection.
  const [missed, setMissed] = useState(false);

  // ── MEET ──
  if (phase === 'meet') {
    return (
      <Screen>
        <View style={styles.centerBody}>
          <View style={styles.tagRow}>
            <Text style={[styles.eyebrow, { color: T.faint }]}>HARD COMBINATION</Text>
            <WordTag label="Diphthong" tone="primary" />
          </View>
          <Text style={[styles.combo, { color: T.ink, fontFamily: fonts.headline }]}>{glide?.combo ?? 'ie'}</Text>
          <Text style={[styles.lede, { color: T.sub }]}>
            One sound, not two — it <Text style={{ color: T.ink, fontWeight: '600' }}>glides</Text> from {glide?.from ?? 'i'} to {glide?.to ?? 'e'} in one move.
          </Text>
          <View style={styles.glideWrap}>
            <GlideTrack from={glide?.from} to={glide?.to} playing={playing} color={T.primary} />
          </View>
          <PlayOrb size={66} playing={playing} onPress={replayGlide} />
          <SpeedChip value={speed} onChange={changeSpeed} />
          <Text style={[styles.tapHint, { color: T.faint }]}>Tap to hear the glide</Text>
        </View>
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={() => { setPhase('contrast'); stopAll(); }} style={[styles.cta, { backgroundColor: T.primary }]}>
            <Text style={[styles.ctaText, { color: T.onPrimary }]}>Hear it in a word</Text>
            <CardIcon name="chevR" size={17} color={T.onPrimary} />
          </Pressable>
        </View>
      </Screen>
    );
  }

  // ── SAY ──
  if (phase === 'say') {
    const word = item.target;
    const combo = glide?.combo ?? 'ie';
    const idx = word.indexOf(combo);
    const before = idx >= 0 ? word.slice(0, idx) : word;
    const mid = idx >= 0 ? combo : '';
    const after = idx >= 0 ? word.slice(idx + combo.length) : '';
    return (
      <Screen>
        <View style={styles.centerBody}>
          <Text style={[styles.eyebrow, { color: T.faint }]}>SAY IT BACK</Text>
          <Text style={[styles.sayHero, { color: T.ink, fontFamily: fonts.headline }]}>
            {before}<Text style={{ color: T.primary }}>{mid}</Text>{after}
          </Text>
          <Text style={[styles.sayPron, { color: T.sub }]}>
            {item.gloss}{item.pron ? <Text style={{ color: T.faint }}> · {item.pron}</Text> : null}
          </Text>
          <View style={styles.glideWrap}>
            <GlideTrack from={glide?.from} to={glide?.to} playing={playing} color={T.primary} width={230} />
          </View>
          <View style={styles.sayControls}>
            <PlayOrb size={50} filled={false} playing={playing} onPress={replayNative} />
            <SpeedChip value={speed} onChange={changeSpeed} />
          </View>
          <View style={styles.sayMic}>
            {say === 'done' ? (
              <ResultNote>Clean glide — you held the <Text style={{ fontWeight: '700', color: T.ink }}>{combo}</Text> all the way through.</ResultNote>
            ) : recConsent ? (
              <>
                <MicOrb size={72} rec={say === 'rec'} onPress={() => { if (say === 'rec') { onRecordStop(); setSay('done'); } else { onRecordStart(); setSay('rec'); } }} />
                <Text style={[styles.micHint, { color: say === 'rec' ? T.record : T.faint, fontWeight: say === 'rec' ? '600' : '400' }]}>
                  {say === 'rec' ? 'Listening… tap to stop' : 'Now say it — let it glide'}
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
            <Pressable accessibilityRole="button" onPress={() => onComplete({ itemId: item.id, cardKind: 'diphthong', correct: !missed, spoke: say === 'done' })} style={[styles.cta, { backgroundColor: T.primary }]}>
              <Text style={[styles.ctaText, { color: T.onPrimary }]}>Next combination</Text>
              <CardIcon name="chevR" size={17} color={T.onPrimary} />
            </Pressable>
          ) : (
            <Text style={[styles.footNote, { color: T.faint }]}>Holding the glide is what makes it land.</Text>
          )}
        </View>
      </Screen>
    );
  }

  // ── CONTRAST ──
  const choose = (side: Side): void => {
    if (picked === null) {
      setPicked(side);
      if (pair != null && side !== pair.correct) setMissed(true);
    }
  };
  const sideData = (side: Side) => pair && (side === 'a'
    ? { lv: pair.a, kind: pair.aKind, note: pair.aNote, en: pair.aEn }
    : { lv: pair.b, kind: pair.bKind, note: pair.bNote, en: pair.bEn });
  // The contrast eyebrow derives from the pair notes (the two vowels) when present, else the glide
  // combo — the pair data is generic, so a fixed "THE GLIDE VS FLAT Ē" would lie for other pairs.
  const contrastEyebrow = pair?.aNote && pair?.bNote
    ? `Sound check · ${pair.aNote} vs ${pair.bNote}`.toUpperCase()
    : `Sound check · ${glide?.combo ?? 'ie'}`.toUpperCase();

  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.headBlock}>
          <Text style={[styles.eyebrow, { color: T.faint }]}>{contrastEyebrow}</Text>
          <Text style={[styles.prompt, { color: T.ink, fontFamily: fonts.headline }]}>Which did you hear?</Text>
        </View>

        <View style={styles.audio}>
          <View style={styles.wave}>
            <LiveWaveform envelope={item.audio?.envelope} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={52} count={34} />
          </View>
          <PlayOrb size={72} playing={playing} onPress={replayNative} />
          <SpeedChip value={speed} onChange={changeSpeed} />
        </View>

        <View style={styles.cards}>
          {(['a', 'b'] as Side[]).map((side) => {
            const d = sideData(side);
            if (!d) return null;
            const isPicked = picked === side;
            const isCorrect = pair != null && side === pair.correct;
            let bg = T.surface, bd = T.hair, accent = false;
            if (picked !== null) {
              if (right && isCorrect) { bg = T.goodSoft; bd = hexA(T.good, 0.5); accent = true; }
              else if (isPicked) { bg = hexA(T.record, T.dark ? 0.12 : 0.07); bd = hexA(T.record, 0.45); }
            }
            const indColor = accent ? T.good : (picked !== null && isPicked ? T.record : T.faint);
            return (
              <Pressable key={side} accessibilityRole="button" disabled={picked !== null} onPress={() => choose(side)} style={[styles.contrastCard, { backgroundColor: bg, borderColor: bd }, picked === null ? T.shadow : null]}>
                {accent ? (
                  <View style={[styles.badge, { backgroundColor: T.good }]}><CardIcon name="check" size={16} color={T.onPrimary} sw={2.4} /></View>
                ) : null}
                <Text style={[styles.contrastWord, { color: accent ? T.good : T.ink, fontFamily: fonts.headline }]}>{d.lv}</Text>
                {d.kind || d.note ? (
                  <View style={styles.indRow}>
                    {d.kind === 'glide' ? <GlideMini color={indColor} /> : d.kind === 'flat' ? <FlatMini color={indColor} /> : null}
                    {d.note ? <Text style={[styles.indNote, { color: indColor, fontFamily: fonts.headline }]}>{d.note}</Text> : null}
                  </View>
                ) : null}
                {d.en ? <Text style={[styles.contrastEn, { color: T.sub }]}>{d.en}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.feedbackWrap}>
          {picked !== null ? (
            <Text style={[styles.feedback, { color: right ? T.good : T.record, textAlign: 'center' }]}>
              {right
                ? <>Right — <Text style={{ fontFamily: fonts.headline, fontWeight: '600' }}>{pair?.correct === 'a' ? pair?.a : pair?.b}</Text> glides {glide?.from ?? 'i'} → {glide?.to ?? 'e'}.</>
                : 'Not quite — give it another try.'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        {right ? (
          <Pressable accessibilityRole="button" onPress={() => { setPhase('say'); stopAll(); }} style={[styles.cta, { backgroundColor: T.primary }]}>
            <CardIcon name="mic" size={18} color={T.onPrimary} />
            <Text style={[styles.ctaText, { color: T.onPrimary }]}>Say it back</Text>
          </Pressable>
        ) : picked !== null ? (
          <Pressable accessibilityRole="button" onPress={() => { setPicked(null); stopAll(); }} style={[styles.cta, { backgroundColor: T.record }]}>
            <CardIcon name="replay" size={18} color={T.onPrimary} />
            <Text style={[styles.ctaText, { color: T.onPrimary }]}>Try again</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={replayNative} style={[styles.ctaOutline, { borderColor: T.hair }]}>
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
  centerBody: { flex: 1, justifyContent: 'center', alignItems: 'center', rowGap: 12 },
  tagRow: { flexDirection: 'row', alignItems: 'center', columnGap: 10 },
  headBlock: { alignItems: 'center', marginBottom: 4 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.4, textAlign: 'center' },
  combo: { fontSize: 76, lineHeight: 90, fontWeight: '500', letterSpacing: -1, marginTop: 8 },
  lede: { fontSize: 15, textAlign: 'center', maxWidth: 280, lineHeight: 22, marginTop: 2 },
  glideWrap: { marginVertical: 10, alignItems: 'center' },
  tapHint: { fontSize: 13, fontWeight: '500' },
  prompt: { fontSize: 27, lineHeight: 34, fontWeight: '500', letterSpacing: -0.3, marginTop: 8, textAlign: 'center' },
  audio: { alignItems: 'center', rowGap: 18, marginVertical: 28 },
  wave: { width: '64%' },
  cards: { flexDirection: 'row', columnGap: 14 },
  contrastCard: { flex: 1, borderRadius: 24, borderWidth: 1.5, paddingTop: 22, paddingBottom: 18, paddingHorizontal: 14, alignItems: 'center', rowGap: 8 },
  badge: { position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  // lineHeight comfortably > fontSize so a top macron on the contrast word isn't cropped (clip fix).
  contrastWord: { fontSize: 34, fontWeight: '500', lineHeight: 42 },
  indRow: { flexDirection: 'row', alignItems: 'center', columnGap: 7 },
  indNote: { fontSize: 15, fontStyle: 'italic' },
  contrastEn: { fontSize: 12.5 },
  feedbackWrap: { minHeight: 46, marginTop: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  feedback: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  sayHero: { fontSize: 56, lineHeight: 66, fontWeight: '500', marginTop: 16, textAlign: 'center' },
  sayPron: { fontSize: 14.5, marginTop: 10, textAlign: 'center' },
  sayControls: { alignItems: 'center', rowGap: 11, marginTop: 4 },
  sayMic: { height: 116, marginTop: 8, alignItems: 'center', justifyContent: 'flex-start', rowGap: 12 },
  micHint: { fontSize: 13 },
  footer: { paddingBottom: 30 },
  cta: { height: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 },
  ctaOutline: { height: 54, borderRadius: 18, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 },
  ctaText: { fontSize: 16.5, fontWeight: '600' },
  footNote: { fontSize: 13.5, fontWeight: '500', textAlign: 'center', paddingVertical: 17 },
});
