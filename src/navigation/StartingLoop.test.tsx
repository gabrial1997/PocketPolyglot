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
  // envelope required: word/say's result stage only offers the "Native" compare row when the item
  // has real audio (hasAudio = !!envelope — never a silent playback offer), and submitSpeakRetest
  // uses that row as its result-stage marker.
  audio: { nativeUrl: `${id}.mp3`, envelope: [0.2, 0.6, 1] },
  // choices required: the word/hear retest card (expanded by expandLearningSteps) is a MC quiz and
  // needs choices to be completable. One correct option matching the gloss suffices.
  choices: [{ value: id, gloss: id, correct: true }, { value: `other-${id}`, gloss: `other-${id}`, correct: false }],
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
  // envelope included for production-rung gating (phrase/sayit requires audio); stage=new always
  // routes to phrase/hear regardless of audio (Task 4 routing: new→hear, review→meaning/sayit).
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
    progress: { getCoverage: async () => ({ total: 1000, knownRanks: [] as number[] }) },
    podcast: { getEpisode: async () => ({ title: 'x', transcript: '', audioUrl: 'x' }) },
    profile: { getRecConsent: async () => false, setRecConsent: async () => {}, deleteRecordings: async () => {}, getProfile: async () => null, ensureProfile: async () => {}, setSeenDiacritics: async () => {}, setSeenConsent: async () => {}, setConsent: async () => {}, deleteAccount: async () => {} },
    editor: { isEditor: async () => false, edit: async () => {} },
    bugReport: { submit: async () => {} },
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

// expandLearningSteps (Task 1) emits a group's steps in THREE separate passes — all intros, then
// all MC retests, then all speak retests (never interleaved per word: [intro×N, mc×N, speak×N]).
// These two helpers drive one word through its MC copy (word/hear) and its speak copy (word/say)
// respectively; callers must run ALL words' MC retests before ANY word's speak retest.

// MC retest (word/hear): the correct choice's label is the gloss (= w for these test words); tap
// it to auto-advance. During a glide both the leaving and entering cards are briefly mounted, so
// press the last match.
async function submitMcRetest(u: ReturnType<typeof render>, w: string): Promise<void> {
  await settle(() => expect(u.getAllByText(w).length).toBeGreaterThanOrEqual(1));
  const matches = u.getAllByText(w);
  fireEvent.press(matches[matches.length - 1]);
  // Wait for the auto-advance delay (ADVANCE_DELAY_MS = 500ms in WordHear) and the glide onward.
  await settle(() => undefined, 25, 30);
}

// Speak retest (word/say — with >=2 choices, renderFor now routes retest:'speak' here instead of
// word/hear): 'choose' -> pick the correct word -> 'speak'/'rec' (recConsent is false in these
// fakes, so the footer shows a plain "Continue" CTA instead of the mic; it calls m.finishRec()) ->
// 'result' -> "Continue" fires onComplete.
async function submitSpeakRetest(u: ReturnType<typeof render>, w: string): Promise<void> {
  // Wait for the choose-stage prompt specifically (not just text === w): during the glide from the
  // preceding card, stale text can still match a bare getAllByText(w) before word/say even mounts.
  await settle(() => expect(u.getByText('Which word says it?')).toBeTruthy());
  const matches = u.getAllByText(w);
  fireEvent.press(matches[matches.length - 1]);
  // Correct pick holds a green confirm for CONFIRM_MS (420ms) then advances 'choose' -> 'speak'.
  // Require the choose-stage prompt to be GONE, not just "Continue" present: a still-lingering
  // leaving frame from the PREVIOUS word's *result* stage also renders "Continue" (both 'speak'
  // and 'result' do), so it can satisfy a bare "Continue" check before this card has even left
  // 'choose', causing the next press to hit that stale leftover instead of this card.
  await settle(() => {
    expect(u.queryByText('Which word says it?')).toBeNull();
    expect(u.getAllByText('Continue').length).toBeGreaterThanOrEqual(1);
  }, 25, 30);

  // 'speak'/'rec' stage: recConsent is false, so the footer shows "Continue" instead of the mic —
  // pressing it (the entering copy — last match, per the file's glide convention) calls
  // m.finishRec(), moving to 'result'.
  let continues = u.getAllByText('Continue');
  fireEvent.press(continues[continues.length - 1]);

  // 'result' stage: the "Native"/"You" compare-row labels are unique to it (unlike "Continue",
  // which both 'speak' and 'result' render) — wait for that marker before pressing on.
  await settle(() => {
    expect(u.getAllByText('Native').length).toBeGreaterThanOrEqual(1);
    expect(u.getAllByText('Continue').length).toBeGreaterThanOrEqual(1);
  }, 10, 30);
  continues = u.getAllByText('Continue');
  fireEvent.press(continues[continues.length - 1]);
  await settle(() => undefined, 25, 50);
}

