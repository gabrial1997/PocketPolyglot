// ThemeProvider — supplies the active Theme (light/dark + accent) via context.
// Tracks the OS colour scheme; accent defaults to 'nordic' (locked). See tokens.ts.
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { ppTheme, type AccentName, type Theme, DEFAULT_ACCENT } from './tokens';

interface ThemeContextValue {
  theme: Theme;
  accent: AccentName;
  setAccent: (a: AccentName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const scheme = useColorScheme();
  const [accent, setAccent] = useState<AccentName>(DEFAULT_ACCENT);
  const dark = scheme === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: ppTheme(dark, accent), accent, setAccent }),
    [dark, accent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook to read the active theme. Throws if used outside ThemeProvider. */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx.theme;
}

/** Hook to read/set the accent preset. */
export function useAccent(): Pick<ThemeContextValue, 'accent' | 'setAccent'> {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAccent must be used within a ThemeProvider');
  return { accent: ctx.accent, setAccent: ctx.setAccent };
}
