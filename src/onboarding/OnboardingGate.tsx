// OnboardingGate — profile ensure + diacritic once-only screen + consent explainer (D3c, Task 5).
// Sits between AuthGate (user is signed-in) and Root (the tab shell).
// State machine: loading → orientation (if !seenDiacritics) → consent (if !seenConsent) → done.
// Consent is a one-time onboarding STEP (GDPR/App-Review): every learner sees the explainer
// exactly once and decides accept/decline before reaching the tab shell. Once decided
// (accept OR decline), `useRecordingAllowed` (also in this module) is what continues to gate
// the record affordance contextually thereafter — it does not re-show this screen.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useServices } from '../services/ServiceProvider';
import { useTheme } from '../theme/ThemeProvider';
import { DiacriticOrientationScreen } from '../screens/DiacriticOrientationScreen';
import { ConsentScreen } from '../screens/ConsentScreen';
import { useSetReportScreen } from '../components/BugReportLayer';

export interface OnboardingGateProps {
  children: React.ReactNode;
}

type GateState = 'loading' | 'orientation' | 'consent' | 'done';

/**
 * Wraps the signed-in app shell. On mount:
 * 1. Calls `profile.ensureProfile()` — creates the DB row if the trigger missed it.
 * 2. Calls `profile.getProfile()` — reads seenDiacritics + seenConsent.
 * 3. If `!seenDiacritics` → shows DiacriticOrientationScreen once, then falls through to step 4.
 * 4. If `!seenConsent` → shows ConsentScreen once (accept or decline both count as "decided").
 * 5. Renders children once both are seen (or immediately for a fully returning user).
 */
export function OnboardingGate({ children }: OnboardingGateProps): React.JSX.Element {
  const { profile } = useServices();
  const T = useTheme();
  const [state, setState] = useState<GateState>('loading');
  // Set alongside the initial state decision so orientation's onDismiss knows whether to route
  // to 'consent' or 'done' next — the snapshot itself isn't kept in state.
  const seenConsentNeeded = useRef(false);
  const setReportScreen = useSetReportScreen();
  useEffect(() => { setReportScreen('onboarding'); }, [setReportScreen]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // ensureProfile MUST be called before getProfile so new accounts have a row.
        await profile.ensureProfile();
        const snap = await profile.getProfile();
        if (cancelled) return;
        seenConsentNeeded.current = !snap || !snap.seenConsent;
        const next: GateState = !snap || !snap.seenDiacritics
          ? 'orientation'
          : !snap.seenConsent
            ? 'consent'
            : 'done';
        setState(next);
      } catch {
        // On error, advance to done — don't block the learner indefinitely. Consent stays
        // fail-closed off (setConsent was never called), matching the GDPR safe default.
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
        <Text style={[styles.loadingText, { color: T.sub }]}>Loading…</Text>
      </View>
    );
  }

  if (state === 'orientation') {
    return (
      <DiacriticOrientationScreen
        onDismiss={() => {
          // Fire-and-forget: setSeenDiacritics merges the flag; don't block on it.
          void profile.setSeenDiacritics();
          setState(seenConsentNeeded.current ? 'consent' : 'done');
        }}
      />
    );
  }

  if (state === 'consent') {
    return (
      <ConsentScreen
        onAccept={({ training }) => {
          // Fire-and-forget like the diacritics flag — never strand the learner on a slow write.
          void profile.setConsent({ rec: true, training });
          void profile.setSeenConsent();
          setState('done');
        }}
        onDecline={() => {
          // rec_consent stays default-off (fail-closed); we only record that they decided.
          void profile.setSeenConsent();
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
    // color is applied via useTheme() inline to respect light/dark (T.sub)
  },
});
