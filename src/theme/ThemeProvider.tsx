// ThemeProvider — supplies the active Theme (light/dark + accent) via context.
// Theme mode is user-controllable: 'system' follows the OS, 'light'/'dark' override it.
// The choice persists across launches (AsyncStorage). Accent defaults to 'nordic' (locked).
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ppTheme, type AccentName, type Theme, DEFAULT_ACCENT } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';
const MODE_KEY = 'pp.themeMode';

interface ThemeContextValue {
  theme: Theme;
  accent: AccentName;
  setAccent: (a: AccentName) => void;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  dark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const scheme = useColorScheme();
  const [accent, setAccent] = useState<AccentName>(DEFAULT_ACCENT);
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Hydrate the persisted mode once. Guarded so a missing/!ready storage never throws.
  useEffect(() => {
    let active = true;
    try {
      void AsyncStorage.getItem(MODE_KEY)
        .then((v) => {
          if (active && (v === 'light' || v === 'dark' || v === 'system')) setModeState(v);
        })
        .catch(() => {});
    } catch {
      /* storage unavailable — keep the default */
    }
    return () => {
      active = false;
    };
  }, []);

  const setMode = (m: ThemeMode): void => {
    setModeState(m);
    try {
      void AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
    } catch {
      /* best-effort persistence */
    }
  };

  const dark = mode === 'system' ? scheme === 'dark' : mode === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: ppTheme(dark, accent), accent, setAccent, mode, setMode, dark }),
    [dark, accent, mode],
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

/** Hook to read/set the light/dark mode (and the resolved `dark` flag). */
export function useThemeMode(): Pick<ThemeContextValue, 'mode' | 'setMode' | 'dark'> {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeProvider');
  return { mode: ctx.mode, setMode: ctx.setMode, dark: ctx.dark };
}
