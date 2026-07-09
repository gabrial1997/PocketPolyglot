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
  setSeenConsentCalls: number;
  setConsentPayloads: { rec: boolean; training: boolean }[];
} {
  let ensureCallCount = 0;
  let setSeenCalls = 0;
  let setSeenConsentCalls = 0;
  const setConsentPayloads: { rec: boolean; training: boolean }[] = [];
  const snap: ProfileSnapshot = {
    recConsent: false,
    trainingConsent: false,
    seenDiacritics: false,
    seenConsent: false,
    ...opts.snapshot,
  };

  const svc = {
    get ensureCallCount() { return ensureCallCount; },
    get setSeenCalls() { return setSeenCalls; },
    get setSeenConsentCalls() { return setSeenConsentCalls; },
    get setConsentPayloads() { return setConsentPayloads; },

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
    async setSeenConsent() {
      setSeenConsentCalls++;
      snap.seenConsent = true;
    },
    async setConsent(input: { rec: boolean; training: boolean }) {
      setConsentPayloads.push(input);
      snap.recConsent = input.rec;
      snap.trainingConsent = input.training;
    },
    async deleteAccount() {
      // no-op for test
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
    // seenConsent: true — this test targets the diacritics flag only; the consent step's own
    // routing is covered exhaustively in the "Task 5" describe block below.
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: false, seenConsent: true } });
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
    // seenConsent: true — a fully returning user who has decided both flags.
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: true, seenConsent: true } });
    const { findByText, queryByText } = setup(profile);

    await findByText('App is ready');
    // Orientation screen "Got it" must never appear
    expect(queryByText('Got it')).toBeNull();
  });
});

describe('OnboardingGate — ensureProfile called before getProfile', () => {
  it('calls ensureProfile exactly once before getProfile resolves', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: true, seenConsent: true } });
    const { findByText } = setup(profile);

    // Wait for the gate to finish loading
    await findByText('App is ready');
    // ensureProfile should have been called once
    expect(profile.ensureCallCount).toBe(1);
  });
});

// ---- Task 5: Consent step (gate order: loading → orientation → consent → done) -------------

describe('OnboardingGate — consent step (Task 5)', () => {
  it('shows consent once after orientation for a brand-new user', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: false, seenConsent: false } });
    const { getByText, findByText, queryByText } = setup(profile);

    // Orientation appears first
    const gotIt = await findByText('Got it');
    // Consent screen must not be visible yet
    expect(queryByText('Allow recording')).toBeNull();

    await act(async () => {
      fireEvent.press(gotIt);
    });

    // Now the consent screen is shown
    await findByText('Allow recording');
    expect(queryByText('App is ready')).toBeNull();
    // Only used getByText above once resolved; sanity check it's actually rendered.
    expect(getByText('Allow recording')).toBeTruthy();
  });

  it('shows consent directly for a returning user who has not decided', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: true, seenConsent: false } });
    const { findByText, queryByText } = setup(profile);

    // Consent shown directly — no orientation screen in between.
    await findByText('Allow recording');
    expect(queryByText('Got it')).toBeNull();
    expect(queryByText('App is ready')).toBeNull();
  });

  it('accept writes setConsent({rec:true, training}) + setSeenConsent and advances', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: true, seenConsent: false } });
    const { findByText, getByText } = setup(profile);

    const allow = await findByText('Allow recording');
    await act(async () => {
      fireEvent.press(allow);
    });

    expect(profile.setConsentPayloads).toEqual([{ rec: true, training: false }]);
    expect(profile.setSeenConsentCalls).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(getByText('App is ready')).toBeTruthy();
    });
  });

  it('decline marks seenConsent only (rec stays default-off) and advances', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: true, seenConsent: false } });
    const { findByText, getByText } = setup(profile);

    const notNow = await findByText('Not now');
    await act(async () => {
      fireEvent.press(notNow);
    });

    expect(profile.setConsentPayloads).toEqual([]);
    expect(profile.setSeenConsentCalls).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(getByText('App is ready')).toBeTruthy();
    });
  });

  it('skips consent for a user who already decided', async () => {
    const profile = makeFakeProfile({ snapshot: { seenDiacritics: true, seenConsent: true } });
    const { findByText, queryByText } = setup(profile);

    await findByText('App is ready');
    expect(queryByText('Got it')).toBeNull();
    expect(queryByText('Allow recording')).toBeNull();
  });
});
