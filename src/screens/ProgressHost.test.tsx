// Behavior test for ProgressHost — the Tier-B prog host (WIRING_MAP §3). The host pulls coverage
// from the injected ProgressService and renders the PURE ProgressScreen. We inject a service that
// returns fixed coverage and assert the screen renders it (async fetch via useEffect). Also pins
// the loading/error contract: no coverage is ever shown before the fetch resolves, and a failure
// renders a retryable error — never a silent "0 known" default.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { ProgressHost } from './ProgressHost';

function renderHost(getCoverage: () => Promise<{ known: number; total: number }> = async () => ({ known: 250, total: 1000 })) {
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
    // Visual-sync: the count line now reads "<known> of the <total> most common words"
    // (total gets a thousands separator), with <known> in its own emphasized node.
    expect(await u.findByText(/of the 1,000 most common words/)).toBeTruthy();
    expect(u.getByText('250')).toBeTruthy();
  });

  it('renders the derived percentage of the core vocabulary', async () => {
    const u = renderHost();
    // Visual-sync: the percentage is the hero stat ("25" + "%") above the framing line.
    expect(await u.findByText('25')).toBeTruthy();
    expect(u.getByText('of everyday Latvian speech you can already follow.')).toBeTruthy();
  });

  it('shows a loading placeholder before the fetch resolves — never premature coverage', async () => {
    let resolve!: (c: { known: number; total: number }) => void;
    const u = renderHost(() => new Promise((r) => { resolve = r; }));
    expect(u.getByLabelText('Loading')).toBeTruthy();
    expect(u.queryByText('of everyday Latvian speech you can already follow.')).toBeNull();
    resolve({ known: 250, total: 1000 });
    expect(await u.findByText('25')).toBeTruthy();
  });

  it('shows a retryable error on fetch failure instead of a fake "0 known" screen', async () => {
    let calls = 0;
    const u = renderHost(async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return { known: 250, total: 1000 };
    });
    expect(await u.findByText('Try again')).toBeTruthy();
    // No fabricated coverage behind the error.
    expect(u.queryByText('of everyday Latvian speech you can already follow.')).toBeNull();
    fireEvent.press(u.getByText('Try again'));
    expect(await u.findByText('25')).toBeTruthy();
  });
});
