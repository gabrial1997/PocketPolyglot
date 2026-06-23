// Integration test: signup → profile → consent gate (D4).
// Exercises the full OnboardingGate + useRecordingAllowed wiring with fake services.
// Covers:
//   1. New signup: ensureProfile called, seenDiacritics=false → orientation → dismiss → children.
//   2. Consent toggle stamps rec_consent_at (via setConsent on SupabaseProfileService fake-client).
//   3. Record affordance hidden (false) when rec_consent=false; true when flipped.
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Text, Pressable, View } from 'react-native';
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
} from '../services/stubs';
import { SupabaseProfileService } from '../services/supabase/SupabaseProfileService';
import { OnboardingGate } from './OnboardingGate';
import { useRecordingAllowed } from './useRecordingAllowed';

// ---- Helpers -----------------------------------------------------------

/** Configurable fake ProfileService for integration testing. */
class FakeProfileService implements ProfileService {
  private snap: ProfileSnapshot;
  public ensureCount = 0;
  public setSeenCount = 0;
  public setConsentPayloads: { rec: boolean; training: boolean }[] = [];

  constructor(initial: Partial<ProfileSnapshot> = {}) {
    this.snap = {
      recConsent: false,
      trainingConsent: false,
      seenDiacritics: false,
      ...initial,
    };
  }

