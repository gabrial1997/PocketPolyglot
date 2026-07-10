import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { SettingsHost } from './SettingsHost';
import { SUPPORT_EMAIL, SUPPORT_URL, PRIVACY_URL } from '../config/support';

const mockResetPasswordForEmail = jest.fn(async (_email: string) => ({ error: null as Error | null }));
jest.mock('../services/supabaseClient', () => ({
  supabase: { auth: { resetPasswordForEmail: (email: string) => mockResetPasswordForEmail(email) } },
}));

const mockSignOut = jest.fn(async () => {});
let mockUser: { email?: string; user_metadata: Record<string, unknown> } | null = {
  email: 'gabrial@email.com',
  user_metadata: { name: 'Gabrial' },
};
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser, signOut: mockSignOut }),
}));

const mockSkipDay = jest.fn(async () => 3);
const mockLoadClockOffset = jest.fn(async () => 0);
jest.mock('../services/devClock', () => ({
  devNow: () => new Date('2026-07-07T00:00:00.000Z'),
  getOffsetDays: () => 3,
  loadClockOffset: () => mockLoadClockOffset(),
  skipDay: () => mockSkipDay(),
}));

const mockResetProgress = jest.fn(async (_client: unknown) => {});
jest.mock('../services/devTools', () => ({
  resetProgress: (client: unknown) => mockResetProgress(client),
}));

function renderHost(services = createStubServices()) {
  return render(
    <ThemeProvider>
      <ServiceProvider services={services}>
        <SettingsHost />
      </ServiceProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockSignOut.mockClear();
  mockSkipDay.mockClear();
  mockLoadClockOffset.mockClear();
  mockResetProgress.mockClear();
  mockResetPasswordForEmail.mockClear();
  mockResetPasswordForEmail.mockImplementation(async () => ({ error: null }));
  mockUser = { email: 'gabrial@email.com', user_metadata: { name: 'Gabrial' } };
});

it('renders the auth email', async () => {
  const u = renderHost();
  expect(await u.findByText('gabrial@email.com')).toBeTruthy();
});

it('toggling Recording consent calls profile.setRecConsent', async () => {
  const services = createStubServices();
  const spy = jest.spyOn(services.profile, 'setRecConsent');
  const u = renderHost(services);
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByLabelText('Recording consent'));
  await waitFor(() => expect(spy).toHaveBeenCalledWith(true));
});

