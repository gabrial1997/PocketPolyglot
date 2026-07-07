// ProgressScreen honesty tests — the screen renders ONLY what it is given (locked constraint:
// progress = honest coverage, never fabricated). Pins the removal of the mockup sample data:
// no invented per-band percentages, and a dot grid derived from `total` (never a fixed 1,000).
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ProgressScreen, type CoverageBand } from './ProgressScreen';

function renderScreen(props: React.ComponentProps<typeof ProgressScreen>) {
  return render(
    <ThemeProvider>
      <ProgressScreen {...props} />
    </ThemeProvider>,
  );
}

describe('ProgressScreen (honest coverage)', () => {
  it('a brand-new user sees 0% and NO fabricated frequency bands', () => {
    const u = renderScreen({ known: 0, total: 1000 });
    expect(u.getByText('0')).toBeTruthy(); // hero percent
    expect(u.getByText(/of the 1,000 most common words/)).toBeTruthy();
    // The old hard-coded band defaults must never appear without real data.
    expect(u.queryByText('Top 100')).toBeNull();
    expect(u.queryByText('101 – 300')).toBeNull();
    expect(u.queryByText('92%')).toBeNull();
    expect(u.queryByText('the everyday core')).toBeNull();
  });

  it('renders frequency bands only when real band data is supplied', () => {
    const bands: CoverageBand[] = [{ label: 'Top 100', sub: 'the everyday core', pct: 40 }];
    const u = renderScreen({ known: 40, total: 1000, bands });
    expect(u.getByText('Top 100')).toBeTruthy();
    expect(u.getByText('40%')).toBeTruthy();
  });

  it('derives the dot grid from `total` instead of a fixed 1,000 dots', () => {
    const u = renderScreen({ known: 10, total: 80 });
    expect(u.getByTestId('coverage-grid').props.children).toHaveLength(80);
  });

  it('caps the dot grid for layout when total exceeds 1,000', () => {
    const u = renderScreen({ known: 500, total: 4000 });
    expect(u.getByTestId('coverage-grid').props.children).toHaveLength(1000);
  });
});
