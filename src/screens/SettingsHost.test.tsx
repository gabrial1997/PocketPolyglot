import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { SettingsHost } from './SettingsHost';

jest.mock('../services/supabaseClient', () => ({ supabase: {} }));

const mockSignOut = jest.fn(async () => {});
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'gabrial@email.com', user_metadata: { name: 'Gabrial' } }, signOut: mockSignOut }),
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
