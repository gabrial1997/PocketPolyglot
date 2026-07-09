// SettingsHost — Tier-B host for the Settings tab (WIRING_MAP §3). Pulls auth (name/email/sign-out),
// theme mode, and the ProfileService (GDPR consent), then renders the pure SettingsScreen.
import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '../auth/AuthProvider';
import { useThemeMode } from '../theme/ThemeProvider';
import { useServices } from '../services/ServiceProvider';
import { supabase } from '../services';
import { devNow, getOffsetDays, loadClockOffset, skipDay } from '../services/devClock';
import { resetProgress } from '../services/devTools';
import { SettingsScreen } from './SettingsScreen';

/** First-name from the user (mirrors navigation/index.tsx displayName; local copy avoids a cycle). */
function firstName(user: User | null): string | undefined {
  if (!user) return undefined;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const m = meta.name ?? meta.full_name ?? meta.display_name;
  if (typeof m === 'string' && m.trim()) return m.trim().split(' ')[0];
  const local = (user.email ?? '').split('@')[0]?.split('+')[0]?.replace(/[._-]+/g, ' ').trim() ?? '';
  if (!local) return undefined;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function SettingsHost(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const { mode, setMode } = useThemeMode();
  const { profile } = useServices();
  const [recConsent, setRecConsent] = useState(false);

  useEffect(() => {
    let active = true;
    void profile
      .getRecConsent()
      .then((v) => {
        if (active) setRecConsent(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [profile]);

  const appVersion = Constants.expoConfig?.version ?? '0.1.2';

  const [devOffset, setDevOffset] = useState(0);
  useEffect(() => {
    if (!__DEV__) return;
    void loadClockOffset().then(setDevOffset);
  }, []);

  // Surfaces a failed resetProgress() attempt in the dev UI (was a swallowed .catch — silently
  // leaving the learner believing a reset happened when it didn't). Cleared on the next successful
  // skip-day or reset.
  const [resetError, setResetError] = useState(false);

  // Surfaces a failed deleteRecordings() attempt (GDPR deletion) the same way — a swallowed .catch
  // would leave the learner believing their voice data was gone when it wasn't. Cleared on the
  // next successful delete.
  const [deleteRecordingsError, setDeleteRecordingsError] = useState(false);

  // Apple-mandated account deletion. A failed attempt at ANY step surfaces here as a retryable
  // row — never a silent partial delete, and never a sign-out on failure.
  const [deleteAccountError, setDeleteAccountError] = useState(false);

  const dev = __DEV__
    ? {
        simulatedDateLabel:
          devOffset === 0
            ? 'Today (real time)'
            : `${devNow().toDateString()} (+${devOffset} day${devOffset === 1 ? '' : 's'})`,
        offsetDays: devOffset,
        onSkipDay: () => {
          void skipDay().then((n) => {
            setDevOffset(n);
            setResetError(false);
          });
        },
        onResetProgress: () => {
          void resetProgress(supabase)
            .then(() => {
              setDevOffset(getOffsetDays());
              setResetError(false);
            })
            .catch(() => setResetError(true));
        },
        resetError,
      }
    : undefined;

  return (
    <SettingsScreen
      name={firstName(user)}
      email={user?.email ?? undefined}
      appVersion={appVersion}
      themeMode={mode}
      onSelectMode={setMode}
      recConsent={recConsent}
      onToggleConsent={(next) => {
        setRecConsent(next); // optimistic
        void profile.setRecConsent(next).catch(() => setRecConsent(!next));
      }}
      onDeleteRecordings={() => {
        void profile
          .deleteRecordings()
          .then(() => setDeleteRecordingsError(false))
          .catch(() => setDeleteRecordingsError(true));
      }}
      deleteRecordingsError={deleteRecordingsError}
      onDeleteAccount={() => {
        void (async () => {
          try {
            await profile.deleteRecordings(); // audio objects via the storage API first
            await profile.deleteAccount();    // auth user + cascaded rows (0018)
            setDeleteAccountError(false);
            await signOut();                  // local session teardown → auth screen
          } catch {
            setDeleteAccountError(true);
          }
        })();
      }}
      deleteAccountError={deleteAccountError}
      onSignOut={() => {
        void signOut();
      }}
      dev={dev}
    />
  );
}
