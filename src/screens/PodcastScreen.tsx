// pod (Tier B) — AI podcast player (WIRING_MAP §3, README 06).
// Data: a generated episode (audio URL + transcript) built from known words. NOT a card.
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, PlayOrb, CtaButton } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { type, fonts } from '../theme/tokens';

export function PodcastScreen({
  title = 'Today’s episode',
  transcript,
  onPlay,
}: {
  title?: string;
  transcript?: string;
  onPlay?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const [showTranscript, setShowTranscript] = useState(false);
  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.title, { color: T.ink, fontFamily: fonts.headline }]}>{title}</Text>
        <PlayOrb onPress={onPlay} />
        <CtaButton
          title={showTranscript ? 'Hide transcript' : 'Show transcript'}
          variant="outline"
          onPress={() => setShowTranscript((v) => !v)}
        />
        {showTranscript && transcript ? (
          <Text style={{ color: T.sub, fontSize: type.body }}>{transcript}</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', rowGap: 16 },
  title: { fontSize: 32, letterSpacing: -0.6 },
});
