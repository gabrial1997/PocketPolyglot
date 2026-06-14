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
  body: { flex: 1, justifyContent: 'center', rowGap: 12 },
  eyebrow: {
    fontSize: type.eyebrow,
    fontWeight: '700',
    letterSpacing: type.eyebrowSpacing,
  },
  hero: { fontSize: type.wordHero, letterSpacing: type.wordHeroSpacing },
  pron: { fontSize: type.pron },
  gloss: { fontSize: type.body },
  controls: { marginTop: 24, rowGap: 16 },
});
