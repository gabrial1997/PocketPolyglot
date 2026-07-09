// Screen — full-bleed scaffold (ports kit.jsx `Screen`). Fills the device content area,
// applies theme bg/ink, horizontal padding. RN: column flex by default.
import React from 'react';
import { View, SafeAreaView, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function Screen({
  children,
  pad = 24,
  style,
}: {
  children: React.ReactNode;
  pad?: number;
  style?: ViewStyle;
}): React.JSX.Element {
  const T = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: T.bg }, style]}>
      <View style={[styles.inner, { paddingHorizontal: pad }]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1 },
});
