// Supabase client singleton. Reads URL + anon key from Expo config extra (app.config.ts).
// Anon key is safe for the client — RLS protects data (database-schema-seed §6).
// Cards never import this; only services/controller do (BACKEND_INTEGRATION §5).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const url = extra.supabaseUrl ?? '';
const anonKey = extra.supabaseAnonKey ?? '';

if (!url || !anonKey) {
  // Non-fatal in scaffold: warn so the founder knows to fill .env before wiring data.
  // eslint-disable-next-line no-console
  console.warn('[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY not set — see .env.example');
}

// Fall back to a syntactically-valid placeholder when unset so createClient() doesn't throw at
// import (which would crash the app on launch); the warning above tells the founder to fill .env.
// The client is unusable until configured, but auth/RLS deny anyway, so nothing leaks.
export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage, // persist the session in RN (no localStorage on native)
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // RN has no URL to parse the session from
    },
  },
);