// Updated 2026-07-23 (earned-phrase gating): same-session unlock is impossible BY DESIGN now — a
// phrase's components only read as "known" once they're EARNED (correct recognition/recall in a
// DIFFERENT round or day than their own intro; see src/session/earned.ts), never from in-session
// learning. So this regression walk seeds the phrase's components as already-earned (as if learned
// on an earlier day) and drives straight from the unlock reveal into the hear card — still
// exercising the exact unlock->hear glide/audio-loop regression this test guards.
it('unlock -> hear: the hear card actually appears (no freeze/loop)', async () => {
  const play = jest.fn(async () => {});
  const u = render(
    <ThemeProvider>
      <ServiceProvider
        services={fakeServices([phrase], play, new Set(['labdien', 'es', 'esmu']))}
      >
        <SessionHost onExit={() => undefined} />
      </ServiceProvider>
    </ThemeProvider>,
  );

  // All words already earned (an earlier day/round) -> the phrase's first (and only) encounter is
  // the one-time unlock reveal (the chime card; Eyebrow-style uppercase label) — no locked stage.
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

// Remount-key regression (2026-07-06): adjacent queue entries can legitimately share id + kind —
// a new word with NO wordClass renders its INTRO as word/hear (renderFor's learn templates all
// require a wordClass, so it falls through), and its MC retest copy is also word/hear. With the
// viewport keyed on id:kind alone the second encounter never remounted: the learner stared at the
// first card's completed (green, disabled) state and the session froze. The key now includes the
// queue position (session.step), so every position remounts.
it('intro word/hear followed by a same-kind MC retest: the retest remounts fresh (no frozen card)', async () => {
  const play = jest.fn(async () => {});
  const noClassWord: ReviewItem = {
    id: 'w1',
    type: 'word',
    stage: 'new',
    reps: 0,
    // Deliberately NO wordClass: the intro and the MC retest both render word/hear (same id+kind).
    target: 'w1',
    gloss: 'w1',
    // envelope so the word/say result stage offers the "Native" row (submitSpeakRetest's marker).
    audio: { nativeUrl: 'w1.mp3', envelope: [0.2, 0.6, 1] },
    choices: [
      { value: 'w1', gloss: 'w1', correct: true },
      { value: 'other-w1', gloss: 'other-w1', correct: false },
    ],
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  const onExit = jest.fn();
  const u = render(
    <ThemeProvider>
      <ServiceProvider services={fakeServices([noClassWord], play)}>
        <SessionHost onExit={onExit} />
      </ServiceProvider>
    </ThemeProvider>,
  );

  // Encounter 1: the intro, rendered as a word/hear MC quiz (kind word/hear, id w1). Answer it.
  // (submitMcRetest can't drive back-to-back SAME-word encounters — its presence check would pass
  // on the still-showing first card before the 500ms advance delay fires — so walk manually.)
  await settle(() => expect(u.getAllByText('w1').length).toBeGreaterThanOrEqual(1));
  let matches = u.getAllByText('w1');
  fireEvent.press(matches[matches.length - 1]);

  // Wait for the deck to ADVANCE to position 2 (the MC retest). Same id + kind, so the card text
  // cannot distinguish the encounters — the SessionTop step counter can.
  await settle(() => expect(u.getByText('2/3')).toBeTruthy());

  // Encounter 2: the MC retest copy — SAME id + kind — must be a FRESH card. The frozen-card
  // symptom: encounter 1's completed card (green, disabled choices) stayed the rendered node, this
  // press hit a disabled choice, and the session never finished.
  matches = u.getAllByText('w1'); // during the glide the entering (fresh) card is the last match
  fireEvent.press(matches[matches.length - 1]);

  // Encounter 3: the speak retest (word/say — the item has >=2 choices).
  await submitSpeakRetest(u, 'w1');

  // All three expanded steps completed -> the batch is done -> SessionHost bounces home.
  await settle(() => expect(onExit).toHaveBeenCalled());
});

// Mirrors the SEEDED golden-slice walk: the FIRST teaser the user meets is 'Vienu kafiju, lūdzu.'
// (ph-kafija). Its components are viens/kafija/ludzu; viens + kafija are already earned, ludzu is
// not. Updated 2026-07-23 (earned-phrase gating): learning ludzu in-session no longer earns it for
// this session's gate (earned = a DIFFERENT round/day than the intro) — the teaser shows exactly
// once and the session ends without the phrase ever reappearing, even after ludzu's full arc.
it('seed walk: ph-kafija locked on one word -> learn ludzu in-session -> phrase does NOT re-surface this session', async () => {
  const play = jest.fn(async () => {});
  const onExit = jest.fn();
  const kafijaPhrase: ReviewItem = {
    id: 'ph-kafija',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Vienu kafiju, lūdzu.',
    gloss: 'One coffee, please.',
    audio: { nativeUrl: 'ph-kafija.mp3', envelope: [0.2, 0.6, 1] },
    componentLemmaIds: ['viens', 'kafija', 'ludzu'], // viens + kafija pre-earned; ludzu is the blocker
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  const u = render(
    <ThemeProvider>
      <ServiceProvider
        services={fakeServices([kafijaPhrase, word('ludzu')], play, new Set(['viens', 'kafija']))}
      >
        <SessionHost onExit={onExit} />
      </ServiceProvider>
    </ThemeProvider>,
  );

  // Phrase starts LOCKED — two of three components already earned, ludzu still missing.
  await settle(() => expect(u.getByText('UPCOMING PHRASE')).toBeTruthy());
  fireEvent.press(u.getByLabelText('Continue')); // gate advance -> NOT re-queued (teaser shows once)

  // Learn the single blocking word anyway (word/learn-* intro card, then its MC + speak retests).
  await settle(() => expect(u.getByText('ludzu')).toBeTruthy());
  const continues = u.getAllByText('Continue');
  fireEvent.press(continues[continues.length - 1]);
  await submitMcRetest(u, 'ludzu');
  await submitSpeakRetest(u, 'ludzu');

  // The batch is exhausted -> SessionHost bounces out. The phrase never re-surfaced this session:
  // no unlock reveal, no hear card.
  await settle(() => expect(onExit).toHaveBeenCalled());
  expect(u.queryByText('PHRASE UNLOCKED')).toBeNull();
  expect(u.queryByText('NEW PHRASE')).toBeNull();
});
