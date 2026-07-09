// Shared async states for the Tier-B hosts (home / pod / prog — WIRING_MAP §3). Mirrors
// SessionHost's neutral-placeholder pattern: while a host fetches, show a calm spinner — never
// fabricated defaults ("progress = honest coverage" is locked); on failure, a restrained,
// retryable error instead of silently rendering fake data.
import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { type } from '../theme/tokens';

/** Neutral full-screen loading placeholder for a Tier-B host fetch. */
export function HostLoading(): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <View style={styles.center}>
        <ActivityIndicator color={T.faint} accessibilityLabel="Loading" />
      </View>
    </Screen>
  );
}

/** Restrained, retryable error state — encouraging tone, no fake data behind it. */
export function HostError({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={[styles.message, { color: T.sub }]}>
          Couldn’t load this right now. Check your connection and give it another try.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={[styles.retry, { borderColor: T.hair }]}
        >
          <Text style={[styles.retryText, { color: T.primary }]}>Try again</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', rowGap: 18, paddingHorizontal: 24 },
  message: { fontSize: type.body, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  retry: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 99, borderWidth: 1 },
  retryText: { fontSize: type.body, fontWeight: '600' },
});
