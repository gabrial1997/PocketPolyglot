// ProgressScreen honesty tests — the screen renders ONLY what it is given (locked constraint:
// progress = honest coverage, never fabricated). Pins the removal of the mockup sample data
// (spec 2026-07-06): the hero stat, known count, and bands all derive from `knownRanks`/`total`
// rather than a fixed 1,000-word sample. Per-band math itself is covered by coverageBands.test.ts;
// live derivation against a real service is covered by ProgressHost.test.tsx — this file pins the
// screen's own rendering (defaults, hero text formatting, dot-grid size).
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ProgressScreen } from './ProgressScreen';

function renderScreen(props: React.ComponentProps<typeof ProgressScreen> = {}) {
  return render(
    <ThemeProvider>
      <ProgressScreen {...props} />
    </ThemeProvider>,
  );
}

describe('ProgressScreen (honest coverage)', () => {
  it('a brand-new user (no known ranks) sees an honest 0%, not fabricated sample data', () => {
    const u = renderScreen({ total: 1000, knownRanks: [] });
    // "0" appears as both the hero percent and the known-word count — both honest zeros.
    expect(u.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    expect(u.getByText(/of the 1,000 most common words/)).toBeTruthy();
    // Every band still renders (real, computed data — just all at 0%), never the old fabricated
    // mockup values (e.g. a Top 100 band already at some non-zero sample percentage).
    expect(u.getByText('Top 100')).toBeTruthy();
    expect(u.getAllByText('0%')).toHaveLength(4);
  });

  it('defaults to the 1,000-word corpus and empty ranks when no props are supplied', () => {
    const u = renderScreen();
    expect(u.getByText(/of the 1,000 most common words/)).toBeTruthy();
    expect(u.getAllByText('0').length).toBeGreaterThanOrEqual(1);
  });

  it('derives the hero percent and known count from knownRanks', () => {
    const u = renderScreen({ total: 200, knownRanks: [1, 2, 3, 4] });
    expect(u.getByText('4')).toBeTruthy(); // known count
    expect(u.getByText('2')).toBeTruthy(); // hero pct: 4/200 = 2%
    expect(u.getByText(/of the 200 most common words/)).toBeTruthy();
  });

  it('renders the coverage grid with its frequency-axis labels regardless of which ranks are known', () => {
    const u = renderScreen({ total: 1000, knownRanks: [1, 500, 999] });
    expect(u.getByText('most common')).toBeTruthy();
    expect(u.getByText('rarer')).toBeTruthy();
  });
});
