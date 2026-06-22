// Integration regression for the starting-loop device-walk bugs (2026-06-19):
//   - "phrases do not have the chime card after learning all the words"
//   - "phrase cards play on a loop"
// Both trace to one root cause: a gated phrase keeps the SAME row id across its
// locked -> unlock -> hear renders, and SessionHost keyed GlideViewport on item.id alone, so the
// unlock -> hear swap was a same-key children change. GlideViewport left the stale unlock node
// mounted (hear never appeared) and never settled, so the phrase audio kept re-firing.
//
// This drives the REAL SessionController + GlideViewport with injected fakes, spying on audio.play.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { SessionHost } from './index';
import type { ServiceBundle } from '../services';
import type { ReviewItem } from '../types/reviewItem';

jest.mock('../services/supabaseClient', () => ({ supabase: {} }));
jest.setTimeout(30000);

const word = (id: string): ReviewItem => ({
  id,
  type: 'word',
  stage: 'new',
  reps: 0,
  wordClass: 'function',
  target: id,
  gloss: id,
  pron: id,
  audio: { nativeUrl: `${id}.mp3` },
  receptiveReps: 0,
  productiveReps: 0,
  translationVisibility: 'auto',
});

const phrase: ReviewItem = {
  id: 'p1',
  type: 'phrase',
  stage: 'new',
  reps: 0,
  target: 'Labdien, es esmu ___.',
  gloss: 'Hello, I am ___.',
  // envelope required: B3 audio gate routes stage=new phrases to phrase/hear (shows "NEW PHRASE")
  // only when audio.envelope is present; without it falls back to phrase/meaning.
  audio: { nativeUrl: 'p1.mp3', envelope: [0.2, 0.6, 1] },
  componentLemmaIds: ['labdien', 'es', 'esmu'],
  receptiveReps: 0,
  productiveReps: 0,
  translationVisibility: 'auto',
};

function fakeServices(
  batch: ReviewItem[],
  play: jest.Mock,
  knownIds: Set<string> = new Set<string>(),
): ServiceBundle {
  return {
    audio: { play, stop: async () => {}, isPlaying: () => false, preload: () => {}, subscribe: () => () => {} },
    recorder: { start: async () => {}, stop: async () => 'rec://x', isRecording: () => false },
    srs: {
      getDueBatch: async () => batch,
      submit: async () => ({ nextReviewLabel: 'Tomorrow', rung: 'recognition' as const }),
      getDueSummary: async () => ({ newCount: 0, reviewCount: 0 }),
    },
    known: { has: (id: string) => knownIds.has(id), all: () => knownIds, refresh: async () => {} },
    progress: { getCoverage: async () => ({ known: 0, total: 1000 }) },
    podcast: { getEpisode: async () => ({ title: 'x', transcript: '', audioUrl: 'x' }) },
    profile: { getRecConsent: async () => false, setRecConsent: async () => {}, deleteRecordings: async () => {} },
  };
}

async function settle(check: () => void, stepMs = 25, maxSteps = 200) {
  for (let i = 0; i < maxSteps; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, stepMs));
    });
    try {
      check();
      return;
    } catch {
      /* keep ticking */
    }
  }
  check();
}

