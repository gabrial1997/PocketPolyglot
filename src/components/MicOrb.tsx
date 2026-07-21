// MicOrb — the "audio out" record control (ports kit.jsx `MicOrb`). Toggles a rec state with a
// carmine fill + square stop glyph. Taps call onPress; parent wires to RecorderService via the
// card's onRecordStart/onRecordStop callbacks (WIRING_MAP §5 — never import recorder in card).
import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { useHaptics } from '../haptics';
import { hexA, sizing } from '../theme/tokens';

export function MicOrb({
  size = sizing.micOrb,
  rec = false,
  onPress,
}: {
  size?: number;
  rec?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const haptics = useHaptics();
  const REC = T.record; // '#C0485A'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rec ? 'Stop recording' : 'Record'}
      onPress={() => {
        // Confirm the state change by feel: Medium = "mic is live", Light = release.
        if (rec) haptics.recStop();
        else haptics.recStart();
        onPress?.();
      }}
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          // Derive the record tint from the record token (subtler in light) — never hardcode rgba
          // that drifts from T.record's actual hue.
          backgroundColor: rec ? hexA(REC, T.dark ? 0.14 : 0.07) : 'transparent',
          borderWidth: 1.5,
          borderColor: rec ? hexA(REC, 0.55) : T.hair,
        },
      ]}
    >
      {rec ? (
        <View
          style={{
            width: Math.round(size * 0.3),
            height: Math.round(size * 0.3),
            borderRadius: Math.round(size * 0.11),
            backgroundColor: REC,
          }}
        />
      ) : (
        <Svg width={Math.round(size * 0.36)} height={Math.round(size * 0.36)} viewBox="0 0 24 24">
          <Rect
            x="9"
            y="2.5"
            width="6"
            height="12"
            rx="3"
            fill="none"
            stroke={T.sub}
            strokeWidth={1.8}
          />
          <Path
            d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
            fill="none"
            stroke={T.sub}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </Svg>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  orb: { alignItems: 'center', justifyContent: 'center' },
});
