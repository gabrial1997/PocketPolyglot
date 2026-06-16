// AuthProvider — minimal Supabase email + password auth context for the app.
// Seeds the session on mount, subscribes to auth state changes, and exposes the
// sign-in / sign-up / sign-out actions. Wired into App by the founder (not here).
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

/** Result of a sign-up: an error message, plus whether email confirmation is pending
 *  (Supabase returns no session until the user confirms, when confirmations are on). */
interface SignUpResult {
  error: string | null;
  confirmationRequired: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Seed from any persisted session; stop the loading gate once resolved. Always clear the
    // loading gate — even on a rejected getSession (transient network / storage error at cold
    // start) — so AuthGate falls through to sign-in instead of hanging on "Loading…" forever.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch(() => {
        // Leave session null; the onAuthStateChange subscription will correct it if a session exists.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Keep in sync with sign-in / sign-out / token refresh events.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signInWithPassword: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        // When email confirmation is on, Supabase returns no session until the user
        // confirms; surface that so the screen can prompt them to check their inbox.
        return {
          error: error?.message ?? null,
          confirmationRequired: !error && !data.session,
        };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook to read the auth context. Throws if used outside an AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
