import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
