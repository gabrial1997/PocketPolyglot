// SessionController integration test — drives the REAL useSession hook (via SessionHost) with
// injected fake services and asserts the i+1 phrase gate: a phrase whose component lemmas are
// mostly unknown renders the 'phrase/locked' screen. (decideKind's pure logic is unit-tested in
// decideKind.test.ts; this verifies the wiring through the controller.)
import React from 'react';
import { render, renderHook, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { SessionHost } from '../navigation';
import { useSession } from './sessionController';
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
  receptiveReps: 0,
  productiveReps: 0,
  translationVisibility: 'auto',
};

function fakeServices(batch: ReviewItem[], known: ReadonlySet<string>): ServiceBundle {
  return {
    audio: { play: async () => {}, stop: async () => {}, isPlaying: () => false, preload: () => {}, subscribe: () => () => {} },
    recorder: { start: async () => {}, stop: async () => 'rec://x', isRecording: () => false },
    srs: {
      getDueBatch: async () => batch,
      submit: async () => ({ nextReviewLabel: 'Tomorrow', rung: 'recognition' as const }),
      getDueSummary: async () => ({ newCount: 0, reviewCount: 0 }),
    },
    known: { has: (id) => known.has(id), all: () => known, refresh: async () => {} },
    progress: { getCoverage: async () => ({ known: 0, total: 1000 }) },
    podcast: { getEpisode: async () => ({ title: 'x', transcript: '', audioUrl: 'x' }) },
    profile: { getRecConsent: async () => false, setRecConsent: async () => {}, deleteRecordings: async () => {}, getProfile: async () => null, ensureProfile: async () => {}, setSeenDiacritics: async () => {}, setConsent: async () => {} },
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

// --- advance(): the gate-card path (locked/unlock are NOT reviews) ---
// A plain word that renders as a normal review card, so advance() simply steps the index.
const wordA: ReviewItem = {
  id: 'a',
  type: 'word',
  stage: 'review',
  reps: 3,
  target: 'māja',
  gloss: 'house',
  audio: { nativeUrl: 'a.mp3' },
  receptiveReps: 0,
  productiveReps: 0,
  translationVisibility: 'auto',
};
const wordB: ReviewItem = { ...wordA, id: 'b', target: 'labrīt', gloss: 'good morning' };

function renderSessionHook(batch: ReviewItem[], known: ReadonlySet<string>) {
  const services = fakeServices(batch, known);
  const submit = jest.spyOn(services.srs, 'submit');
  const utils = renderHook(() => useSession(), {
    wrapper: ({ children }) => (
      <ThemeProvider>
        <ServiceProvider services={services}>{children}</ServiceProvider>
      </ThemeProvider>
    ),
  });
  return { ...utils, submit };
}

async function settleHook(check: () => void, stepMs = 25, maxSteps = 200) {
  for (let i = 0; i < maxSteps; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, stepMs));
    });
    try {
      check();
      return;
    } catch {
      /* not ready yet */
    }
  }
  check();
}

it('advance() steps to the next item WITHOUT posting a review to SRS', async () => {
  const { result, submit } = renderSessionHook([wordA, wordB], new Set());

  // First item loads.
  await settleHook(() => expect(result.current.current?.item.id).toBe('a'));

  // Gate advance: no SRS submit, just move on.
  await act(async () => {
    result.current.advance();
  });

  await settleHook(() => expect(result.current.current?.item.id).toBe('b'));
  expect(submit).not.toHaveBeenCalled();
});

it('advances the deck even when srs.submit rejects (no dead-Continue hang — bug 4)', async () => {
  const { result, submit } = renderSessionHook([wordA, wordB], new Set());
  // The SRS post fails (e.g. a network blip). The learner must still move on, not be stranded on a
  // card whose Continue has already fired.
  submit.mockRejectedValueOnce(new Error('network down'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  await settleHook(() => expect(result.current.current?.item.id).toBe('a'));

  await act(async () => {
    await result.current.submit({ itemId: 'a', cardKind: 'word/learn-concrete', spoke: false });
  });

  // Deck advanced despite the rejected post.
  await settleHook(() => expect(result.current.current?.item.id).toBe('b'));
  expect(submit).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

// --- the live unlock loop: locked -> learn the words -> unlock once -> hear ---
// A word factory matching the requeue/decideKind expectation: lemma id === target so the learned
// overlay (keyed by the word item's id) lines up with the phrase's componentLemmaIds.
const newWord = (id: string): ReviewItem => ({
  id,
  type: 'word',
  stage: 'new',
  reps: 0,
  target: id,
  gloss: id,
  audio: { nativeUrl: `${id}.mp3` },
  receptiveReps: 0,
  productiveReps: 0,
  translationVisibility: 'auto',
});

it('runs the live unlock loop: locked -> learn words -> unlock once -> hear', async () => {
  const labdien = newWord('labdien'),
    es = newWord('es'),
    esmu = newWord('esmu');
  const p1: ReviewItem = {
    id: 'p1',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Labdien, es esmu ___.',
    gloss: 'Hello, I am ___.',
    // envelope required: audio-gated renderFor routes stage=new phrases to phrase/hear only when
    // audio.envelope is present (B3); without it the phrase falls to phrase/meaning.
    audio: { nativeUrl: 'p1.mp3', envelope: [0.2, 0.6, 1] },
    componentLemmaIds: ['labdien', 'es', 'esmu'],
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  // Batch = [P1, labdien, es, esmu]; nothing known yet -> P1 starts locked.
  const { result } = renderSessionHook([p1, labdien, es, esmu], new Set());

  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/locked'));
  // Gate advance re-queues P1 after its last component word (esmu).
  await act(async () => {
    result.current.advance();
  });

  // Learn the three words; each submit adds the lemma to the in-session overlay.
  for (const w of ['labdien', 'es', 'esmu']) {
    await settleHook(() => expect(result.current.current?.item.id).toBe(w));
    await act(async () => {
      await result.current.submit({ itemId: w, cardKind: 'word/learn-function', spoke: false });
    });
  }

  // All words now known -> P1 re-surfaces as the one-time reveal.
  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/unlock'));
  // Gate advance re-queues P1 immediately next as its first SRS exposure.
  await act(async () => {
    result.current.advance();
  });
  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/hear'));
});

it('phrase/locked enriches the item with the live "N words to go — learn X" hint', async () => {
  const labdien = newWord('labdien'),
    es = newWord('es'),
    esmu = newWord('esmu');
  const p1: ReviewItem = {
    id: 'p1',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Labdien, es esmu ___.',
    gloss: 'Hello, I am ___.',
    audio: { nativeUrl: 'p1.mp3' },
    componentLemmaIds: ['labdien', 'es', 'esmu'],
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  const { result } = renderSessionHook([p1, labdien, es, esmu], new Set());

  await settleHook(() => {
    expect(result.current.current?.kind).toBe('phrase/locked');
    expect(result.current.current?.item.lockRemaining).toBe(3);
    expect(result.current.current?.item.lockLemma).toBe('labdien');
  });
});
