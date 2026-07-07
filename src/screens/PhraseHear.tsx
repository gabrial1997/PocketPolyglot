// phrase/hear — first exposure (BACKEND_INTEGRATION §4). Input first: hear the phrase, with the
// meaning demoted behind a tap. The live soundbar (LiveWaveform) moves with the real voice while
// the clip plays. Out: { spoke:false }.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-phrase.jsx `PhraseHear`). Eyebrow
// "NEW PHRASE"; PhraseLine with the just-learned word in primary + underlined; the "dzert, here as
// 'dzeru'" hint; audio hero (soundbar + PlayOrb 78 + SpeedChip); "Show meaning" toggle; footer
// shows the REAL projected first review (item.reviewPreview) — never a fabricated "tomorrow" —
// + Continue. Soundbar gate timing preserved from the prior card.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, PlayOrb, SpeedChip, LiveWaveform, CtaButton, usePlayClip, FRAME_MS, type Speed } from '../components';
import { CardIcon, Eyebrow, PhraseLine, LiteralNote } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import type { BaseCardProps } from './cardProps';

export function PhraseHear({ item, onPlay, onStop, onPreload, onComplete, speed: speedProp, onSpeedChange }: BaseCardProps): React.JSX.Element {
  const T = useTheme();
  const env = item.audio?.envelope;
  // Playback speed is ephemeral card state (CLAUDE.md boundary); the chip drives it.
  const [speed, setSpeed] = useState<Speed>(speedProp ?? 1);
  const changeSpeed = (s: Speed): void => { setSpeed(s); onSpeedChange?.(s); };
  const { playing, positionMs, rate, play, stop: stopGate } = usePlayClip(env); // shared soundbar gate (real-amplitude, no loop)
  const [shown, setShown] = useState(false);

  const playClip = (): void => play(() => onPlay('native', speed), speed);
  // The orb is a play/pause toggle (bug 3): tapping mid-clip stops the voice; at rest it replays.
  // (The mount auto-play below uses playClip directly, never this toggle.)
  const toggleClip = (): void => {
    if (playing) { onStop?.(); stopGate(); }
    else playClip();
  };

  // First exposure plays the phrase ONCE on mount (user decision 2026-06-25 — the prior
  // say-then-repeat felt like an unexpected double-play). The learner taps the orb to replay.
  // Runs once on mount — GlideViewport remounts the card per item, so each new phrase plays.
  useEffect(() => {
    onPreload?.('native'); // warm the clip so the auto-play starts without a load stall
    // Only auto-play ON MOUNT when the phrase actually has audio — audio-less phrases show the
    // written form with a silent play orb (a manual orb tap relies on usePlayClip being a no-op
    // when there's no clip).
    if (item.audio?.nativeUrl || item.audio?.envelope) playClip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <View style={styles.body}>
        <Eyebrow>New phrase</Eyebrow>

        <View style={{ marginTop: 22 }}>
          <PhraseLine phrase={item.target} highlight={item.newForm} size={34} />
        </View>

        {item.newLemma || item.newForm ? (
          <Text style={[styles.hint, { color: T.faint }]}>
            <Text style={{ fontFamily: fonts.headline, fontWeight: '600', color: T.primary }}>{item.newLemma ?? item.newForm}</Text>
            {item.newForm ? `, here as “${item.newForm}”` : ''}
          </Text>
        ) : null}

        {item.literal ? (
          <View style={{ marginTop: 14 }}>
            <LiteralNote literal={item.literal} usageNote={item.usageNote} />
          </View>
        ) : null}

        {/* word-by-word breakdown — a phrase built from known LEMMAS can surface unrecognizable
            FORMS ("nav" ← būt); teach the mapping right here, at the moment it matters. */}
        {item.componentBreakdown?.length ? (
          <View style={styles.breakdown}>
            {item.componentBreakdown.map((c, i) => (
              <View key={`${c.surface}-${i}`} style={styles.breakdownRow}>
                <Text style={[styles.breakdownSurface, { color: T.ink }]}>{c.surface}</Text>
                <Text style={[styles.breakdownGloss, { color: T.faint }]} numberOfLines={1}>
                  {c.surface === c.lemma ? c.gloss : `form of ${c.lemma} (${c.gloss})`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* audio hero */}
        <View style={styles.audio}>
          <View style={styles.wave}>
            <LiveWaveform envelope={env} playing={playing} positionMs={positionMs} rate={rate} frameMs={FRAME_MS} height={58} count={44} />
          </View>
          <PlayOrb size={78} playing={playing} onPress={toggleClip} />
          <SpeedChip value={speed} onChange={changeSpeed} />
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
        {/* REAL projected first-review label carried on the item (computed from live FSRS state);
            omitted entirely when absent — never a fabricated "tomorrow" claim. */}
        {item.reviewPreview ? (
          <Text style={[styles.review, { color: T.faint }]}>{item.reviewPreview.pass}.</Text>
        ) : null}
        <CtaButton title="Continue" onPress={() => onComplete({ itemId: item.id, cardKind: 'phrase/hear', spoke: false })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 8 },
  hint: { fontSize: 13, marginTop: 12 },
  breakdown: { marginTop: 16, rowGap: 5, alignItems: 'center' },
  breakdownRow: { flexDirection: 'row', alignItems: 'baseline', columnGap: 8 },
  breakdownSurface: { fontSize: 14.5, fontWeight: '600' },
  breakdownGloss: { fontSize: 13 },
  audio: { width: '100%', marginTop: 32, alignItems: 'center', rowGap: 20 },
  wave: { width: '78%' },
  meaning: { height: 70, marginTop: 24, alignItems: 'center', justifyContent: 'flex-start' },
  meaningText: { fontSize: 19, fontWeight: '500' },
  showBtn: { flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 99, borderWidth: 1.5 },
  showText: { fontSize: 14, fontWeight: '600' },
  footer: { paddingBottom: 30, rowGap: 11 },
  review: { fontSize: 13.5, fontWeight: '500', textAlign: 'center' },
});
