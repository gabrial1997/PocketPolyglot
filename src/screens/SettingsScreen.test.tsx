import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen';

function setup(over: Partial<SettingsScreenProps> = {}) {
  const props: SettingsScreenProps = {
    name: 'Gabrial',
    email: 'gabrial@email.com',
    appVersion: '0.1.2',
    themeMode: 'system',
    onSelectMode: jest.fn(),
    recConsent: false,
    onToggleConsent: jest.fn(),
    onDeleteRecordings: jest.fn(),
    onSignOut: jest.fn(),
    onDeleteAccount: jest.fn(),
    ...over,
  };
  const u = render(
    <ThemeProvider>
      <SettingsScreen {...props} />
    </ThemeProvider>,
  );
  return { u, props };
}

it('shows the user name and email on the menu', () => {
  const { u } = setup();
  expect(u.getByText('Gabrial')).toBeTruthy();
  expect(u.getByText('gabrial@email.com')).toBeTruthy();
});

it('does NOT render a Subscription row (omitted by scope)', () => {
  const { u } = setup();
  expect(u.queryByText(/Subscription|Plus/)).toBeNull();
});

it('navigates to Appearance and selecting Dark calls onSelectMode', () => {
  const { u, props } = setup();
  fireEvent.press(u.getByText('Appearance'));
  fireEvent.press(u.getByText('Dark'));
  expect(props.onSelectMode).toHaveBeenCalledWith('dark');
});

it('the Privacy consent toggle calls onToggleConsent(true)', () => {
  const { u, props } = setup({ recConsent: false });
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByLabelText('Recording consent'));
  expect(props.onToggleConsent).toHaveBeenCalledWith(true);
});

it('Delete my recordings calls onDeleteRecordings', () => {
  const { u, props } = setup();
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete my recordings'));
  expect(props.onDeleteRecordings).toHaveBeenCalledTimes(1);
});

// GDPR: a failed deletion must be visible on the row — never a silent no-op the learner reads
// as "my recordings are gone".
it('deleteRecordingsError shows "Delete failed — tap to retry" and the tap retries', () => {
  const { u, props } = setup({ deleteRecordingsError: true });
  fireEvent.press(u.getByLabelText('Open profile'));
  expect(u.queryByText('Delete my recordings')).toBeNull();
  fireEvent.press(u.getByText('Delete failed — tap to retry'));
  expect(props.onDeleteRecordings).toHaveBeenCalledTimes(1);
});

it('without deleteRecordingsError, the row reads the normal "Delete my recordings" label', () => {
  const { u } = setup({ deleteRecordingsError: false });
  fireEvent.press(u.getByLabelText('Open profile'));
  expect(u.getByText('Delete my recordings')).toBeTruthy();
  expect(u.queryByText('Delete failed — tap to retry')).toBeNull();
});

// GDPR/Apple-mandated: account deletion requires a second, armed tap — never a single-tap
// destructive action.
it('delete account requires a second, armed tap', () => {
  const onDeleteAccount = jest.fn();
  const { u } = setup({ onDeleteAccount });
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete account'));
  expect(onDeleteAccount).not.toHaveBeenCalled();
  fireEvent.press(u.getByText('Tap again to permanently delete your account'));
  expect(onDeleteAccount).toHaveBeenCalledTimes(1);
});

it('delete account disarms after the timeout', () => {
  jest.useFakeTimers();
  const { u } = setup({ onDeleteAccount: jest.fn() });
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByText('Delete account'));
  act(() => jest.advanceTimersByTime(4001));
  u.getByText('Delete account'); // back to unarmed label
  jest.useRealTimers();
});

it('deleteAccountError surfaces a failed deletion as a retryable row', () => {
  const { u } = setup({ deleteAccountError: true });
  fireEvent.press(u.getByLabelText('Open profile'));
  u.getByText('Deletion failed — tap to retry');
});

it('log out → sheet confirm calls onSignOut', () => {
  const { u, props } = setup();
  fireEvent.press(u.getByLabelText('Log out'));
  fireEvent.press(u.getByLabelText('Confirm log out'));
  expect(props.onSignOut).toHaveBeenCalledTimes(1);
});

it('shows the app version in the footer', () => {
  const { u } = setup({ appVersion: '9.9.9' });
  expect(u.getByText(/PocketPolyglot · v9\.9\.9/)).toBeTruthy();
});

const devProps = {
  simulatedDateLabel: 'Tue Jul 7 (+2 days)',
  offsetDays: 2,
  onSkipDay: jest.fn(),
  onResetProgress: jest.fn(),
};

it('renders no Developer group without dev props', () => {
  const { u } = setup();
  expect(u.queryByText('Developer')).toBeNull();
});

it('renders the Developer group and fires onSkipDay', () => {
  const { u } = setup({ dev: devProps });
  expect(u.getByText('Tue Jul 7 (+2 days)')).toBeTruthy();
  fireEvent.press(u.getByText('Skip to next day'));
  expect(devProps.onSkipDay).toHaveBeenCalled();
});

it('Reset progress requires a second confirming tap', () => {
  const { u } = setup({ dev: devProps });
  fireEvent.press(u.getByText('Reset progress'));
  expect(devProps.onResetProgress).not.toHaveBeenCalled(); // armed, not fired
  fireEvent.press(u.getByText('Tap again to erase all progress'));
  expect(devProps.onResetProgress).toHaveBeenCalledTimes(1);
});

// Fix 4: the reset row must reflect a prior failure instead of looking like nothing happened.
it('dev.resetError shows "Reset failed — tap to retry" and arms a retry on tap', () => {
  const onResetProgress = jest.fn();
  const { u } = setup({ dev: { ...devProps, onResetProgress, resetError: true } });
  expect(u.queryByText('Reset progress')).toBeNull();
  expect(u.getByText('Reset failed — tap to retry')).toBeTruthy();
  fireEvent.press(u.getByText('Reset failed — tap to retry'));
  expect(onResetProgress).not.toHaveBeenCalled(); // armed, not fired
  fireEvent.press(u.getByText('Tap again to erase all progress'));
  expect(onResetProgress).toHaveBeenCalledTimes(1);
});

it('without resetError, the reset row reads the normal "Reset progress" label', () => {
  const { u } = setup({ dev: { ...devProps, resetError: false } });
  expect(u.getByText('Reset progress')).toBeTruthy();
  expect(u.queryByText('Reset failed — tap to retry')).toBeNull();
});
