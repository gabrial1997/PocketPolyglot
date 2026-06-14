// Supabase client singleton. Reads URL + anon key from Expo config extra (app.config.ts).
// Anon key is safe for the client — RLS protects data (database-schema-seed §6).
// Cards never import this; only services/controller do (BACKEND_INTEGRATION §5).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
