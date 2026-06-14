// PlayOrb — circular audio play control (ports kit.jsx `PlayOrb`). Audio is the hero, so the
// control is generous (size x1.15). Taps call onPress; the parent wires it to AudioService via
// the card's onPlay callback (WIRING_MAP §5 — never import audio in the card).
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

export function PlayOrb({
  size = 76,
  playing = false,
  filled = true,
  onPress,
  label,
}: {
  size?: number;
  playing?: boolean;
  filled?: boolean;
  onPress?: () => void;
  label?: string;
}): React.JSX.Element {
  const T = useTheme();
  const s = Math.round(size * 1.15);
  const glyph = filled ? T.onPrimary : T.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Play'}
      onPress={onPress}
      style={[
        styles.orb,
        {
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: filled ? T.primary : 'transparent',
          borderWidth: filled ? 0 : 1.5,
          borderColor: T.primary,
          shadowColor: T.primary,
          shadowOpacity: filled ? (T.dark ? 0.4 : 0.28) : 0,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 8 },
          elevation: filled ? 6 : 0,
        },
      ]}
    >
      <Svg width={s * 0.36} height={s * 0.36} viewBox="0 0 24 24">
        {playing ? (
          <>
            <Rect x="5" y="3.5" width="5" height="17" rx="1.6" fill={glyph} />
            <Rect x="14" y="3.5" width="5" height="17" rx="1.6" fill={glyph} />
          </>
        ) : (
          <Path
            d="M6 4.5v15a1 1 0 0 0 1.5.87l12-7.5a1 1 0 0 0 0-1.74l-12-7.5A1 1 0 0 0 6 4.5z"
            fill={glyph}
          />
        )}
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  orb: { alignItems: 'center', justifyContent: 'center' },
});
