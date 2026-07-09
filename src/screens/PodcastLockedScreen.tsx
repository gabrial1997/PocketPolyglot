// pod (locked) — Tier-B gate for the Listen tab (spec 2026-07-09 §1). Pure: data-in/events-out,
// no service imports. Visual language mirrors PhraseLocked (dimmed subject + quiet lock hint):
// locking must read as ONE system. Copy is coverage-framed and calm — no gamification, no time
// claims (locked brand rules).
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { CardIcon, Eyebrow } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, type } from '../theme/tokens';

export interface PodcastLockedScreenProps {
  /** Whole-number coverage percent (0–24 while locked). */
  pct: number;
  /** Navigates back to the Today tab. Omitted ⇒ the action is hidden. */
  onKeepLearning?: () => void;
}

export function PodcastLockedScreen({ pct, onKeepLearning }: PodcastLockedScreenProps): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <View style={styles.head}>
        <Eyebrow>Listen</Eyebrow>
      </View>

      <View style={styles.body}>
        <View style={styles.hintRow}>
          <CardIcon name="lock" size={15} color={T.faint} />
          <Text style={[styles.title, { color: T.ink, fontFamily: fonts.headline }]}>
            Podcasts unlock at 25%
          </Text>
        </View>

        <Text style={[styles.copy, { color: T.sub }]}>
          Episodes are built from words you already know. Once you can follow a quarter of
          everyday speech, listening starts to make sense.
        </Text>

        <Text style={[styles.coverage, { color: T.faint }]}>
          You can follow {pct}% of everyday speech so far.
        </Text>
        {/* Same thin-track treatment as Home's coverage bar: track = hairline tint, fill = primary. */}
        <View style={[styles.track, { backgroundColor: T.hair }]}>
          <View
            style={[styles.fill, { backgroundColor: T.primary, width: `${Math.min(100, Math.max(0, pct))}%` }]}
          />
        </View>
      </View>

      {onKeepLearning ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep learning"
          onPress={onKeepLearning}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: T.faint }]}>Keep learning</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: 6, alignItems: 'flex-start' },
  body: { flex: 1, justifyContent: 'center', paddingBottom: 60, rowGap: 14 },
  hintRow: { flexDirection: 'row', alignItems: 'center', columnGap: 10 },
  title: { fontSize: 26, letterSpacing: -0.2 },
  copy: { fontSize: type.body, lineHeight: 23, maxWidth: 320 },
  coverage: { fontSize: 13.5, marginTop: 10 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: 4, borderRadius: 2 },
  action: { paddingBottom: 30, paddingTop: 8, alignItems: 'center' },
  actionText: { fontSize: 14.5, fontWeight: '600' },
});
