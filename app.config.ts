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
  icon: './assets/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.pocketpolyglot.app',
    buildNumber: '1',
    infoPlist: {
      // App-Review-facing: plain language, matches the consent screen's promise.
      NSMicrophoneUsageDescription:
        'PocketPolyglot records your voice only when you practice pronunciation, so you can compare your attempt with a native speaker.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.pocketpolyglot.app',
  },
  plugins: [
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#F6F1E7',
        dark: { backgroundColor: '#0E1116' },
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
};

export default config;
