// Behavior test for ProgressHost — the Tier-B prog host (WIRING_MAP §3). The host pulls coverage
// from the injected ProgressService and renders the PURE ProgressScreen. We inject a service that
// returns fixed known ranks and assert the screen derives the hero stat and the LIVE band bars
// from them (spec 2026-07-06 — bands are no longer hard-coded mockup values). Also pins the
// loading/error contract: no coverage is ever shown before the fetch resolves, and a failure
// renders a retryable error — never a silent "0 known" default.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { ProgressHost } from './ProgressHost';
import type { ProgressCoverage } from '../services/index';

const ranks = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

function renderHost(
  getCoverage: () => Promise<ProgressCoverage> = async () => ({ total: 1000, knownRanks: ranks(1, 250) }),
) {
  return render(
    <ThemeProvider>
      <ServiceProvider
        services={{
          ...createStubServices(),
          progress: { getCoverage },
        }}
      >
        <ProgressHost />
      </ServiceProvider>
    </ThemeProvider>,
  );
}

describe('ProgressHost', () => {
  it('fetches coverage from the injected service and renders the word count', async () => {
    const u = renderHost();
    // The count line reads "<known> of the <total> most common words" (total gets a thousands
    // separator), with <known> in its own emphasized node.
    expect(await u.findByText(/of the 1,000 most common words/)).toBeTruthy();
    expect(u.getByText('250')).toBeTruthy();
  });

  it('renders the derived percentage of the core vocabulary', async () => {
    const u = renderHost();
    // The percentage is the hero stat ("25" + "%") above the framing line.
    expect(await u.findByText('25')).toBeTruthy();
    expect(u.getByText('of everyday Latvian speech you can already follow.')).toBeTruthy();
  });

  it('shows a loading placeholder before the fetch resolves — never premature coverage', async () => {
    let resolve!: (c: ProgressCoverage) => void;
    const u = renderHost(() => new Promise((r) => { resolve = r; }));
    expect(u.getByLabelText('Loading')).toBeTruthy();
    expect(u.queryByText('of everyday Latvian speech you can already follow.')).toBeNull();
    resolve({ total: 1000, knownRanks: ranks(1, 250) });
    expect(await u.findByText('25')).toBeTruthy();
  });

  it('shows a retryable error on fetch failure instead of a fake "0 known" screen', async () => {
    let calls = 0;
    const u = renderHost(async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return { total: 1000, knownRanks: ranks(1, 250) };
    });
    expect(await u.findByText('Try again')).toBeTruthy();
    // No fabricated coverage behind the error.
    expect(u.queryByText('of everyday Latvian speech you can already follow.')).toBeNull();
    fireEvent.press(u.getByText('Try again'));
    expect(await u.findByText('25')).toBeTruthy();
  });

  it('derives LIVE band bars from the known ranks (no hard-coded mockup values)', async () => {
    const u = renderHost(); // ranks 1..250 → Top 100 complete; 101–300 at 150/200 = 75%
    expect(await u.findByText('75%')).toBeTruthy();
    // The completed Top 100 band shows the check instead of a percent label...
    expect(u.queryByText('100%')).toBeNull();
    // ...and the untouched tail bands read 0%.
    expect(u.getAllByText('0%')).toHaveLength(2);
  });

  it('scattered known ranks land in their true bands', async () => {
    // 2 words in Top 100 → 2%; 1 word in 601–1000 → rounds to 0%; middle bands untouched.
    const u = renderHost(async () => ({ total: 1000, knownRanks: [1, 2, 650] }));
    expect(await u.findByText('2%')).toBeTruthy();
    expect(u.getByText('3')).toBeTruthy(); // the emphasized "3 of the 1,000" count
    expect(u.getAllByText('0%')).toHaveLength(3);
  });
});
