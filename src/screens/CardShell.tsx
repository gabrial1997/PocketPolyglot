// CardShell — shared presentation scaffold for card stubs. Renders the eyebrow (CardKind),
// the target word hero + gloss, and a slot for children (controls). Keeps every card stub tiny
// while honouring the theme/type tokens. Not a card itself; a layout helper.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { type, fonts } from '../theme/tokens';
import { shouldShowGloss } from './glossVisibility';

export function CardShell({
  eyebrow,
  target,
  gloss,
  pron,
  translationVisibility,
  missed,
  children,
}: {
  eyebrow: string;
  target?: string;
  gloss?: string;
  pron?: string;
  /** Derived from computeRung (Module C2). Defaults to 'auto' (backward-compatible). */
  translationVisibility?: 'auto' | 'hint' | 'on-demand';
  /** True when the learner has given at least one wrong answer this session (drives hint reveal). */
  missed?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  const T = useTheme();
  const [tappedReveal, setTappedReveal] = useState(false);
  const mode = translationVisibility ?? 'auto';
  const showGloss = shouldShowGloss(mode, missed ?? false, tappedReveal);
  const showRevealAffordance = gloss != null && !showGloss && mode === 'on-demand';

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: T.faint }]}>{eyebrow.toUpperCase()}</Text>
        {target ? (
          <Text style={[styles.hero, { color: T.ink, fontFamily: fonts.headline }]}>{target}</Text>
        ) : null}
        {pron ? <Text style={[styles.pron, { color: T.faint }]}>{pron}</Text> : null}
        {gloss && showGloss ? <Text style={[styles.gloss, { color: T.sub }]}>{gloss}</Text> : null}
        {showRevealAffordance ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setTappedReveal(true)}
            style={[styles.revealBtn, { borderColor: T.hair }]}
          >
            <Text style={[styles.revealText, { color: T.sub }]}>Show meaning</Text>
          </Pressable>
        ) : null}
        <View style={styles.controls}>{children}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Center the column so the cue word/gloss sit mid-screen like the mockups (was left-aligned).
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', rowGap: 12 },
  eyebrow: {
    fontSize: type.eyebrow,
    fontWeight: '700',
    letterSpacing: type.eyebrowSpacing,
    textAlign: 'center',
  },
  hero: { fontSize: type.wordHero, letterSpacing: type.wordHeroSpacing, textAlign: 'center' },
  pron: { fontSize: type.pron, textAlign: 'center' },
  gloss: { fontSize: type.body, textAlign: 'center' },
  revealBtn: { paddingVertical: 11, paddingHorizontal: 28, borderRadius: 99, borderWidth: 1.5, alignSelf: 'center' },
  revealText: { fontSize: 14, fontWeight: '600' },
  // Stretch full-width (so width:'100%' children like CtaButton/Waveform keep their size) but
  // center fixed-size children (orbs) within the column.
  controls: { marginTop: 24, rowGap: 16, alignSelf: 'stretch', alignItems: 'center' },
});
