// HomeHost test — proves the host READS due counts from the injected srs service and renders
// them through the pure HomeScreen, and that the Start CTA invokes onStart. Only srs.getDueSummary
// is overridden so the assertion exercises the service boundary (WIRING_MAP §3).
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { HomeHost } from './HomeHost';

function renderHost(onStart = jest.fn()) {
  const services = {
    ...createStubServices(),
    srs: {
      ...createStubServices().srs,
      getDueSummary: async () => ({ newCount: 7, reviewCount: 12 }),
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
});