it('locked -> learn 3 words -> unlock -> hear: the hear card actually appears (no freeze/loop)', async () => {
  const play = jest.fn(async () => {});
  const u = render(
    <ThemeProvider>
      <ServiceProvider services={fakeServices([phrase, word('labdien'), word('es'), word('esmu')], play)}>
        <SessionHost onExit={() => undefined} />
      </ServiceProvider>
    </ThemeProvider>,
  );

  // Phrase starts LOCKED (the dim upcoming-phrase glimpse; Eyebrow renders uppercase).
  await settle(() => expect(u.getByText('UPCOMING PHRASE')).toBeTruthy());
  fireEvent.press(u.getByLabelText('Continue')); // gate advance -> re-queue after esmu

  // Learn the three component words (each is a word/learn-function card). During a glide both the
  // leaving and entering cards are briefly mounted, so press the entering card's Continue (last).
  for (const w of ['labdien', 'es', 'esmu']) {
    await settle(() => expect(u.getByText(w)).toBeTruthy());
    const continues = u.getAllByText('Continue');
    fireEvent.press(continues[continues.length - 1]);
  }

  // All words known -> the one-time unlock reveal (the chime card; Eyebrow-style uppercase label).
  await settle(() => expect(u.getByText('PHRASE UNLOCKED')).toBeTruthy());

  // It auto-flows into hearing the phrase. THIS is the bug: previously the unlock node froze and
  // the hear card never mounted. Allow the unlock hold + glide to settle.
  await settle(() => expect(u.getByText('NEW PHRASE')).toBeTruthy());
  // After the glide commits (the leaving unlock layer unmounts) only the hear card remains.
  await settle(() => {
    expect(u.getByText('NEW PHRASE')).toBeTruthy();
    expect(u.queryByText('PHRASE UNLOCKED')).toBeNull();
  });

  // ...and it must not LOOP. The hear card says the clip then repeats it ONCE; after that the play
  // count must be stable, not climbing (the device-walk "phrase cards play on a loop" symptom).
  await settle(() => undefined, 25, 30); // let the say + single repeat fire
  const after = play.mock.calls.length;
  await settle(() => undefined, 25, 40); // ~1s more with no interaction
  expect(play.mock.calls.length).toBe(after); // no further plays — not looping
});

// Mirrors the SEEDED golden-slice walk after the Task 5 re-tune: the FIRST unlock the user meets is
// 'Vienu kafiju, lūdzu.' (ph-kafija). Its components are viens/kafija/ludzu, but viens + kafija are
// in knownForTestUser, so only ONE word (ludzu) must be learned in-session before the unlock fires.
// The seed orders ph-kafija(1) -> ludzu(2), so the batch reaching the controller is [phrase, ludzu].
it('seed walk: ph-kafija locked on one word -> learn ludzu -> unlock fires (single-word path)', async () => {
  const play = jest.fn(async () => {});
  const kafijaPhrase: ReviewItem = {
    id: 'ph-kafija',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Vienu kafiju, lūdzu.',
    gloss: 'One coffee, please.',
    // envelope required: B3 audio gate routes stage=new phrases to phrase/hear ("NEW PHRASE")
    // only when audio.envelope is present; without it falls back to phrase/meaning.
    audio: { nativeUrl: 'ph-kafija.mp3', envelope: [0.2, 0.6, 1] },
    componentLemmaIds: ['viens', 'kafija', 'ludzu'], // viens + kafija pre-known; ludzu is the blocker
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  const u = render(
    <ThemeProvider>
      <ServiceProvider
        services={fakeServices([kafijaPhrase, word('ludzu')], play, new Set(['viens', 'kafija']))}
      >
        <SessionHost onExit={() => undefined} />
      </ServiceProvider>
    </ThemeProvider>,
  );

  // Phrase starts LOCKED — two of three components already known, ludzu still missing.
  await settle(() => expect(u.getByText('UPCOMING PHRASE')).toBeTruthy());
  fireEvent.press(u.getByLabelText('Continue')); // gate advance -> re-queue after ludzu

  // Learn the single blocking word.
  await settle(() => expect(u.getByText('ludzu')).toBeTruthy());
  const continues = u.getAllByText('Continue');
  fireEvent.press(continues[continues.length - 1]);

  // All three components now known -> the one-time unlock reveal (the chime card) fires...
  await settle(() => expect(u.getByText('PHRASE UNLOCKED')).toBeTruthy());
  // ...and flows into hearing the new phrase, exactly as the multi-word loop does.
  await settle(() => expect(u.getByText('NEW PHRASE')).toBeTruthy());
});
