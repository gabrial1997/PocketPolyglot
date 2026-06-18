// CardShell — shared presentation scaffold for card stubs. Renders the eyebrow (CardKind),
// the target word hero + gloss, and a slot for children (controls). Keeps every card stub tiny
// while honouring the theme/type tokens. Not a card itself; a layout helper.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { type, fonts } from '../theme/tokens';

export function CardShell({
  eyebrow,
  target,
  gloss,
  pron,
  children,
}: {
  eyebrow: string;
  target?: string;
  gloss?: string;
  pron?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: T.faint }]}>{eyebrow.toUpperCase()}</Text>
        {target ? (
          <Text style={[styles.hero, { color: T.ink, fontFamily: fonts.headline }]}>{target}</Text>
        ) : null}
        {pron ? <Text style={[styles.pron, { color: T.faint }]}>{pron}</Text> : null}
        {gloss ? <Text style={[styles.gloss, { color: T.sub }]}>{gloss}</Text> : null}
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
  // Stretch full-width (so width:'100%' children like CtaButton/Waveform keep their size) but
  // center fixed-size children (orbs) within the column.
  controls: { marginTop: 24, rowGap: 16, alignSelf: 'stretch', alignItems: 'center' },
});
