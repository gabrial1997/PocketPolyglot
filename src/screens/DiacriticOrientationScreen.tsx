// DiacriticOrientationScreen — non-gating explainer of Latvian diacritics (Module D2b).
// Pure presentational: data-in / events-out. No service import, no fetch.
// Single "Got it" button → onDismiss(). NOT a card; NOT in CARD_REGISTRY or renderFor.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Screen, CtaButton } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, type, radii } from '../theme/tokens';

export interface DiacriticOrientationScreenProps {
  onDismiss: () => void;
}

interface GlyphRow {
  glyphs: string;
  approx: string;
  note: string;
}

const GLYPH_ROWS: GlyphRow[] = [
  { glyphs: 'ā  ē  ī  ū', approx: 'long vowels', note: 'The line means you hold the vowel a beat longer.' },
  { glyphs: 'č  š  ž', approx: 'ch  sh  zh', note: 'Like "church", "show", "measure".' },
  { glyphs: 'ģ  ķ  ļ  ņ', approx: 'soft variants', note: 'The cedilla softens the consonant, like a "y" blended in.' },
];

export function DiacriticOrientationScreen({ onDismiss }: DiacriticOrientationScreenProps): React.JSX.Element {
  const T = useTheme();

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heading */}
        <Text style={[styles.heading, { color: T.ink, fontFamily: fonts.headline }]}>
          Latvian letters
        </Text>

        {/* Intro body */}
        <Text style={[styles.body, { color: T.sub }]}>
          Latvian uses a few accented characters that carry meaning. Here is a quick map — you
          will see these throughout the app.
        </Text>

        {/* Glyph grid */}
        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.hair }]}>
          {GLYPH_ROWS.map((row, i) => (
            <View
              key={row.glyphs}
              style={[
                styles.glyphRow,
                i < GLYPH_ROWS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.hair },
              ]}
            >
              <Text style={[styles.glyphs, { color: T.ink, fontFamily: fonts.headline }]}>
                {row.glyphs}
              </Text>
              <Text style={[styles.approx, { color: T.primary }]}>{row.approx}</Text>
              <Text style={[styles.note, { color: T.sub }]}>{row.note}</Text>
            </View>
          ))}
        </View>

        {/* Reassurance */}
        <Text style={[styles.reassurance, { color: T.sub }]}>
          Getting these slightly off at first is completely fine. The app will give you time to
          build familiarity — no mastery check here.
        </Text>

        {/* CTA */}
        <View style={styles.cta}>
          <CtaButton title="Got it" onPress={onDismiss} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  heading: {
    fontSize: 34,
    letterSpacing: -0.2,
    lineHeight: 40,
    marginTop: 12,
    marginBottom: 14,
  },
  body: {
    fontSize: type.body,
    lineHeight: 24,
    marginBottom: 24,
  },
  card: {
    borderRadius: radii.surface,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 20,
  },
  glyphRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    rowGap: 4,
  },
  glyphs: {
    fontSize: 26,
    letterSpacing: 2,
    lineHeight: 34,
  },
  approx: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  note: {
    fontSize: type.label,
    lineHeight: 19,
  },
  reassurance: {
    fontSize: type.body,
    lineHeight: 24,
    marginBottom: 32,
  },
  cta: {
    marginTop: 4,
  },
});
