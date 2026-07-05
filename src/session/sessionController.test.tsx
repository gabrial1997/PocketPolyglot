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
    editor: { isEditor: async () => false, edit: async () => {} },
    bugReport: { submit: async () => {} },
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

it('ignores a double-fired onComplete on the same card (no skip, no double-post)', async () => {
  // A double-tapped Continue fires submit() twice on the SAME card closure before any re-render.
  // Without an idempotency guard this advanced pos by 2 (an item is never shown) AND posted the
  // same result twice (double FSRS advance + duplicate review_log).
  const wordC: ReviewItem = { ...wordA, id: 'c', target: 'c', gloss: 'c' };
  const { result, submit } = renderSessionHook([wordA, wordB, wordC], new Set());
  await settleHook(() => expect(result.current.current?.item.id).toBe('a'));

  await act(async () => {
    const r = { itemId: 'a', cardKind: 'word/hear' as const, correct: true, spoke: false };
    void result.current.submit(r);
    void result.current.submit(r);
  });

  // Advanced by exactly one (to 'b', not 'c') and posted exactly once.
  await settleHook(() => expect(result.current.current?.item.id).toBe('b'));
  expect(submit).toHaveBeenCalledTimes(1);
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
    // envelope required: phrase/sayit (production rung) requires audio; stage=new always routes to
    // phrase/hear regardless of audio, so the envelope here only matters if production is reached.
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

  // expandLearningSteps produces a 3-step arc: intros, MC retests, then speak retests.
  // These retest copies (MC + speak) have the same item.id as the originals — submit through them
  // so P1 can surface. The retest items share ids with the originals; requeuePhraseAfterComponents
  // places P1 after the last retest copy (since it also matches by id), so P1 appears after all retests.
  // NOTE: must submit with correct:true — the correctness gate means only a correctly-answered
  // recall card adds the word to the in-session learned overlay (word/hear emits correct:!missed).
  // First, submit the 3 MC steps
  for (const w of ['labdien', 'es', 'esmu']) {
    await settleHook(() => {
      expect(result.current.current?.item.id).toBe(w);
      expect(result.current.current?.item.retest).toBe('mc');
    });
    await act(async () => {
      await result.current.submit({ itemId: w, cardKind: 'word/hear', correct: true, spoke: false });
    });
  }
  // Then submit the 3 speak steps. renderFor DOES route retest:'speak' specially (word/say when the
  // item has choices), but newWord() fixtures here have no `choices`, so hasChoices() is false and
  // renderFor falls back to word/hear — same card kind as the MC step above.
  for (const w of ['labdien', 'es', 'esmu']) {
    await settleHook(() => {
      expect(result.current.current?.item.id).toBe(w);
      expect(result.current.current?.item.retest).toBe('speak');
    });
    await act(async () => {
      await result.current.submit({ itemId: w, cardKind: 'word/hear', correct: true, spoke: false });
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

it('interleaves new-word intros with in-session retest quizzes', async () => {
  const newWords = ['a', 'b', 'c', 'd'].map(
    (id): ReviewItem => ({
      id,
      type: 'word',
      stage: 'new',
      reps: 0,
      target: id,
      gloss: id,
      wordClass: 'concrete',
      receptiveReps: 0,
      productiveReps: 0,
      translationVisibility: 'auto',
    }),
  );
  const { result } = renderSessionHook(newWords, new Set());
  // 4 new words -> expandLearningSteps -> group of 3 (3 intros + 3 MC + 3 speak) + 1 (1 intro + 1 MC + 1 speak) = 12.
  await settleHook(() => expect(result.current.total).toBe(12));
});

// --- correctness gate on the in-session known overlay ---
// A WRONG answer on a component word must NOT add it to `learned` (phrase stays locked).
// A CORRECT answer must add it (phrase may unlock).
// Use stage:'review' words so expandLearningSteps leaves them unexpanded.
it('a WRONG answer on a component word does NOT unlock its phrase (correctness-gated)', async () => {
  const wordA: ReviewItem = {
    id: 'a', type: 'word', stage: 'review', reps: 1, target: 'a', gloss: 'a',
    wordClass: 'concrete', receptiveReps: 1, productiveReps: 0, translationVisibility: 'auto',
  };
  const phraseP: ReviewItem = {
    id: 'p', type: 'phrase', stage: 'new', reps: 0, target: 'p', gloss: 'p',
    componentLemmaIds: ['a'], receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
  };
  const { result } = renderSessionHook([wordA, phraseP], new Set());
  await settleHook(() => expect(result.current.loading).toBe(false));
  // wordA loads first — submit it WRONG.
  await settleHook(() => expect(result.current.current?.item.id).toBe('a'));
  await act(async () => {
    await result.current.submit({ itemId: 'a', cardKind: 'word/hear', correct: false, spoke: false });
  });
  // 'a' was answered wrong → still not in learned overlay → phrase stays locked.
  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/locked'));
});

it('a CORRECT answer on a component word lets its phrase unlock', async () => {
  const wordA: ReviewItem = {
    id: 'a', type: 'word', stage: 'review', reps: 1, target: 'a', gloss: 'a',
    wordClass: 'concrete', receptiveReps: 1, productiveReps: 0, translationVisibility: 'auto',
  };
  const phraseP: ReviewItem = {
    id: 'p', type: 'phrase', stage: 'new', reps: 0, target: 'p', gloss: 'p',
    componentLemmaIds: ['a'], receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
  };
  const { result } = renderSessionHook([wordA, phraseP], new Set());
  await settleHook(() => expect(result.current.loading).toBe(false));
  await settleHook(() => expect(result.current.current?.item.id).toBe('a'));
  // Submit wordA CORRECT → 'a' enters learned overlay → phrase is no longer locked.
  await act(async () => {
    await result.current.submit({ itemId: 'a', cardKind: 'word/hear', correct: true, spoke: false });
  });
  await settleHook(() => expect(result.current.current?.kind).not.toBe('phrase/locked'));
});

// --- Fix B regression: phrase/locked with no component ahead must NOT re-queue (infinite loop) ---
it('phrase/locked with no component ahead: advance() does not re-queue the phrase (no infinite loop)', async () => {
  // Reproduces the "Lūdzu!" freeze: a phrase whose only unknown component is not in the queue.
  // Without Fix B, advance() would call requeuePhraseAfterComponents which appends to the end
  // (since lastCompIdx === -1) -> queue grows as fast as pos -> session never finishes.
  // With Fix B, advance() detects no component ahead and just steps pos -> session finishes.
  const phraseLoner: ReviewItem = {
    id: 'ph-loner',
    type: 'phrase',
    stage: 'review',  // stage:review avoids expandLearningSteps expansion noise
    reps: 3,
    target: 'Lūdzu!',
    gloss: 'Please!',
    componentLemmaIds: ['ludzu'],  // 'ludzu' is unknown (not in known set, no word item in batch)
    receptiveReps: 3,
    productiveReps: 1,
    translationVisibility: 'auto',
  };
  // Empty known set -> 'ludzu' is unknown -> phrase renders phrase/locked.
  // No word with id 'ludzu' in the batch -> no component ahead in queue.
  const { result } = renderSessionHook([phraseLoner], new Set());

  await settleHook(() => {
    expect(result.current.loading).toBe(false);
    expect(result.current.current?.kind).toBe('phrase/locked');
  });

  const initialTotal = result.current.total; // 1 (just the phrase)

  // advance() — this is what triggered the infinite loop without the fix
  await act(async () => {
    result.current.advance();
  });

  // Queue must NOT have grown: the phrase was NOT re-queued (no component ahead)
  expect(result.current.total).toBeLessThanOrEqual(initialTotal);
  // Session must now be done (pos advanced past the only item)
  expect(result.current.done).toBe(true);
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

// --- Task 5: unlock inserts the FULL hear->mc->speak arc (requeueArcNext), not a single re-queue ---
it('unlock inserts the full arc: advancing walks phrase/hear -> phrase/meaning -> phrase/sayit', async () => {
  const wordA: ReviewItem = {
    id: 'a', type: 'word', stage: 'review', reps: 1, target: 'a', gloss: 'a',
    wordClass: 'concrete', receptiveReps: 1, productiveReps: 0, translationVisibility: 'auto',
  };
  const phraseP: ReviewItem = {
    id: 'p',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'p',
    gloss: 'p',
    audio: { nativeUrl: 'p.mp3' },
    // choices so the mc retest copy routes to phrase/meaning (not the no-choices phrase/hear fallback).
    choices: [
      { value: 'p', gloss: 'p', correct: true },
      { value: 'x', gloss: 'x', correct: false },
    ],
    componentLemmaIds: ['a'],
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  const { result } = renderSessionHook([phraseP, wordA], new Set());

  // Phrase starts locked ('a' unknown).
  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/locked'));
  await act(async () => {
    result.current.advance();
  });

  // Answer the component word CORRECTLY -> enters the in-session known overlay.
  await settleHook(() => expect(result.current.current?.item.id).toBe('a'));
  await act(async () => {
    await result.current.submit({ itemId: 'a', cardKind: 'word/hear', correct: true, spoke: false });
  });

  // Phrase re-surfaces as the one-time unlock reveal.
  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/unlock'));
  await act(async () => {
    result.current.advance();
  });

  // requeueArcNext must have inserted [hear, mc, speak] — walk all three and record the kinds.
  const kinds: string[] = [];

  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/hear'));
  kinds.push(result.current.current!.kind);
  await act(async () => {
    await result.current.submit({ itemId: 'p', cardKind: 'phrase/hear', correct: true, spoke: false });
  });

  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/meaning'));
  kinds.push(result.current.current!.kind);
  await act(async () => {
    await result.current.submit({ itemId: 'p', cardKind: 'phrase/meaning', correct: true, spoke: false });
  });

  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/sayit'));
  kinds.push(result.current.current!.kind);

  expect(kinds).toEqual(['phrase/hear', 'phrase/meaning', 'phrase/sayit']);
});
