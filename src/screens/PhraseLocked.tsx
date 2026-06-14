// phrase/locked — gating UI (BACKEND_INTEGRATION §4). Phrase visible but greyed; unlocks only
// when its component words are all known (controller decides via KnownWordsStore). No CardResult.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CardShell } from './CardShell';
import { useTheme } from '../theme/ThemeProvider';
import { type } from '../theme/tokens';
import type { PhraseGateProps } from './cardProps';

export function PhraseLocked({ item }: PhraseGateProps): React.JSX.Element {
  const T = useTheme();
  return (
    <CardShell eyebrow="Locked phrase">
      <View style={styles.body}>
        <Text style={{ color: T.faint, fontSize: type.body }}>{item.target}</Text>
        <Text style={{ color: T.faint, fontSize: type.label }}>
          Unlocks when you know its words.
        </Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({ body: { rowGap: 6 } });
