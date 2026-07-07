// phrase/unlock — the one celebratory beat (BACKEND_INTEGRATION §4). A single restrained bloom +
// the unlock orb, then it auto-flows into hearing the phrase (no button). The soft two-note chime is
// played by the controller via AudioService (the card only fires onUnlocked()); onUnlocked returns a
// canceller run on unmount so a late auto-advance never fires after the card is gone.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-phrase.jsx `PhraseUnlock`). One bloom ring
// (animated), the orb with the unlock glyph, "PHRASE UNLOCKED" rising in over the phrase + "You know
// all its words now.", and a bottom auto-advance line ("Hearing it…") whose fill animates once.
// Entrances are gated on reduced-motion via a mount-time AccessibilityInfo probe (same pattern as
// StageFade): with reduce-motion on, everything jumps straight to the visible end-state.
// All animations (bloom/rise/fill) finish before the controller's 1800ms auto-advance
// (UNLOCK_DELAY_MS in src/session/cardWiring.ts) so the fill line actually completes on screen.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, AccessibilityInfo, Easing, StyleSheet, type DimensionValue } from 'react-native';
import { Screen } from '../components';
import { CardIcon, PhraseLine } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { hexA } from '../theme/tokens';
import type { PhraseGateProps } from './cardProps';

/** Fill-line timing: delay + duration must complete comfortably before the controller's
 *  UNLOCK_DELAY_MS (1800ms) auto-advance — otherwise the fill can never reach 100% on screen. */
export const FILL_DELAY_MS = 400;
export const FILL_DURATION_MS = 1000;

export function PhraseUnlock({ item, onUnlocked }: PhraseGateProps): React.JSX.Element {
  const T = useTheme();

  // The controller plays the chime via AudioService then auto-advances after a readable delay.
  useEffect(() => onUnlocked?.(), [onUnlocked]);

  // bloom ring + the "filling" hearing-it line
  const bloom = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    const settle = (): void => {
      // Reduced motion: jump straight to the end-state (bloom faded out, text risen, fill full).
      bloom.setValue(1);
      rise.setValue(1);
      fill.setValue(1);
    };
    const animate = (): void => {
      // Every timing ends before the controller's 1800ms UNLOCK_DELAY_MS auto-advance.
      Animated.parallel([
        Animated.timing(bloom, { toValue: 1, duration: 1400, delay: 250, easing: Easing.bezier(0.2, 0.6, 0.3, 1), useNativeDriver: true }),
        Animated.timing(rise, { toValue: 1, duration: 600, delay: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(fill, { toValue: 1, duration: FILL_DURATION_MS, delay: FILL_DELAY_MS, easing: Easing.linear, useNativeDriver: false }),
      ]).start();
    };
    // Mount-time reduced-motion probe (same pattern as StageFade); on failure, default to animating.
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => {
        if (cancelled) return;
        if (on) settle();
        else animate();
      })
      .catch(() => {
        if (!cancelled) animate();
      });
    return () => {
      cancelled = true;
    };
  }, [bloom, fill, rise]);

  const riseStyle = {
    opacity: rise,
    transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.orbWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bloom,
              {
                borderColor: hexA(T.primary, 0.4),
                opacity: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.6] }) }],
              },
            ]}
          />
          <View style={[styles.halo, { backgroundColor: T.primarySoft }]} />
          <View style={[styles.orb, { backgroundColor: T.primary, shadowColor: T.primary }]}>
            <CardIcon name="unlock" size={25} color={T.onPrimary} sw={1.9} />
          </View>
        </View>

        <Animated.Text style={[styles.unlocked, { color: T.primary }, riseStyle]}>PHRASE UNLOCKED</Animated.Text>
        <Animated.View style={[{ marginTop: 16 }, riseStyle]}>
          <PhraseLine phrase={item.target} highlight={item.newForm} size={32} />
        </Animated.View>
        <Animated.Text style={[styles.meaning, { color: T.sub }, riseStyle]}>{item.gloss}</Animated.Text>
        <Animated.Text style={[styles.sub, { color: T.faint }, riseStyle]}>You know all its words now.</Animated.Text>
      </View>

      {/* no button — it flows straight into hearing it */}
      <View style={styles.footer}>
        <View style={[styles.track, { backgroundColor: T.dark ? 'rgba(255,255,255,0.09)' : 'rgba(26,39,51,0.08)' }]}>
          <Animated.View style={[styles.trackFill, { backgroundColor: T.primary, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) as unknown as DimensionValue }]} />
        </View>
        <Text style={[styles.hearing, { color: T.faint }]}>Hearing it…</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 8 },
  orbWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  bloom: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 1.5 },
  halo: { position: 'absolute', width: 96, height: 96, borderRadius: 48 },
  orb: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.32, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  unlocked: { fontSize: 12, fontWeight: '600', letterSpacing: 1.6, marginTop: 28 },
  meaning: { fontSize: 16, marginTop: 10, textAlign: 'center' },
  sub: { fontSize: 14.5, marginTop: 14 },
  footer: { paddingBottom: 42, alignItems: 'center', rowGap: 10 },
  track: { width: 110, height: 3, borderRadius: 99, overflow: 'hidden' },
  trackFill: { height: 3, borderRadius: 99 },
  hearing: { fontSize: 12.5 },
});
