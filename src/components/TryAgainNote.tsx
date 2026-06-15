// TryAgainNote — shown after a WRONG multiple-choice pick. Per APP_HANDOFF.md (2026-06-15):
// wrong answers do NOT advance; encourage another try WITHOUT revealing the correct answer.
// Calm and non-punitive — no gamification. The chosen wrong option is reddened by the card;
// this is the prompt + a reset action.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { type } from '../theme/tokens';

export function TryAgainNote({ onRetry }: { onRetry?: () => void }): React.JSX.Element {
  const T = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.msg, { color: T.record }]}>Not quite — give it another try.</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={onRetry} hitSlop={8}>
          <Text style={[styles.action, { color: T.record }]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { rowGap: 4, alignItems: 'center' },
  msg: { fontSize: type.label },
  action: { fontSize: type.label, fontWeight: '700' },
});
