// Behavior + snapshot tests for the DiacriticOrientationScreen (D2b).
// Pure presentational — data-in / events-out. No service import.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { DiacriticOrientationScreen } from './DiacriticOrientationScreen';

function setup(onDismiss = jest.fn()) {
  const utils = render(
    <ThemeProvider>
      <DiacriticOrientationScreen onDismiss={onDismiss} />
    </ThemeProvider>,
  );
  return { ...utils, onDismiss };
}

it('renders a heading about Latvian characters / letters', () => {
  const { getAllByText } = setup();
  // Heading (and possibly body) must mention Latvian in some form
  const matches = getAllByText(/latvian/i);
  expect(matches.length).toBeGreaterThanOrEqual(1);
});

it('shows at least one diacritic example glyph (macron, háček or cedilla)', () => {
  const { getAllByText } = setup();
  // At least one of: ā ē ī ū č š ž ģ ķ ļ ņ must appear somewhere in the tree
  const allText = getAllByText(/[āēīūčšžģķļņ]/u);
  expect(allText.length).toBeGreaterThanOrEqual(1);
});

it('pressing "Got it" calls onDismiss once', () => {
  const onDismiss = jest.fn();
  const { getByText } = setup(onDismiss);
  fireEvent.press(getByText('Got it'));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it('does NOT contain time claims ("minutes", "10 min") or the word "quiet"', () => {
  const { queryByText } = setup();
  expect(queryByText(/\d+\s*min/i)).toBeNull();
  expect(queryByText(/ten minutes/i)).toBeNull();
  expect(queryByText(/quiet/i)).toBeNull();
});

it('matches snapshot', () => {
  const { toJSON } = setup();
  expect(toJSON()).toMatchSnapshot();
});