it('confirming log out calls auth.signOut', async () => {
  const u = renderHost();
  fireEvent.press(u.getByLabelText('Log out'));
  fireEvent.press(u.getByLabelText('Confirm log out'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
});

it('renders the Developer group under __DEV__ at real time', async () => {
  const u = renderHost();
  expect(await u.findByText('Today (real time)')).toBeTruthy();
});

it('Skip to next day calls devClock.skipDay', async () => {
  const u = renderHost();
  await u.findByText('Today (real time)');
  fireEvent.press(u.getByText('Skip to next day'));
  await waitFor(() => expect(mockSkipDay).toHaveBeenCalledTimes(1));
});

it('confirming Reset progress calls devTools.resetProgress with the supabase client', async () => {
  const u = renderHost();
  await u.findByText('Today (real time)');
  fireEvent.press(u.getByText('Reset progress'));
  fireEvent.press(u.getByText('Tap again to erase all progress'));
  await waitFor(() => expect(mockResetProgress).toHaveBeenCalledTimes(1));
});

// Fix 4: a swallowed .catch() on resetProgress used to leave the learner staring at a normal
// "Reset progress" row with no sign anything went wrong. The host must surface the failure.
it('a failed Reset progress surfaces "Reset failed — tap to retry" instead of failing silently', async () => {
  mockResetProgress.mockRejectedValueOnce(new Error('rpc failed'));
  const u = renderHost();
  await u.findByText('Today (real time)');
  fireEvent.press(u.getByText('Reset progress'));
  fireEvent.press(u.getByText('Tap again to erase all progress'));
  await waitFor(() => expect(mockResetProgress).toHaveBeenCalledTimes(1));
  expect(await u.findByText('Reset failed — tap to retry')).toBeTruthy();
});

it('a successful Reset progress after a prior failure clears the error state', async () => {
  mockResetProgress.mockRejectedValueOnce(new Error('rpc failed'));
  const u = renderHost();
  await u.findByText('Today (real time)');
  fireEvent.press(u.getByText('Reset progress'));
  fireEvent.press(u.getByText('Tap again to erase all progress'));
  await u.findByText('Reset failed — tap to retry');

  fireEvent.press(u.getByText('Reset failed — tap to retry'));
  fireEvent.press(u.getByText('Tap again to erase all progress'));
  await waitFor(() => expect(mockResetProgress).toHaveBeenCalledTimes(2));
  expect(await u.findByText('Reset progress')).toBeTruthy();
});

// GDPR: a failed deleteRecordings() must be surfaced (was a swallowed .catch — the learner was
// left believing their recordings were gone when they weren't).
it('a failed Delete my recordings surfaces "Delete failed — tap to retry" instead of failing silently', async () => {
  const services = createStubServices();
  jest.spyOn(services.profile, 'deleteRecordings').mockRejectedValueOnce(new Error('storage down'));
  const u = renderHost(services);
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete my recordings'));
  expect(await u.findByText('Delete failed — tap to retry')).toBeTruthy();
});

it('a successful delete after a prior failure clears the delete error state', async () => {
  const services = createStubServices();
  const spy = jest.spyOn(services.profile, 'deleteRecordings').mockRejectedValueOnce(new Error('storage down'));
  const u = renderHost(services);
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete my recordings'));
  await u.findByText('Delete failed — tap to retry');

  fireEvent.press(u.getByText('Delete failed — tap to retry')); // retry: the stub now resolves
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  expect(await u.findByText('Delete my recordings')).toBeTruthy();
});

// Apple-mandated account deletion: recordings (audio objects) must go first, then the account
// row, and only THEN sign the user out — never sign out on a partial delete.
it('confirming Delete account calls deleteRecordings, then deleteAccount, then signOut in order', async () => {
  const services = createStubServices();
  const order: string[] = [];
  jest.spyOn(services.profile, 'deleteRecordings').mockImplementation(async () => {
    order.push('deleteRecordings');
  });
  jest.spyOn(services.profile, 'deleteAccount').mockImplementation(async () => {
    order.push('deleteAccount');
  });
  mockSignOut.mockImplementationOnce(async () => {
    order.push('signOut');
  });
  const u = renderHost(services);
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete account'));
  fireEvent.press(u.getByText('Tap again to permanently delete your account'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(order).toEqual(['deleteRecordings', 'deleteAccount', 'signOut']);
});

// GDPR: a failed deletion must never sign the user out silently believing it worked.
it('a failed Delete account surfaces "Deletion failed — tap to retry" and does NOT sign out', async () => {
  const services = createStubServices();
  jest.spyOn(services.profile, 'deleteRecordings').mockResolvedValueOnce(undefined);
  jest.spyOn(services.profile, 'deleteAccount').mockRejectedValueOnce(new Error('rpc failed'));
  const u = renderHost(services);
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete account'));
  fireEvent.press(u.getByText('Tap again to permanently delete your account'));
  expect(await u.findByText('Deletion failed — tap to retry')).toBeTruthy();
  expect(mockSignOut).not.toHaveBeenCalled();
});

// Reviewer finding 1: once deleteAccount() resolves, the account IS gone server-side. A
// signOut() rejection after that is local-teardown noise, not a deletion failure — it must
// NOT relabel the row "Deletion failed — tap to retry" (which would invite a retry against a
// dead account). Both deletes must still be called exactly once.
it('a signOut rejection after successful deletes does NOT surface "Deletion failed — tap to retry"', async () => {
  const services = createStubServices();
  const deleteRecordings = jest.spyOn(services.profile, 'deleteRecordings').mockResolvedValueOnce(undefined);
  const deleteAccount = jest.spyOn(services.profile, 'deleteAccount').mockResolvedValueOnce(undefined);
  mockSignOut.mockRejectedValueOnce(new Error('network down'));
  const u = renderHost(services);
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete account'));
  fireEvent.press(u.getByText('Tap again to permanently delete your account'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(u.queryByText('Deletion failed — tap to retry')).toBeNull();
  expect(deleteRecordings).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledTimes(1);
});

// Reviewer finding 2: a rapid double-tap on the armed confirm row must not start two concurrent
// delete chains on an irreversible action. Both taps land on the same render's onPress closure
// (this is what "rapid" means — two touch events resolved before React commits the re-render
// from the first tap's setArmed(false)), so we grab that one closure and invoke it twice
// synchronously, exactly as two near-simultaneous native taps would. The host latches in-flight
// and drops the second call.
it('invoking Delete account twice rapidly only runs the delete chain once', async () => {
  const services = createStubServices();
  let resolveDeleteRecordings: () => void = () => {};
  const deleteRecordings = jest
    .spyOn(services.profile, 'deleteRecordings')
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDeleteRecordings = resolve;
        }),
    );
  const deleteAccount = jest.spyOn(services.profile, 'deleteAccount').mockResolvedValueOnce(undefined);
  const u = renderHost(services);
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete account'));
  let confirmNode: ReturnType<typeof u.getByLabelText> | null = u.getByLabelText(
    'Tap again to permanently delete your account',
  );
  while (confirmNode && typeof confirmNode.props.onPress !== 'function') {
    confirmNode = confirmNode.parent;
  }
  if (!confirmNode) throw new Error('no ancestor with onPress found');
  const confirmPress = confirmNode.props.onPress as () => void; // capture ONE render's closure
  act(() => {
    confirmPress(); // first tap — arms→disarms, starts the chain, in flight
    confirmPress(); // second tap on the same stale closure — must be a no-op
  });
  resolveDeleteRecordings();
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(deleteRecordings).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledTimes(1);
});

// Task 6: dead Settings rows become real or disappear. Help & feedback, Privacy policy, and
// Support site all open real URLs via Linking — never a silent no-op.
it('Help & feedback opens a mailto: link containing SUPPORT_EMAIL', async () => {
  const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const u = renderHost();
  fireEvent.press(u.getByText('Help & feedback'));
  expect(spy).toHaveBeenCalledWith(`mailto:${SUPPORT_EMAIL}`);
});

it('Privacy policy opens PRIVACY_URL', async () => {
  const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const u = renderHost();
  fireEvent.press(u.getByText('Privacy policy'));
  expect(spy).toHaveBeenCalledWith(PRIVACY_URL);
});

it('Support site opens SUPPORT_URL', async () => {
  const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const u = renderHost();
  fireEvent.press(u.getByText('Support site'));
  expect(spy).toHaveBeenCalledWith(SUPPORT_URL);
});

// Change password: a real Supabase reset-email flow, not a dead row.
it('Change password calls resetPasswordForEmail with the signed-in user email and shows the sent state', async () => {
  const u = renderHost();
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Change password'));
  await waitFor(() => expect(mockResetPasswordForEmail).toHaveBeenCalledWith('gabrial@email.com'));
  expect(await u.findByText(/Check your email/)).toBeTruthy();
});

it('a resetPasswordForEmail {error} result surfaces the error state', async () => {
  mockResetPasswordForEmail.mockResolvedValueOnce({ error: new Error('rate limited') });
  const u = renderHost();
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Change password'));
  expect(await u.findByText(/Couldn’t send/)).toBeTruthy();
});

it('a rejected resetPasswordForEmail promise also surfaces the error state', async () => {
  mockResetPasswordForEmail.mockRejectedValueOnce(new Error('network down'));
  const u = renderHost();
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Change password'));
  expect(await u.findByText(/Couldn’t send/)).toBeTruthy();
});

it('Change password is a no-op when the signed-in user has no email', async () => {
  mockUser = { email: undefined, user_metadata: {} };
  const u = renderHost();
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Change password'));
  expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
});
