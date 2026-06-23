// Tests for useRecordingAllowed (D3c — GDPR record-affordance gate).
// The hook reads profile.getRecConsent() and defaults to false until consent resolves true.
// Module E's record button and production cards' mic affordance MUST gate on this.
// NOTE: .ts file because renderHook works with the node/ts-jest project too.
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ServiceProvider } from '../services/ServiceProvider';
import type { ProfileService, ServiceBundle } from '../services/index';
import {
  StubAudioService,
  StubRecorderService,
  StubSrsService,
  StubKnownWordsStore,
  StubProgressService,
  StubPodcastService,
  StubProfileService,
} from '../services/stubs';
import { useRecordingAllowed } from './useRecordingAllowed';

function makeProfile(recConsent: boolean): ProfileService {
  const stub = new StubProfileService();
  void stub.setRecConsent(recConsent);
  return stub;
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
  };
}

function makeWrapper(profile: ProfileService): ({ children }: { children: React.ReactNode }) => React.JSX.Element {
  const services = makeServices(profile);
  return function Wrap({ children }: { children: React.ReactNode }): React.JSX.Element {
    return <ServiceProvider services={services}>{children}</ServiceProvider>;
  };
}

it('returns false by default (before consent resolves)', () => {
  const profile = makeProfile(false);
  const { result } = renderHook(() => useRecordingAllowed(), {
    wrapper: makeWrapper(profile),
  });
  // Initial synchronous value must be false (GDPR default)
  expect(result.current).toBe(false);
});

it('remains false when rec_consent is false', async () => {
  const profile = makeProfile(false);
  const { result } = renderHook(() => useRecordingAllowed(), {
    wrapper: makeWrapper(profile),
  });
  await waitFor(() => {
    // After async resolution, must still be false
    expect(result.current).toBe(false);
  });
});

it('returns true when rec_consent is true', async () => {
  const profile = makeProfile(true);
  const { result } = renderHook(() => useRecordingAllowed(), {
    wrapper: makeWrapper(profile),
  });
  await waitFor(() => {
    expect(result.current).toBe(true);
  });
});

it('GDPR contract: record affordance stays hidden (false) when consent is false', async () => {
  // This test documents the GDPR invariant that Module E's record button MUST respect:
  // without consent, useRecordingAllowed() returns false and the mic affordance must be absent.
  const profile = makeProfile(false);
  const { result } = renderHook(() => useRecordingAllowed(), {
    wrapper: makeWrapper(profile),
  });
  await waitFor(() => {
    expect(result.current).toBe(false);
  });
  // The caller (Module E) is responsible for not rendering the record button when false.
  // This test asserts the hook's contract, not the UI: if this is true, E can gate on it.
});
