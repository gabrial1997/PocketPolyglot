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
    expect(await u.findByText('250 / 1000 words')).toBeTruthy();
  });

  it('renders the derived percentage of the core vocabulary', async () => {
    const u = renderHost();
    expect(await u.findByText('25% of the core vocabulary')).toBeTruthy();
  });
});
