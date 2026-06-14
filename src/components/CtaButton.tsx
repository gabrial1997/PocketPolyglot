// CtaButton — primary full-width call to action (README "Primary CTA": h56, radius18).
// Filled with the accent primary; the start-session button on Home and "Continue" on cards.
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radii, sizing, type } from '../theme/tokens';

export function CtaButton({
  title,
  onPress,
  variant = 'filled',
  disabled = false,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'filled' | 'outline';
  disabled?: boolean;
}): React.JSX.Element {
  const T = useTheme();
  const filled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
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
      <Text style={[styles.text, { color: filled ? T.onPrimary : T.primary }]}>{title}</Text>
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
  text: { fontSize: type.body, fontWeight: '600' },
});
