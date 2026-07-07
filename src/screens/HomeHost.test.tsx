// HomeHost test — proves the host READS due counts from the injected srs service and renders
// them through the pure HomeScreen, and that the Start CTA invokes onStart. Also pins the
// honest-data contract: loading shows a placeholder (never "0 words" defaults), a failed core
// fetch is a retryable error, and the podcast teaser only appears for a REAL episode (WIRING_MAP §3).
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { HomeHost } from './HomeHost';

type Overrides = {
  getDueSummary?: () => Promise<{ newCount: number; reviewCount: number }>;
  getEpisode?: () => Promise<{ title: string; transcript: string; audioUrl: string }>;
};

function renderHost(onStart = jest.fn(), overrides: Overrides = {}) {
  const stubs = createStubServices();
  const services = {
    ...stubs,
    srs: {
      ...stubs.srs,
      getDueSummary: overrides.getDueSummary ?? (async () => ({ newCount: 7, reviewCount: 12 })),
    },
    podcast: {
      getEpisode:
        overrides.getEpisode ??
        (async () => ({ title: 'Rīta kafija', transcript: 'Sveiki!', audioUrl: 'ep://1' })),
    },
  };
  const utils = render(
    <ThemeProvider>
      <ServiceProvider services={services}>
        <HomeHost onStart={onStart} />
      </ServiceProvider>
    </ThemeProvider>,
  );
  return { ...utils, onStart };
}

describe('HomeHost', () => {
  it('reads the due summary from the srs service and renders the counts', async () => {
    const u = renderHost();
    expect(await u.findByText('7 new')).toBeTruthy();
    expect(await u.findByText('12 to review')).toBeTruthy();
  });

  it('invokes onStart when the session CTA is pressed', async () => {
    const u = renderHost();
    // Wait for the async fetch to settle so the act() warning never fires.
    await waitFor(() => expect(u.getByText('7 new')).toBeTruthy());
    fireEvent.press(u.getByText('Begin session'));
    expect(u.onStart).toHaveBeenCalledTimes(1);
  });

  it('shows a loading placeholder before the fetches resolve — never "0 words" defaults', async () => {
    let resolve!: (s: { newCount: number; reviewCount: number }) => void;
    const u = renderHost(jest.fn(), {
      getDueSummary: () => new Promise((r) => { resolve = r; }),
    });
    expect(u.getByLabelText('Loading')).toBeTruthy();
    expect(u.queryByText('0 new')).toBeNull();
    resolve({ newCount: 7, reviewCount: 12 });
    expect(await u.findByText('7 new')).toBeTruthy();
  });

  it('shows a retryable error when the core fetch fails instead of fake zero counts', async () => {
    let calls = 0;
    const u = renderHost(jest.fn(), {
      getDueSummary: async () => {
        calls += 1;
        if (calls === 1) throw new Error('offline');
        return { newCount: 7, reviewCount: 12 };
      },
    });
    expect(await u.findByText('Try again')).toBeTruthy();
    expect(u.queryByText('0 new')).toBeNull();
    fireEvent.press(u.getByText('Try again'));
    expect(await u.findByText('7 new')).toBeTruthy();
  });

  it('shows the REAL episode title in the podcast teaser when one exists', async () => {
    const u = renderHost();
    expect(await u.findByText('Rīta kafija')).toBeTruthy();
    expect(u.getByText('AI episode')).toBeTruthy();
    // The old fabricated defaults must never surface.
    expect(u.queryByText('Rīta saruna')).toBeNull();
    expect(u.queryByText(/only words you know/)).toBeNull();
  });

  it('hides the podcast teaser when no episode exists (honest omission, no fabricated title)', async () => {
    const u = renderHost(jest.fn(), {
      getEpisode: async () => ({ title: '', transcript: '', audioUrl: '' }),
    });
    await u.findByText('7 new');
    expect(u.queryByText('Rīta saruna')).toBeNull();
    expect(u.queryByText('AI episode')).toBeNull();
    expect(u.queryByText(/only words you know/)).toBeNull();
  });
});
