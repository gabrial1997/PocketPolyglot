// AuthProvider — signOut must surface Supabase's { error } instead of silently discarding it,
// so callers can show feedback when a sign-out fails (e.g. offline).
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from './AuthProvider';

const mockSignOut = jest.fn(async () => ({ error: null as { message: string } | null }));

jest.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithPassword: jest.fn(async () => ({ error: null })),
      signUp: jest.fn(async () => ({ data: { session: null }, error: null })),
      signOut: (...args: unknown[]) => mockSignOut(...(args as [])),
    },
  },
}));

function Probe({ onReady }: { onReady: (signOut: () => Promise<{ error: string | null }>) => void }) {
  const { signOut, loading } = useAuth();
  if (!loading) onReady(signOut);
  return <Text>probe</Text>;
}

async function getSignOut(): Promise<() => Promise<{ error: string | null }>> {
  let signOut: (() => Promise<{ error: string | null }>) | null = null;
  render(
    <AuthProvider>
      <Probe onReady={(s) => { signOut = s; }} />
    </AuthProvider>,
  );
  await waitFor(() => expect(signOut).not.toBeNull());
  return signOut!;
}

describe('AuthProvider.signOut', () => {
  it('returns { error: null } on success', async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });
    const signOut = await getSignOut();
    await act(async () => {
      await expect(signOut()).resolves.toEqual({ error: null });
    });
  });

  it('surfaces the Supabase error message instead of swallowing it', async () => {
    mockSignOut.mockResolvedValueOnce({ error: { message: 'network down' } });
    const signOut = await getSignOut();
    await act(async () => {
      await expect(signOut()).resolves.toEqual({ error: 'network down' });
    });
  });
});
