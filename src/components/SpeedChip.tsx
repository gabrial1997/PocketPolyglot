// SpeedChip — slow-down-only speed control (ports kit.jsx `SpeedChip`).
// Cycles 1x -> 0.75x -> 0.5x -> 1x. Never above 1x. Tints when slowed (legible state).
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, type } from '../theme/tokens';

const STEPS = [1, 0.75, 0.5] as const;
export type Speed = (typeof STEPS)[number];

function label(v: Speed): string {
  return v === 1 ? '1×' : v === 0.75 ? '0.75×' : '0.5×';
}

export function SpeedChip({
  value = 1,
  onChange,
}: {
  value?: Speed;
  onChange?: (next: Speed) => void;
}): React.JSX.Element {
  const T = useTheme();
  const idx = STEPS.indexOf(value);
  const next = STEPS[(idx + 1) % STEPS.length] ?? 1;
  const slowed = value < 1;
  const color = slowed ? T.primary : T.faint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Speech speed ${value}×, tap to change`}
      onPress={() => onChange?.(next)}
      style={[
        styles.chip,
        {
          backgroundColor: slowed ? T.primarySoft : 'transparent',
          borderColor: slowed ? hexA(T.primary, 0.45) : T.hair,
        },
      ]}
    >
      <Svg width={15} height={15} viewBox="0 0 24 24">
        <Path
          d="M4 16.5a8.5 8.5 0 0 1 16 0"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <Path d="M12 16.5L8 13.5" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <Circle cx="12" cy="16.5" r="1.2" fill={color} />
      </Svg>
      <Text style={[styles.text, { color }]}>{label(value)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 7,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 99,
    borderWidth: 1.5,
  },
  text: { fontSize: type.label, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
