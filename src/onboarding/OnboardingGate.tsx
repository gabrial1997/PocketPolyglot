// OnboardingGate — profile ensure + diacritic once-only screen (D3c).
// Sits between AuthGate (user is signed-in) and Root (the tab shell).
// State machine: loading → orientation (if !seenDiacritics) → children.
// Consent is NOT a blocking onboarding step — it gates only the record affordance,
// surfaced contextually via useRecordingAllowed (also in this module).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useServices } from '../services/ServiceProvider';
import { DiacriticOrientationScreen } from '../screens/DiacriticOrientationScreen';

export interface OnboardingGateProps {
  children: React.ReactNode;
}

type GateState = 'loading' | 'orientation' | 'done';

/**
 * Wraps the signed-in app shell. On mount:
 * 1. Calls `profile.ensureProfile()` — creates the DB row if the trigger missed it.
 * 2. Calls `profile.getProfile()` — reads seenDiacritics.
 * 3. If `!seenDiacritics` → shows DiacriticOrientationScreen once.
 * 4. After "Got it" (or immediately for returning users) → renders children.
 */
export function OnboardingGate({ children }: OnboardingGateProps): React.JSX.Element {
  const { profile } = useServices();
  const [state, setState] = useState<GateState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // ensureProfile MUST be called before getProfile so new accounts have a row.
        await profile.ensureProfile();
        const snap = await profile.getProfile();
        if (cancelled) return;
        if (!snap || !snap.seenDiacritics) {
          setState('orientation');
        } else {
          setState('done');
        }
      } catch {
        // On error, advance to done — don't block the learner indefinitely.
        if (!cancelled) setState('done');
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (state === 'loading') {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (state === 'orientation') {
    return (
      <DiacriticOrientationScreen
        onDismiss={() => {
          // Fire-and-forget: setSeenDiacritics merges the flag; don't block on it.
          void profile.setSeenDiacritics();
          setState('done');
        }}
      />
    );
  }

  // state === 'done': render the tab shell
  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#888',
  },
});
