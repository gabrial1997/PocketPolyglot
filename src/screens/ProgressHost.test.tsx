// Behavior test for ProgressHost — the Tier-B prog host (WIRING_MAP §3). The host pulls coverage
// from the injected ProgressService and renders the PURE ProgressScreen. We inject a service that
// returns fixed coverage and assert the screen renders it (async fetch via useEffect).
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { ProgressHost } from './ProgressHost';

function renderHost() {
  return render(
    <ThemeProvider>
      <ServiceProvider
        services={{
          ...createStubServices(),
          progress: { getCoverage: async () => ({ known: 250, total: 1000 }) },
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
});
