// home (Tier B) — session entry (WIRING_MAP §3, README 01).
// LOCKED CONSTRAINT: no streaks, no confetti, no gamification. Greeting + due counts + start CTA.
// Data: due summary { newCount, reviewCount } from the controller (NOT a ReviewItem/CardResult).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, CtaButton } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { type, fonts } from '../theme/tokens';

export function HomeScreen({
  greeting = 'Labrīt',
  newCount = 0,
  reviewCount = 0,
  onStart,
}: {
  greeting?: string;
  newCount?: number;
  reviewCount?: number;
  onStart?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.greeting, { color: T.ink, fontFamily: fonts.headline }]}>
          {greeting}
        </Text>
        <View style={styles.counts}>
          <Text style={{ color: T.sub, fontSize: type.body }}>{newCount} new</Text>
          <Text style={{ color: T.sub, fontSize: type.body }}>{reviewCount} to review</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <CtaButton title="Start session" onPress={onStart} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', rowGap: 16 },
  greeting: { fontSize: 40, letterSpacing: -0.8 },
  counts: { rowGap: 6 },
  footer: { paddingBottom: 24 },
});
