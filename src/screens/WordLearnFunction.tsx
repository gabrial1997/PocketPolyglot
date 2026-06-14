// word/learn-function — grammatical-word first-exposure card: meaning via 3 example sentences,
// each independently playable (onPlay(exampleIndex)). Out: onComplete({ spoke:false }).
import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { CtaButton } from '../components';
import { CardShell } from './CardShell';
import { useTheme } from '../theme/ThemeProvider';
import { type } from '../theme/tokens';
import type { BaseCardProps } from './cardProps';

export function WordLearnFunction({ item, onPlay, onComplete }: BaseCardProps): React.JSX.Element {
  const T = useTheme();
  return (
    <CardShell eyebrow="New word" target={item.target} gloss={item.gloss} pron={item.pron}>
      {(item.examples ?? []).map((ex, i) => (
        <Pressable key={i} onPress={() => onPlay(i)} style={[styles.ex, { borderColor: T.hair }]}>
          <Text style={{ color: T.ink, fontSize: type.body }}>
            {ex.pre}
            <Text style={{ color: T.primary }}> {ex.w} </Text>
            {ex.post}
          </Text>
          <Text style={{ color: T.faint, fontSize: type.label }}>{ex.en}</Text>
        </Pressable>
      ))}
      <CtaButton
        title="First review tomorrow"
        onPress={() => onComplete({ itemId: item.id, cardKind: 'word/learn-function', spoke: false })}
      />
    </CardShell>
  );
}

const styles = StyleSheet.create({
  ex: { borderWidth: 1.5, borderRadius: 16, padding: 14, rowGap: 4 },
});
