// Behavior tests for OnboardingGate (D3c).
// Uses a fake ProfileService + ServiceProvider to test the state machine:
//  loading → orientation? → children
// Orientation is shown ONLY when seenDiacritics=false; returning users go straight to children.
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import type { ProfileService, ProfileSnapshot, ServiceBundle } from '../services/index';
import {
  StubAudioService,
  StubRecorderService,
  StubSrsService,
  StubKnownWordsStore,
  StubProgressService,
  StubPodcastService,
  StubBugReportService,
} from '../services/stubs';
import { OnboardingGate } from './OnboardingGate';

// ---- Fake ProfileService -----------------------------------------------

interface FakeProfileOpts {
  snapshot?: Partial<ProfileSnapshot>;
}

function makeFakeProfile(opts: FakeProfileOpts = {}): ProfileService & {
  ensureCallCount: number;
  setSeenCalls: number;
} {
  let ensureCallCount = 0;
  let setSeenCalls = 0;
  const snap: ProfileSnapshot = {
    recConsent: false,
    trainingConsent: false,
    seenDiacritics: false,
    ...opts.snapshot,
  };

  const svc = {
    get ensureCallCount() { return ensureCallCount; },
    get setSeenCalls() { return setSeenCalls; },

    async ensureProfile() { ensureCallCount++; },
    async getProfile(): Promise<ProfileSnapshot | null> {
      return snap;
    },
    async getRecConsent() { return snap.recConsent; },
    async setRecConsent(v: boolean) { snap.recConsent = v; },
    async deleteRecordings() { /* no-op */ },
    async setSeenDiacritics() {
      setSeenCalls++;
      snap.seenDiacritics = true;
    },
    async setConsent(input: { rec: boolean; training: boolean }) {
      snap.recConsent = input.rec;
      snap.trainingConsent = input.training;
    },
  };
  return svc;
}

function makeServices(profile: ProfileService): ServiceBundle {
  return {
    audio: new StubAudioService(),
    recorder: new StubRecorderService(),
    srs: new StubSrsService(),
    known: new StubKnownWordsStore(),
    progress: new StubProgressService(),
    podcast: new StubPodcastService(),
    profile,
    editor: { isEditor: async () => false, edit: async () => {} },
    bugReport: new StubBugReportService(),
  };
}

function setup(profile: ReturnType<typeof makeFakeProfile>, childText = 'App is ready') {
  const utils = render(
    <ThemeProvider>
      <ServiceProvider services={makeServices(profile)}>
        <OnboardingGate>
          <Text>{childText}</Text>
        </OnboardingGate>
      </ServiceProvider>
    </ThemeProvider>,
  );
  return { ...utils };
}

// ---- Tests ---------------------------------------------------------------

describe('OnboardingGate — new user (seenDiacritics: false)', () => {
  it('shows orientation screen and NOT the app children', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: false } });
    const { queryByText, getAllByText } = setup(profile);

    await waitFor(() => {
      // "Got it" is on the DiacriticOrientationScreen
      expect(getAllByText('Got it').length).toBeGreaterThanOrEqual(1);
    });
    // Children must NOT be visible yet
    expect(queryByText('App is ready')).toBeNull();
  });

  it('pressing "Got it" calls setSeenDiacritics and then reveals children', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: false } });
    const { getByText, findByText } = setup(profile);

    // Wait for orientation to appear
    const gotIt = await findByText('Got it');
    expect(profile.setSeenCalls).toBe(0);

    await act(async () => {
      fireEvent.press(gotIt);
    });

    // setSeenDiacritics must have been called
    expect(profile.setSeenCalls).toBeGreaterThanOrEqual(1);
    // Children should now be visible
    await waitFor(() => {
      expect(getByText('App is ready')).toBeTruthy();
    });
  });
});

describe('OnboardingGate — returning user (seenDiacritics: true)', () => {
  it('renders children immediately without showing orientation screen', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: true } });
    const { findByText, queryByText } = setup(profile);

    await findByText('App is ready');
    // Orientation screen "Got it" must never appear
    expect(queryByText('Got it')).toBeNull();
  });
});

describe('OnboardingGate — ensureProfile called before getProfile', () => {
  it('calls ensureProfile exactly once before getProfile resolves', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: true } });
    const { findByText } = setup(profile);

    // Wait for the gate to finish loading
    await findByText('App is ready');
    // ensureProfile should have been called once
    expect(profile.ensureCallCount).toBe(1);
  });
});
