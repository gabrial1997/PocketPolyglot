// SignInScreen behavior tests — exercises the email-OTP two-step flow over a mocked
// supabase client. The client module is mocked so native AsyncStorage never loads and
// we control the auth calls. Wrap in <ThemeProvider><AuthProvider> as the app does.
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AuthProvider } from './AuthProvider';
import { SignInScreen } from './SignInScreen';
import { supabase } from '../services/supabaseClient';

jest.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signInWithOtp: jest.fn(async () => ({ data: {}, error: null })),
      verifyOtp: jest.fn(async () => ({ data: {}, error: null })),
      signOut: jest.fn(async () => ({ error: null })),
    },
  },
}));

// Typed handle on the mocked auth methods so we can assert / reprogram them per test.
const authMock = supabase.auth as unknown as {
  getSession: jest.Mock;
  signInWithOtp: jest.Mock;
  verifyOtp: jest.Mock;
};

function renderScreen() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SignInScreen />
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  authMock.getSession.mockResolvedValue({ data: { session: null } });
  authMock.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  authMock.verifyOtp.mockResolvedValue({ data: {}, error: null });
});

describe('SignInScreen', () => {
  it('renders the email step first', async () => {
    const u = renderScreen();
    expect(u.getByText('Sign in')).toBeTruthy();
    expect(u.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(u.getByText('Send code')).toBeTruthy();
    // Let the async getSession() seed settle so its state update is flushed inside act().
    await waitFor(() => expect(authMock.getSession).toHaveBeenCalled());
  });

  it('sends the code and advances to the code step', async () => {
    const u = renderScreen();
    fireEvent.changeText(u.getByPlaceholderText('you@example.com'), 'a@b.com');
    fireEvent.press(u.getByText('Send code'));

    expect(await u.findByText('Verify')).toBeTruthy();
    expect(authMock.signInWithOtp).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(u.getByPlaceholderText('123456')).toBeTruthy();
  });

  it('verifies the entered code with the email + type', async () => {
    const u = renderScreen();
    fireEvent.changeText(u.getByPlaceholderText('you@example.com'), 'a@b.com');
    fireEvent.press(u.getByText('Send code'));

    const codeInput = await u.findByPlaceholderText('123456');
    fireEvent.changeText(codeInput, '654321');
    fireEvent.press(u.getByText('Verify'));

    await waitFor(() =>
      expect(authMock.verifyOtp).toHaveBeenCalledWith({
        email: 'a@b.com',
        token: '654321',
        type: 'email',
      }),
    );
  });

  it('renders the error message when signInWithOtp fails', async () => {
    authMock.signInWithOtp.mockResolvedValue({ data: {}, error: { message: 'boom' } });
    const u = renderScreen();
    fireEvent.changeText(u.getByPlaceholderText('you@example.com'), 'a@b.com');
    fireEvent.press(u.getByText('Send code'));

    expect(await u.findByText('boom')).toBeTruthy();
    // Stays on the email step on failure.
    expect(u.getByText('Send code')).toBeTruthy();
  });
});
