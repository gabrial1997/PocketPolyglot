// HapticsProvider — semantic haptic triggers + the persisted on/off preference (pp.hapticsEnabled,
// AsyncStorage, same guarded pattern as ThemeProvider's MODE_KEY). Haptics are a UI-tier concern
// (same tier as useTheme): cards may call useHaptics() directly.
//
// Vocabulary is LOCKED (spec 2026-07-21): confirmation, not celebration — Light/Medium impacts,
// Error on a wrong pick, and ONE Success beat on phrase unlock (the app's single celebratory
// moment, DECISIONS.md). No Heavy anywhere. Every trigger is fire-and-forget: disabled / web /
// simulator / native rejection must never throw or affect flow.
//
// Unlike useTheme (which throws outside its provider), useHaptics degrades to an always-on
// default: pure-card tests and previews render cards without app chrome, and a missing haptic
// is optional feedback, not missing data.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const ENABLED_KEY = 'pp.hapticsEnabled';

export interface HapticTriggers {
  /** Correct MC pick — quiet tick (Light impact). */
  correct: () => void;
  /** Wrong MC pick + Try again — firm "not quite" (Error notification). */
  wrong: () => void;
  /** Phrase unlock, synced with the chime — the one celebratory beat (Success notification). */
  unlock: () => void;
  /** Mic started — clear "mic is live" (Medium impact). */
  recStart: () => void;
  /** Mic stopped — soft release (Light impact). */
  recStop: () => void;
}

export interface HapticsContextValue extends HapticTriggers {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
}

/** Build the trigger set. `isEnabled` is read per-fire so a stale closure never ignores the toggle. */
export function createTriggers(isEnabled: () => boolean): HapticTriggers {
  const fire = (go: () => Promise<void>): void => {
    if (!isEnabled() || Platform.OS === 'web') return;
    try {
      void go().catch(() => {});
    } catch {
      /* haptics must never affect flow */
    }
  };
  return {
    correct: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
    wrong: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
    unlock: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
    recStart: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
    recStop: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  };
}

const defaultValue: HapticsContextValue = {
  ...createTriggers(() => true),
  enabled: true,
  setEnabled: () => {},
};

const HapticsContext = createContext<HapticsContextValue>(defaultValue);

export function HapticsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [enabled, setEnabledState] = useState(true);
  const enabledRef = useRef(true);
  enabledRef.current = enabled;

  // Hydrate the persisted preference once. Guarded so a missing/!ready storage never throws.
  useEffect(() => {
    let active = true;
    try {
      void AsyncStorage.getItem(ENABLED_KEY)
        .then((v) => {
          if (active && v === 'off') setEnabledState(false);
        })
        .catch(() => {});
    } catch {
      /* storage unavailable — keep the default (on) */
    }
    return () => {
      active = false;
    };
  }, []);

  // Trigger identity must stay stable across toggle flips: `unlock` sits in
  // useReviewCardHandlers' useMemo deps, and PhraseUnlock re-fires its onUnlocked effect
  // whenever the reference it received changes. Build the triggers once (they read
  // enabledRef per fire, so they're functionally correct regardless), and only rebuild the
  // toggle state below.
  const triggers = useMemo(() => createTriggers(() => enabledRef.current), [enabledRef]);

  const value = useMemo<HapticsContextValue>(() => {
    const setEnabled = (next: boolean): void => {
      setEnabledState(next);
      try {
        void AsyncStorage.setItem(ENABLED_KEY, next ? 'on' : 'off').catch(() => {});
      } catch {
        /* best-effort persistence */
      }
    };
    return { ...triggers, enabled, setEnabled };
  }, [triggers, enabled]);

  return <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>;
}

/** Read the haptic triggers (+ toggle). Safe outside the provider — falls back to always-on. */
export function useHaptics(): HapticsContextValue {
  return useContext(HapticsContext);
}
