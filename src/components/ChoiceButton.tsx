// ChoiceButton — multiple-choice option (the LOCKED wrong-answer rule, APP_HANDOFF/CLAUDE.md).
// idle -> surface card; correct -> green + check; wrong -> carmine fill + carmine text (chosen only;
// the correct option is NEVER auto-revealed); faded -> dimmed. Disabled after first pick. Pure.
//
// 2026-06-18 VISUAL SYNC: idle now uses the surface fill + soft shadow (mockup list choices are
// white cards, not transparent); wrong now fills carmine-soft with carmine text (was border-only).
import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, radii, sizing, type } from '../theme/tokens';

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

  const borderColor = isCorrect ? hexA(T.good, 0.5) : isWrong ? hexA(T.record, 0.45) : T.hair;
  const bg = isCorrect ? T.goodSoft : isWrong ? hexA(T.record, T.dark ? 0.12 : 0.07) : T.surface;
  const labelColor = isWrong ? T.record : isCorrect ? T.good : T.ink;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        { borderColor, backgroundColor: bg, opacity: isFaded ? 0.4 : 1 },
        state === 'idle' ? T.shadow : null,
      ]}
    >
      <View style={styles.labelWrap}>
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
        {gloss ? <Text style={[styles.gloss, { color: T.sub }]}>{gloss}</Text> : null}
      </View>
      {isCorrect ? (
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path d="M5 12.5l4.5 4.5L19 6.5" fill="none" stroke={T.good} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
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
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  labelWrap: { flexDirection: 'row', alignItems: 'baseline', columnGap: 8, flexShrink: 1 },
  label: { fontSize: type.body, fontWeight: '600' },
  gloss: { fontSize: type.label },
});