  async ensureProfile(): Promise<void> {
    this.ensureCount++;
  }
  async getProfile(): Promise<ProfileSnapshot | null> {
    return { ...this.snap };
  }
  async getRecConsent(): Promise<boolean> {
    return this.snap.recConsent;
  }
  async setRecConsent(value: boolean): Promise<void> {
    this.snap.recConsent = value;
  }
  async deleteRecordings(): Promise<void> { /* no-op */ }
  async setSeenDiacritics(): Promise<void> {
    this.setSeenCount++;
    this.snap.seenDiacritics = true;
  }
  async setConsent(input: { rec: boolean; training: boolean }): Promise<void> {
    this.setConsentPayloads.push(input);
    this.snap.recConsent = input.rec;
    this.snap.trainingConsent = input.training;
  }
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

function setupGate(profile: FakeProfileService, childText = 'Children rendered') {
  const utils = render(
    <ThemeProvider>
      <ServiceProvider services={makeServices(profile)}>
        <OnboardingGate>
          <Text>{childText}</Text>
        </OnboardingGate>
      </ServiceProvider>
    </ThemeProvider>,
  );
  return utils;
}

// ---- Integration Test 1: New signup path --------------------------------

describe('new signup flow', () => {
  it('ensureProfile called, seenDiacritics=false → orientation shown → dismiss → children rendered', async () => {
    const profile = new FakeProfileService({ seenDiacritics: false });
    const { findByText, getByText, queryByText } = setupGate(profile);

    // Orientation screen appears
    await findByText('Got it');
    expect(queryByText('Children rendered')).toBeNull();

    // ensureProfile was called before we got here
    expect(profile.ensureCount).toBe(1);

    // Dismiss the orientation screen
    await act(async () => {
      fireEvent.press(getByText('Got it'));
    });

    // setSeenDiacritics was called
    expect(profile.setSeenCount).toBeGreaterThanOrEqual(1);

    // Children now rendered
    await waitFor(() => {
      expect(getByText('Children rendered')).toBeTruthy();
    });
  });
});

// ---- Integration Test 2: Consent toggle stamps rec_consent_at -----------

describe('consent toggle stamps rec_consent_at', () => {
  it('setConsent({rec:true,training:false}) records a non-null rec_consent_at', async () => {
    // We test via SupabaseProfileService's fake-client pattern
    // (mirrors SupabaseProfileService.test.ts §D3a).
    // Build a minimal fake client that records the update payload.
    const updatePayloads: Record<string, unknown>[] = [];
    const fakeClient = {
      from(_table: string) {
        return {
          update(payload: Record<string, unknown>) {
            updatePayloads.push(payload);
            return {
              eq(_col: string, _val: unknown) {
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
          select(_cols: string) {
            return {
              eq(_col: string, _val: unknown) {
                return {
                  async maybeSingle() {
                    return { data: { rec_consent: false, training_consent: false, settings: {} }, error: null };
                  },
                };
              },
            };
          },
          insert(_payload: Record<string, unknown>) {
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };

    const svc = new SupabaseProfileService(fakeClient as never, 'user-test');

    await svc.setConsent({ rec: true, training: false });

    const payload = updatePayloads[0];
    if (!payload) throw new Error('Expected setConsent to call update but no payload recorded');
    expect(payload.rec_consent).toBe(true);
    expect(typeof payload.rec_consent_at).toBe('string');
    // Must be a valid ISO timestamp
    expect(() => new Date(payload.rec_consent_at as string).toISOString()).not.toThrow();
  });
});

// ---- Integration Test 3: Record affordance gate -------------------------

/** Minimal harness: renders a record button only when useRecordingAllowed() is true. */
function RecordButtonHarness(): React.JSX.Element {
  const allowed = useRecordingAllowed();
  return (
    <View>
      {allowed ? <Pressable accessibilityRole="button"><Text>Record</Text></Pressable> : null}
      <Text testID="allowed-status">{allowed ? 'allowed' : 'blocked'}</Text>
    </View>
  );
}

describe('record affordance gate (GDPR)', () => {
  it('record button absent when rec_consent=false', async () => {
    const profile = new FakeProfileService({ recConsent: false });
    const { queryByText, getByTestId } = render(
      <ThemeProvider>
        <ServiceProvider services={makeServices(profile)}>
          <RecordButtonHarness />
        </ServiceProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('allowed-status').props.children).toBe('blocked');
    });
    expect(queryByText('Record')).toBeNull();
  });

  it('record button present when rec_consent=true', async () => {
    const profile = new FakeProfileService({ recConsent: true });
    const { findByText, getByTestId } = render(
      <ThemeProvider>
        <ServiceProvider services={makeServices(profile)}>
          <RecordButtonHarness />
        </ServiceProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('allowed-status').props.children).toBe('allowed');
    });
    await findByText('Record');
  });

  // useRecordingAllowed reads consent ONCE on mount (useEffect + [profile] dep).
  // A mid-session flip on the SAME service instance does NOT re-trigger the hook —
  // re-reading requires a remount (new profile reference passed to ServiceProvider).
  // The two tests below document this contract:
  //   1. Remount with a fresh service instance that has recConsent=true → shows button.
  //   2. Mutating the stable instance's consent without remount → button stays hidden.
  // Test (1) also catches the "default-true regression" — if the hook defaulted to true,
  // the blocked assertion at the start of this describe block would fail.

  it('shows record affordance when consent is already true on mount (remount path)', async () => {
    // Hold a STABLE profile reference whose consent starts false, then swap to a NEW
    // instance (recConsent=true) — this simulates the "service changes" path (e.g.
    // settings screen remounts the subtree with updated profile) and exercises the
    // hook re-reading on a new mount.
    let profileRef = new FakeProfileService({ recConsent: false });

    function RemountHarness({ profile }: { profile: FakeProfileService }): React.JSX.Element {
      return (
        <ServiceProvider services={makeServices(profile)}>
          <RecordButtonHarness />
        </ServiceProvider>
      );
    }

    const { getByTestId, rerender, queryByText } = render(
      <ThemeProvider>
        <RemountHarness profile={profileRef} />
      </ThemeProvider>,
    );

    // Initially blocked — catches any "default-true" regression.
    await waitFor(() => {
      expect(getByTestId('allowed-status').props.children).toBe('blocked');
    });
    expect(queryByText('Record')).toBeNull();

    // Swap to a NEW service instance with recConsent=true.
    // The [profile] dep in useRecordingAllowed triggers a fresh read.
    profileRef = new FakeProfileService({ recConsent: true });
    await act(async () => {
      rerender(
        <ThemeProvider>
          <RemountHarness profile={profileRef} />
        </ThemeProvider>,
      );
    });

    await waitFor(() => {
      expect(getByTestId('allowed-status').props.children).toBe('allowed');
    });
  });

  it('does NOT show record affordance when consent is mutated on a stable instance without remount', async () => {
    // Demonstrates the hook's read-once-on-mount contract: mutating the service
    // object's internal state without changing the profile reference does not trigger
    // a re-read. A live mid-session flip requires a remount (new profile ref).
    const stableProfile = new FakeProfileService({ recConsent: false });

    const { getByTestId, queryByText } = render(
      <ThemeProvider>
        <ServiceProvider services={makeServices(stableProfile)}>
          <RecordButtonHarness />
        </ServiceProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('allowed-status').props.children).toBe('blocked');
    });
    expect(queryByText('Record')).toBeNull();

    // Mutate the stable instance — consent is now true internally.
    await act(async () => {
      await stableProfile.setRecConsent(true);
    });

    // The hook does NOT re-read: button stays absent.
    // (If useRecordingAllowed ever gains a live-update subscription, this test
    // should be updated to assert 'allowed' instead.)
    expect(queryByText('Record')).toBeNull();
    expect(getByTestId('allowed-status').props.children).toBe('blocked');
  });
});
