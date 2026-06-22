// SettingsHost — Tier-B host for the Settings tab (WIRING_MAP §3). Pulls auth (name/email/sign-out),
// theme mode, and the ProfileService (GDPR consent), then renders the pure SettingsScreen.
import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '../auth/AuthProvider';
import { useThemeMode } from '../theme/ThemeProvider';
import { useServices } from '../services/ServiceProvider';
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
        void profile.deleteRecordings().catch(() => {});
      }}
      onSignOut={() => {
        void signOut();
      }}
    />
  );
}
