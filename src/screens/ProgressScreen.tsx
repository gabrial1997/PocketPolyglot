// prog (Tier B) — coverage of the ~1,000 core words (WIRING_MAP §3, README 07).
// Data: { known, total } coverage. NOT a card. (No streaks — coverage is progress, not a game.)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { type, fonts, radii } from '../theme/tokens';

export function ProgressScreen({
  known = 0,
  total = 1000,
}: {
  known?: number;
  total?: number;
}): React.JSX.Element {
  const T = useTheme();
  const pct = total > 0 ? Math.round((known / total) * 100) : 0;
  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.head, { color: T.ink, fontFamily: fonts.headline }]}>
          {known} / {total} words
        </Text>
        <View style={[styles.track, { backgroundColor: T.sunken }]}>
          <View
            style={{
              width: `${pct}%`,
              height: '100%',
              backgroundColor: T.primary,
              borderRadius: radii.pill,
            }}
          />
        </View>
        <Text style={{ color: T.sub, fontSize: type.label }}>{pct}% of the core vocabulary</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', rowGap: 14 },
  head: { fontSize: 30, letterSpacing: -0.6 },
  track: { height: 10, borderRadius: 99, overflow: 'hidden', width: '100%' },
});
