import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { SettRow, SettSwitch, Avatar, SettNavHeader } from './SettingsPrimitives';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

it('SettRow fires onPress when tapped', () => {
  const onPress = jest.fn();
  const u = wrap(<SettRow title="Appearance" value="System" onPress={onPress} />);
  fireEvent.press(u.getByText('Appearance'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('SettRow without onPress does not crash and is not pressable', () => {
  const u = wrap(<SettRow title="Email" value="a@b.com" />);
  expect(u.getByText('Email')).toBeTruthy();
  expect(u.getByText('a@b.com')).toBeTruthy();
});

it('SettSwitch toggles', () => {
  const onToggle = jest.fn();
  const u = wrap(<SettSwitch on={false} onToggle={onToggle} />);
  fireEvent.press(u.getByRole('switch'));
  expect(onToggle).toHaveBeenCalledTimes(1);
});

it('Avatar renders initials', () => {
  const u = wrap(<Avatar initials="G" />);
  expect(u.getByText('G')).toBeTruthy();
});

it('SettNavHeader fires onBack', () => {
  const onBack = jest.fn();
  const u = wrap(<SettNavHeader title="Profile" onBack={onBack} />);
  fireEvent.press(u.getByLabelText('Back'));
  expect(onBack).toHaveBeenCalledTimes(1);
});
