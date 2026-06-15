// SignInScreen behavior tests — email + password sign-in, plus a create-account toggle,
// over a mocked supabase client. Apple/Google/Forgot-password are cosmetic (no auth call).
// The client module is mocked so native AsyncStorage never loads and we control auth calls.
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
      signInWithPassword: jest.fn(async () => ({ data: { session: {} }, error: null })),
      signUp: jest.fn(async () => ({ data: { session: {} }, error: null })),
      signOut: jest.fn(async () => ({ error: null })),
    },
  },
}));

// Typed handle on the mocked auth methods so we can assert / reprogram them per test.
const authMock = supabase.auth as unknown as {
  getSession: jest.Mock;
  signInWithPassword: jest.Mock;
  signUp: jest.Mock;
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
  authMock.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
  authMock.signUp.mockResolvedValue({ data: { session: {} }, error: null });
});

describe('SignInScreen', () => {
  it('renders the sign-in form with email + password and a Continue button', async () => {
    const u = renderScreen();
    expect(u.getByText('Sveiki.')).toBeTruthy();
    expect(u.getByPlaceholderText('Email')).toBeTruthy();
    expect(u.getByPlaceholderText('Password')).toBeTruthy();
    expect(u.getByText('Continue')).toBeTruthy();
    await waitFor(() => expect(authMock.getSession).toHaveBeenCalled());
  });

  it('signs in with the entered email + password', async () => {
    const u = renderScreen();
    fireEvent.changeText(u.getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(u.getByPlaceholderText('Password'), 'hunter2!');
    fireEvent.press(u.getByText('Continue'));

    await waitFor(() =>
      expect(authMock.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'hunter2!',
      }),
    );
  });

  it('switches to create-account mode and signs up', async () => {
    const u = renderScreen();
    // Footer link switches modes.
    fireEvent.press(u.getByText('Create account'));

    // Now the primary action creates the account.
    fireEvent.changeText(u.getByPlaceholderText('Email'), 'new@b.com');
    fireEvent.changeText(u.getByPlaceholderText('Password'), 'hunter2!');
    fireEvent.press(u.getByText('Create account'));

    await waitFor(() =>
      expect(authMock.signUp).toHaveBeenCalledWith({
        email: 'new@b.com',
        password: 'hunter2!',
      }),
    );
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
  });

  it('renders the error message when sign-in fails', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    const u = renderScreen();
    fireEvent.changeText(u.getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(u.getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(u.getByText('Continue'));

    expect(await u.findByText('Invalid login credentials')).toBeTruthy();
  });

  it('shows a confirm-email notice when sign-up needs confirmation', async () => {
    authMock.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const u = renderScreen();
    fireEvent.press(u.getByText('Create account'));
    fireEvent.changeText(u.getByPlaceholderText('Email'), 'new@b.com');
    fireEvent.changeText(u.getByPlaceholderText('Password'), 'hunter2!');
    fireEvent.press(u.getByText('Create account'));

    expect(await u.findByText(/confirm/i)).toBeTruthy();
  });

  it('Apple and Google buttons are cosmetic — they trigger no auth call', async () => {
    const u = renderScreen();
    fireEvent.press(u.getByText('Continue with Apple'));
    fireEvent.press(u.getByText('Continue with Google'));
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
    expect(authMock.signUp).not.toHaveBeenCalled();
    await waitFor(() => expect(authMock.getSession).toHaveBeenCalled());
  });
});
