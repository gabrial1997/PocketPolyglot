// Expo app config (typed). Public env vars are read here and surfaced via extra/EXPO_PUBLIC_*.
// Supabase URL + anon key come from .env (see .env.example) — never bundle service keys.
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'PocketPolyglot',
  slug: 'pocketpolyglot',
  version: '0.1.2',
  orientation: 'portrait',
  scheme: 'pocketpolyglot',
  userInterfaceStyle: 'automatic', // light + dark both supported (kit.jsx ppTheme)
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.pocketpolyglot.app',
  },
  android: {
    package: 'com.pocketpolyglot.app',
  },
  plugins: ['expo-font'],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
};

export default config;
