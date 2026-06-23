// useRecordingAllowed — GDPR record-affordance gate (D3c).
// Returns false (the safe default) until profile.getRecConsent() resolves true.
// Module E's record button and production cards' mic affordance MUST gate on this hook.
// Do NOT bypass: consent is personal-data protection, not just a preference.
import { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';

/**
 * Returns whether the user has granted recording consent.
 * - Synchronously returns `false` until the async check resolves (GDPR safe default).
 * - Re-reads on every mount (consent may be revoked in Settings between sessions).
 * - Module E's mic affordance must be rendered conditionally: `{allowed && <MicButton />}`.
 */
export function useRecordingAllowed(): boolean {
  const { profile } = useServices();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    profile.getRecConsent().then(
      (value) => {
        if (!cancelled) setAllowed(value);
      },
      () => {
        // On error, keep false (fail-safe GDPR default).
      },
    );
    return () => {
      cancelled = true;
    };
  }, [profile]);

  return allowed;
}
