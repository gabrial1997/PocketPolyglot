// ChoiceButton — multiple-choice option (README "Multiple choice" behaviour).
// State: idle -> after pick, correct turns green+check, wrong turns carmine, others fade.
// Disabled after first pick. Pure: parent owns which is picked; this just renders + reports.
import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { radii, sizing, type } from '../theme/tokens';

export type ChoiceState = 'idle' | 'correct' | 'wrong' | 'faded';

export function ChoiceButton({
  label,
  gloss,
  state = 'idle',
  disabled = false,
  onPress,
}: {
  label: string;
  gloss?: string;
  state?: ChoiceState;
  disabled?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const isCorrect = state === 'correct';
  const isWrong = state === 'wrong';
  const isFaded = state === 'faded';

  const borderColor = isCorrect ? T.good : isWrong ? T.record : T.hair;
  const bg = isCorrect ? T.goodSoft : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        { borderColor, backgroundColor: bg, opacity: isFaded ? 0.4 : 1 },
      ]}
    >
      <View style={styles.labelWrap}>
        <Text style={[styles.label, { color: T.ink }]}>{label}</Text>
        {gloss ? <Text style={[styles.gloss, { color: T.sub }]}>{gloss}</Text> : null}
      </View>
      {isCorrect ? (
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M5 12.5l4.5 4.5L19 6.5"
            fill="none"
            stroke={T.good}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: sizing.choiceMinHeight,
    borderRadius: radii.choice,
    borderWidth: sizing.choiceBorder,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelWrap: { flexDirection: 'row', alignItems: 'baseline', columnGap: 8, flexShrink: 1 },
  label: { fontSize: type.body, fontWeight: '500' },
  gloss: { fontSize: type.label },
});
