// Behavior + snapshot tests for ConsentScreen (D3b).
// Pure presentational — data-in / events-out. No service import.
// GDPR copy assertions: (a) retention disclosure, (b) rater/coach-access disclosure.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ConsentScreen } from './ConsentScreen';

function setup(overrides: { onAccept?: jest.Mock; onDecline?: jest.Mock } = {}) {
  const onAccept = overrides.onAccept ?? jest.fn();
  const onDecline = overrides.onDecline ?? jest.fn();
  const utils = render(
    <ThemeProvider>
      <ConsentScreen onAccept={onAccept} onDecline={onDecline} />
    </ThemeProvider>,
  );
  return { ...utils, onAccept, onDecline };
}

describe('ConsentScreen — GDPR disclosures', () => {
  it('shows retention disclosure (kept over time / progress)', () => {
    const { getAllByText } = setup();
    // Anchors to the actual disclosure label/body: "kept over time" — unique to the retention card
    const matches = getAllByText(/kept over time/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows rater/coach-access disclosure (coach / listen / reviewer)', () => {
    const { getAllByText } = setup();
    // Anchors to the actual disclosure label/body: "reviewer may listen" — unique to the rater card
    const matches = getAllByText(/reviewer may listen/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ConsentScreen — training toggle (off by default)', () => {
  it('calls onAccept with training: false when toggle is untouched', () => {
    const onAccept = jest.fn();
    const { getByText } = setup({ onAccept });
    fireEvent.press(getByText('Allow recording'));
    expect(onAccept).toHaveBeenCalledWith({ training: false });
  });

  it('calls onAccept with training: true after toggling the training switch on', () => {
    const onAccept = jest.fn();
    const { getByLabelText, getByText } = setup({ onAccept });
    // The training toggle must have an accessible label matching "training"
    fireEvent.press(getByLabelText(/training/i));
    fireEvent.press(getByText('Allow recording'));
    expect(onAccept).toHaveBeenCalledWith({ training: true });
  });
});

describe('ConsentScreen — decline path', () => {
  it('"Not now" calls onDecline and not onAccept', () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const { getByText } = setup({ onAccept, onDecline });
    fireEvent.press(getByText('Not now'));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe('ConsentScreen — copy hygiene', () => {
  it('does not contain time claims or the word "quiet"', () => {
    const { queryByText } = setup();
    expect(queryByText(/\d+\s*min/i)).toBeNull();
    expect(queryByText(/ten minutes/i)).toBeNull();
    expect(queryByText(/quiet/i)).toBeNull();
  });
});

it('matches snapshot', () => {
  const { toJSON } = setup();
  expect(toJSON()).toMatchSnapshot();
});
