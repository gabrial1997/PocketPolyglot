import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { GlideTrack } from './GlideTrack';

test('GlideTrack renders both vowel nodes', () => {
  const u = render(
    <ThemeProvider>
      <GlideTrack from="i" to="e" playing={false} color="#6EA8DA" />
    </ThemeProvider>,
  );
  expect(u.getByText('i')).toBeTruthy();
  expect(u.getByText('e')).toBeTruthy();
});
