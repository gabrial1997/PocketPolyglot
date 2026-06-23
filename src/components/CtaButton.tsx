// CtaButton — primary full-width call to action (README "Primary CTA": h56, radius18).
// Filled with the accent primary; the start-session button on Home and "Continue" on cards.
import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radii, sizing } from '../theme/tokens';

export function CtaButton({
  title,
  onPress,
  variant = 'filled',
  disabled = false,
  icon,
  testID,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'filled' | 'outline';
  disabled?: boolean;
  /** Optional leading glyph (e.g. a play icon), rendered before the title. */
  icon?: React.ReactNode;
  /** Optional testID for integration / unit tests. */
  testID?: string;
}): React.JSX.Element {
  const T = useTheme();
  const filled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        styles.btn,
        {
          backgroundColor: filled ? T.primary : 'transparent',
          borderWidth: filled ? 0 : 1.5,
          borderColor: T.primary,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text style={[styles.text, { color: filled ? T.onPrimary : T.primary }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: sizing.ctaHeight,
    borderRadius: radii.cta,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: 8 },
  text: { fontSize: 17, fontWeight: '600' },
});
