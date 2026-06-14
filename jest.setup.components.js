/* eslint-env jest */
// Setup for the jest-expo "components" project. Mock AsyncStorage so any module that imports the
// supabase client (which uses AsyncStorage as its auth session store) can be required in tests
// without the native module present.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
