// Behavior test for PodcastHost — the Tier-B `pod` host. It pulls an episode from the injected
// PodcastService and plays via the injected AudioService; PodcastScreen stays pure. Pins the
// honest-data contract: the orb starts idle (nothing is playing on mount), play/stop is a real
// pair (pause tap + unmount stop the audio), a missing episode renders an honest empty state
// (never the mockup sample episode), and a failed fetch is a retryable error.
//
// Also pins the 25% coverage gate (spec 2026-07-09 §1): coverage decides locked/ready BEFORE any
// episode fetch runs; locked ⇒ the episode fetch must never fire; a coverage-fetch failure is
// fail-closed (retryable HostError, never the unlocked flow).
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { PodcastHost } from './PodcastHost';
import type { ProgressCoverage } from '../services/index';

type Episode = { title: string; transcript: string; audioUrl: string };

const ranks = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

const defaultEpisode: Episode = { title: 'Latvian café chat', transcript: 'Sveiki!', audioUrl: 'ep://1' };
// 30% known — comfortably above the 25% gate, so existing episode-flow tests exercise the
// ready path without having to think about the gate.
const unlockedCoverage: ProgressCoverage = { total: 1000, knownRanks: ranks(300) };

function makeAudio() {
  return {
    play: jest.fn(async (_url: string, _opts?: { rate?: number }) => {}),
    stop: jest.fn(async () => {}),
    isPlaying: () => false,
    preload: () => {},
    subscribe: () => () => {},
  };
}

let audio: ReturnType<typeof makeAudio>;
let progress: { getCoverage: jest.Mock<Promise<ProgressCoverage>, []> };
let podcast: { getEpisode: jest.Mock<Promise<Episode>, []> };

beforeEach(() => {
  audio = makeAudio();
  progress = { getCoverage: jest.fn(async () => unlockedCoverage) };
  podcast = { getEpisode: jest.fn(async () => defaultEpisode) };
});

function renderHost(onKeepLearning?: () => void) {
  const services = {
    ...createStubServices(),
    audio,
    progress,
    podcast,
  };
  const utils = render(
    <ThemeProvider>
      <ServiceProvider services={services}>
        <PodcastHost onKeepLearning={onKeepLearning} />
      </ServiceProvider>
    </ThemeProvider>,
  );
  return { ...utils, audio, progress, podcast };
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
    podcast.getEpisode.mockResolvedValue({ title: '', transcript: '', audioUrl: '' });
    const u = renderHost();
    expect(await u.findByText('No episode yet')).toBeTruthy();
    // The old mockup sample data must never surface.
    expect(u.queryByText('Rīta saruna')).toBeNull();
    expect(u.queryByText(/\d+ words/)).toBeNull(); // the fabricated "built from 92 words" line
    expect(u.queryByText('3 min')).toBeNull();
    expect(u.queryByLabelText('Play')).toBeNull();
  });

  it('shows a retryable error on fetch failure instead of fake episode data', async () => {
    podcast.getEpisode.mockRejectedValueOnce(new Error('offline'));
    podcast.getEpisode.mockResolvedValueOnce(defaultEpisode);
    const u = renderHost();
    expect(await u.findByText('Try again')).toBeTruthy();
    expect(u.queryByText('Rīta saruna')).toBeNull();
    fireEvent.press(u.getByText('Try again'));
    expect(await u.findByText('Latvian café chat')).toBeTruthy();
  });

  // --- 25% coverage gate (spec 2026-07-09 §1) ---

  it('renders the locked screen below 25% and never fetches the episode', async () => {
    progress.getCoverage.mockResolvedValue({ total: 1000, knownRanks: ranks(100) }); // 10%
    const { findByText } = renderHost();
    await findByText('Podcasts unlock at 25%');
    await findByText(/You can follow 10% of everyday speech so far\./);
    expect(podcast.getEpisode).not.toHaveBeenCalled();
  });

  it('floors (never rounds up) the locked pct — 249/1000 must read 24%, not 25%', async () => {
    // Math.round(24.9) would say 25 — self-contradictory on a screen headlined
    // "Podcasts unlock at 25%" and out of PodcastLockedScreenProps' documented 0-24 range.
    progress.getCoverage.mockResolvedValue({ total: 1000, knownRanks: ranks(249) });
    const { findByText } = renderHost();
    await findByText(/You can follow 24% of everyday speech so far\./);
  });

  it('unlocks at exactly 250/1000 and shows the ready flow', async () => {
    progress.getCoverage.mockResolvedValue({ total: 1000, knownRanks: ranks(250) });
    podcast.getEpisode.mockResolvedValue({ title: '', transcript: '', audioUrl: '' });
    const { findByText } = renderHost();
    await findByText(/No episode yet/); // the honest empty state — episode fetch DID run
    expect(podcast.getEpisode).toHaveBeenCalledTimes(1);
  });

  it('fail-closed: coverage fetch error shows retryable HostError, not the unlocked flow', async () => {
    progress.getCoverage.mockRejectedValue(new Error('down'));
    const { findByText } = renderHost();
    await findByText(/Couldn’t load this right now/);
    expect(podcast.getEpisode).not.toHaveBeenCalled();
  });

  it('retry after coverage error refetches', async () => {
    progress.getCoverage.mockRejectedValueOnce(new Error('down'));
    progress.getCoverage.mockResolvedValueOnce({ total: 1000, knownRanks: ranks(300) });
    podcast.getEpisode.mockResolvedValue({ title: '', transcript: '', audioUrl: '' });
    const { findByText, getByText } = renderHost();
    await findByText(/Couldn’t load this right now/);
    fireEvent.press(getByText('Try again'));
    await findByText(/No episode yet/);
  });

  it('locked screen "Keep learning" invokes the onKeepLearning callback', async () => {
    progress.getCoverage.mockResolvedValue({ total: 1000, knownRanks: ranks(100) });
    const onKeepLearning = jest.fn();
    const { findByText, getByLabelText } = renderHost(onKeepLearning);
    await findByText('Podcasts unlock at 25%');
    fireEvent.press(getByLabelText('Keep learning'));
    expect(onKeepLearning).toHaveBeenCalledTimes(1);
  });
});
