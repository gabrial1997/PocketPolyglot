// SessionController integration test — drives the REAL useSession hook (via SessionHost) with
// injected fake services and asserts the i+1 phrase gate: a phrase whose component lemmas are
// mostly unknown renders the 'phrase/locked' screen. (decideKind's pure logic is unit-tested in
// decideKind.test.ts; this verifies the wiring through the controller.)
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { SessionHost } from '../navigation';
import type { ServiceBundle } from '../services';
import type { ReviewItem } from '../types/reviewItem';

// SessionHost's barrel pulls AuthProvider -> supabaseClient (constructs a network client at
// import). Stub it so this suite never builds a real Supabase client.
jest.mock('../services/supabaseClient', () => ({ supabase: {} }));

jest.setTimeout(30000);

const lockedPhrase: ReviewItem = {
  id: 'ph-locked',
  type: 'phrase',
  stage: 'new',
  reps: 0,
  target: 'Vienu kafiju, lūdzu.',
  gloss: 'One coffee, please.',
  audio: { nativeUrl: 'x.mp3' },
  componentLemmaIds: ['viens', 'kafija', 'ludzu'], // 2 unknown -> locked
};

function fakeServices(batch: ReviewItem[], known: ReadonlySet<string>): ServiceBundle {
  return {
    audio: { play: async () => {}, stop: async () => {}, isPlaying: () => false },
    recorder: { start: async () => {}, stop: async () => 'rec://x', isRecording: () => false },
    srs: {
      getDueBatch: async () => batch,
      submit: async () => ({ nextReviewLabel: 'Tomorrow' }),
      getDueSummary: async () => ({ newCount: 0, reviewCount: 0 }),
    },
    known: { has: (id) => known.has(id), all: () => known, refresh: async () => {} },
    progress: { getCoverage: async () => ({ known: 0, total: 1000 }) },
    podcast: { getEpisode: async () => ({ title: 'x', transcript: '', audioUrl: 'x' }) },
  };
}

function renderHost(batch: ReviewItem[], known: ReadonlySet<string>) {
  return render(
    <ThemeProvider>
      <ServiceProvider services={fakeServices(batch, known)}>
        <SessionHost onExit={() => undefined} />
      </ServiceProvider>
    </ThemeProvider>,
  );
}

// Poll with REAL timer ticks until `check` passes or the deadline elapses (then rethrow).
async function settle(check: () => void, stepMs = 25, maxSteps = 200) {
  for (let i = 0; i < maxSteps; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, stepMs));
    });
    try {
      check();
      return;
    } catch {
      /* not ready yet — keep ticking */
    }
  }
  check(); // final attempt: throw the real assertion error if still failing
}

it('renders phrase/locked when the phrase has 2+ unknown component lemmas', async () => {
  // Only 'ludzu' is known -> 2 of 3 components unknown -> the i+1 gate locks the phrase.
  const u = renderHost([lockedPhrase], new Set(['ludzu']));
  await settle(() => expect(u.getByText('Unlocks when you know its words.')).toBeTruthy());
});
