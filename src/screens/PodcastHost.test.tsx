// Behavior test for PodcastHost — the Tier-B `pod` host. It pulls an episode from the injected
// PodcastService and plays via the injected AudioService; PodcastScreen stays pure. We inject a
// fake bundle and assert the title shows, the play orb plays the episode URL, and the transcript
// can be revealed. Mirrors WordPicReview.test.tsx style.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { PodcastHost } from './PodcastHost';

function renderHost() {
  const audio = {
    play: jest.fn(async () => {}),
    stop: async () => {},
    isPlaying: () => false,
    preload: () => {},
    subscribe: () => () => {},
  };
  const services = {
    ...createStubServices(),
    audio,
    podcast: {
      getEpisode: async () => ({
        title: 'Latvian café chat',
        transcript: 'Sveiki!',
        audioUrl: 'ep://1',
      }),
    },
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

  it('plays the episode audio via the injected AudioService when the orb is tapped', async () => {
    const u = renderHost();
    await u.findByText('Latvian café chat');
    // Visual-sync: the VoiceOrb starts in the playing state, so its toggle is labelled "Pause".
    fireEvent.press(u.getByLabelText('Pause'));
    expect(u.audio.play).toHaveBeenCalledWith('ep://1');
  });

  it('renders the transcript line from the episode', async () => {
    const u = renderHost();
    await u.findByText('Latvian café chat');
    // Visual-sync: the transcript is shown by default (toggle is now labelled "Transcript").
    expect(u.getByText('Transcript')).toBeTruthy();
    expect(u.getByText('Sveiki!')).toBeTruthy();
  });
});
