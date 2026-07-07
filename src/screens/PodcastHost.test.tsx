// Behavior test for PodcastHost — the Tier-B `pod` host. It pulls an episode from the injected
// PodcastService and plays via the injected AudioService; PodcastScreen stays pure. Pins the
// honest-data contract: the orb starts idle (nothing is playing on mount), play/stop is a real
// pair (pause tap + unmount stop the audio), a missing episode renders an honest empty state
// (never the mockup sample episode), and a failed fetch is a retryable error.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { PodcastHost } from './PodcastHost';

type Episode = { title: string; transcript: string; audioUrl: string };

function renderHost(getEpisode: () => Promise<Episode> = async () => ({
  title: 'Latvian café chat',
  transcript: 'Sveiki!',
  audioUrl: 'ep://1',
})) {
  const audio = {
    play: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    isPlaying: () => false,
    preload: () => {},
    subscribe: () => () => {},
  };
  const services = {
    ...createStubServices(),
    audio,
    podcast: { getEpisode },
  };
  const utils = render(
    <ThemeProvider>
      <ServiceProvider services={services}>
        <PodcastHost />
      </ServiceProvider>
    </ThemeProvider>,
  );
  return { ...utils, audio };
}

describe('PodcastHost', () => {
  it('shows the episode title once the service resolves', async () => {
    const u = renderHost();
    expect(await u.findByText('Latvian café chat')).toBeTruthy();
  });

  it('starts idle (orb shows Play, not a fake playing state) and plays via the injected AudioService', async () => {
    const u = renderHost();
    await u.findByText('Latvian café chat');
    // Honest default: nothing is playing on mount.
    expect(u.queryByLabelText('Pause')).toBeNull();
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.audio.play).toHaveBeenCalledWith('ep://1');
  });

  it('the pause tap STOPS audio (does not restart the clip)', async () => {
    const u = renderHost();
    await u.findByText('Latvian café chat');
    fireEvent.press(u.getByLabelText('Play'));
    expect(u.audio.play).toHaveBeenCalledTimes(1);
    fireEvent.press(u.getByLabelText('Pause'));
    expect(u.audio.stop).toHaveBeenCalledTimes(1);
    expect(u.audio.play).toHaveBeenCalledTimes(1); // pause must NOT re-trigger play
  });

  it('stops audio on unmount (leaving the tab never leaves the episode playing)', async () => {
    const u = renderHost();
    await u.findByText('Latvian café chat');
    fireEvent.press(u.getByLabelText('Play'));
    u.unmount();
    expect(u.audio.stop).toHaveBeenCalledTimes(1);
  });

  it('renders the transcript line from the episode', async () => {
    const u = renderHost();
    await u.findByText('Latvian café chat');
    // Visual-sync: the transcript is shown by default (toggle is labelled "Transcript").
    expect(u.getByText('Transcript')).toBeTruthy();
    expect(u.getByText('Sveiki!')).toBeTruthy();
  });

  it('renders an honest empty state when no episode row exists — never the sample episode', async () => {
    const u = renderHost(async () => ({ title: '', transcript: '', audioUrl: '' }));
    expect(await u.findByText('No episode yet')).toBeTruthy();
    // The old mockup sample data must never surface.
    expect(u.queryByText('Rīta saruna')).toBeNull();
    expect(u.queryByText(/built from/)).toBeNull();
    expect(u.queryByLabelText('Play')).toBeNull();
  });

  it('shows a retryable error on fetch failure instead of fake episode data', async () => {
    let calls = 0;
    const u = renderHost(async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return { title: 'Latvian café chat', transcript: 'Sveiki!', audioUrl: 'ep://1' };
    });
    expect(await u.findByText('Try again')).toBeTruthy();
    expect(u.queryByText('Rīta saruna')).toBeNull();
    fireEvent.press(u.getByText('Try again'));
    expect(await u.findByText('Latvian café chat')).toBeTruthy();
  });
});
