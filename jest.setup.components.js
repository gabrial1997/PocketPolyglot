/* eslint-env jest */
// Setup for the jest-expo "components" project. Mock AsyncStorage so any module that imports the
// supabase client (which uses AsyncStorage as its auth session store) can be required in tests
// without the native module present.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock expo-audio (SDK 54): its native module touches `prototype` at import time, which throws
// under jest. ExpoAudioService is a thin native wrapper with no unit tests of its own; modules that
// transitively import it (e.g. the supabase service bundle → navigation) just need it to load.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    shouldCorrectPitch: true,
    setPlaybackRate: jest.fn(),
    addListener: jest.fn(),
    play: jest.fn(),
    remove: jest.fn(),
  })),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
