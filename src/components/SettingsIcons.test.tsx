import React from 'react';
import { render } from '@testing-library/react-native';
import {
  SettingsIcon, ChevronLeftIcon, BellIcon, SparkleIcon, HelpIcon, InfoIcon,
  LogoutIcon, PersonIcon, MailIcon, GlobeIcon, ShieldIcon, CameraIcon,
  AutoThemeIcon, CheckIcon, TrashIcon,
} from './icons';

const ALL = [
  SettingsIcon, ChevronLeftIcon, BellIcon, SparkleIcon, HelpIcon, InfoIcon,
  LogoutIcon, PersonIcon, MailIcon, GlobeIcon, ShieldIcon, CameraIcon,
  AutoThemeIcon, CheckIcon, TrashIcon,
];

it('every new settings glyph renders with a color prop', () => {
  for (const Icon of ALL) {
    const { UNSAFE_root } = render(<Icon size={18} color="#123456" />);
    expect(UNSAFE_root).toBeTruthy();
  }
});
