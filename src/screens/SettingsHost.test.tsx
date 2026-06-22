import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { SettingsHost } from './SettingsHost';

const mockSignOut = jest.fn(async () => {});
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'gabrial@email.com', user_metadata: { name: 'Gabrial' } }, signOut: mockSignOut }),
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

beforeEach(() => mockSignOut.mockClear());

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
