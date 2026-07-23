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
    progress: { getCoverage: async () => ({ total: 1000, knownRanks: [] as number[] }) },
    podcast: { getEpisode: async () => ({ title: 'x', transcript: '', audioUrl: 'x' }) },
    profile: { getRecConsent: async () => false, setRecConsent: async () => {}, deleteRecordings: async () => {}, getProfile: async () => null, ensureProfile: async () => {}, setSeenDiacritics: async () => {}, setSeenConsent: async () => {}, setConsent: async () => {}, deleteAccount: async () => {} },
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

// Earned-phrase gating (2026-07-23): same-session unlock is impossible BY DESIGN — a locked
// phrase's teaser shows exactly once and is never re-queued, even after ALL its component words
// are answered correctly (through their full teach->MC->speak arc) later in the SAME session.
// KnownWordsStore.all() now serves the EARNED set (correct recognition in a DIFFERENT round/day
// than the intro), which a same-session `known: () => known` fake can never reflect — the phrase
// only returns via selectBatch in a later round once its words are earned.
it('a phrase encountered locked never re-surfaces in the same session, even after all its component words are answered correctly', async () => {
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
    audio: { nativeUrl: 'p1.mp3', envelope: [0.2, 0.6, 1] },
    componentLemmaIds: ['labdien', 'es', 'esmu'],
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  // Batch = [P1, labdien, es, esmu]; nothing earned yet -> P1 starts locked.
  const { result } = renderSessionHook([p1, labdien, es, esmu], new Set());

  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/locked'));
  const initialTotal = result.current.total;
  // Gate advance: no re-queue — the teaser is gone for good this session.
  await act(async () => {
    result.current.advance();
  });
  expect(result.current.total).toBe(initialTotal);

  // Learn the three words (full intro -> MC -> speak arc), all answered correctly.
  for (const w of ['labdien', 'es', 'esmu']) {
    await settleHook(() => expect(result.current.current?.item.id).toBe(w));
    await act(async () => {
      await result.current.submit({ itemId: w, cardKind: 'word/learn-function', spoke: false });
    });
  }
  for (const w of ['labdien', 'es', 'esmu']) {
    await settleHook(() => {
      expect(result.current.current?.item.id).toBe(w);
      expect(result.current.current?.item.retest).toBe('mc');
    });
    await act(async () => {
      await result.current.submit({ itemId: w, cardKind: 'word/hear', correct: true, spoke: false });
    });
  }
  for (const w of ['labdien', 'es', 'esmu']) {
    await settleHook(() => {
      expect(result.current.current?.item.id).toBe(w);
      expect(result.current.current?.item.retest).toBe('speak');
    });
    await act(async () => {
      await result.current.submit({ itemId: w, cardKind: 'word/hear', correct: true, spoke: false });
    });
  }

  // The session ends WITHOUT P1 ever re-surfacing — no phrase/unlock, no phrase/hear.
  await settleHook(() => expect(result.current.done).toBe(true));
  expect(result.current.total).toBe(initialTotal); // queue never grew; P1 was not re-inserted
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

// Flipped 2026-07-23 (earned-phrase gating): a same-session correct answer no longer unlocks the
// phrase — the controller stops unioning session-learned words into the gate, so `known.all()`
// (the EARNED set) is the only source of truth, and it does not change until a real refresh.
it('a CORRECT answer on a component word does NOT unlock its phrase in the same session (no session-learned overlay)', async () => {
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
  // Submit wordA CORRECT — under the OLD behavior this added 'a' to the session-learned overlay
  // and unlocked the phrase; under the NEW behavior it has no effect on the gate.
  await act(async () => {
    await result.current.submit({ itemId: 'a', cardKind: 'word/hear', correct: true, spoke: false });
  });
  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/locked'));
});

// --- advance() past phrase/locked never re-queues (Task 5: no teaser re-queue at all — previously
// this only held when no component was ahead; now it holds unconditionally, see the next test) ---
it('phrase/locked with no component ahead: advance() does not re-queue the phrase (no infinite loop)', async () => {
  // Reproduces the "Lūdzu!" freeze: a phrase whose only unknown component is not in the queue.
  // stage: 'new' — the no-re-lock rule means only stage:'new' phrases consult the gate at all.
  const phraseLoner: ReviewItem = {
    id: 'ph-loner',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Lūdzu!',
    gloss: 'Please!',
    componentLemmaIds: ['ludzu'],  // 'ludzu' is unearned (not in known set, no word item in batch)
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  // Empty known set -> 'ludzu' is unearned -> phrase renders phrase/locked.
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

// --- Task 5: the teaser never re-queues, even when a component word IS still ahead in the queue
// (previously advance() would insert the phrase right after its last component — that re-queue
// path is deleted entirely; the phrase is not admitted again until a later round via selectBatch) ---
it('phrase/locked with a component word ahead: advance() still does NOT re-queue the phrase (teaser shows exactly once)', async () => {
  const phrase: ReviewItem = {
    id: 'ph-locked-2',
    type: 'phrase',
    stage: 'new',
    reps: 0,
    target: 'Vienu kafiju, lūdzu.',
    gloss: 'One coffee, please.',
    componentLemmaIds: ['kafija'],
    receptiveReps: 0,
    productiveReps: 0,
    translationVisibility: 'auto',
  };
  const kafija: ReviewItem = {
    id: 'kafija', type: 'word', stage: 'review', reps: 1, target: 'kafija', gloss: 'coffee',
    wordClass: 'concrete', receptiveReps: 1, productiveReps: 0, translationVisibility: 'auto',
  };
  // 'kafija' (the phrase's only component) IS ahead in the queue — the old code would have
  // re-queued the phrase right after it.
  const { result } = renderSessionHook([phrase, kafija], new Set());

  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/locked'));
  const initialTotal = result.current.total; // 2
  await act(async () => {
    result.current.advance();
  });

  // Queue must NOT have grown.
  expect(result.current.total).toBe(initialTotal);
  // The next (and only remaining) item is 'kafija' — never the phrase again.
  await settleHook(() => expect(result.current.current?.item.id).toBe('kafija'));
  await act(async () => {
    await result.current.submit({ itemId: 'kafija', cardKind: 'word/hear', correct: true, spoke: false });
  });
  // Session is done — the phrase was never re-inserted (no second encounter).
  await settleHook(() => expect(result.current.done).toBe(true));
  expect(result.current.total).toBe(initialTotal);
});

// --- refresh-generation regression: the FIRST card must see the set loaded by reload() ---
it('a fully-known phrase at position 0 renders phrase/unlock once known.refresh() lands (no stale knownUnion)', async () => {
  // The real KnownWordsStore is a stable service instance whose all() returns a mutable internal
  // set that is EMPTY until refresh() resolves. Before the refresh-generation fix, the first
  // card's knownUnion was memoized from the pre-refresh (empty) set and nothing recomputed it for
  // position 0 (setPos(0) bails, `known` never changes identity) — so a fully-known phrase at
  // position 0 rendered phrase/locked and was silently dropped by advance().
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
  const backing = new Set<string>(); // empty until refresh() "loads" the persisted rows
  const services = fakeServices([p1], backing);
  services.known = {
    has: (id) => backing.has(id),
    all: () => backing,
    refresh: async () => {
      backing.add('labdien');
      backing.add('es');
      backing.add('esmu');
    },
  };
  const utils = renderHook(() => useSession(), {
    wrapper: ({ children }) => (
      <ThemeProvider>
        <ServiceProvider services={services}>{children}</ServiceProvider>
      </ThemeProvider>
    ),
  });
  const { result } = utils;

  // All components are known once refresh() resolves -> the phrase at position 0 must open with
  // the unlock reveal, NOT phrase/locked computed from the stale pre-refresh set.
  await settleHook(() => expect(result.current.current?.kind).toBe('phrase/unlock'));
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
// The unlock reveal now only happens for an ALREADY-earned component (no same-session unlock —
// see the flipped test above), so this fixture seeds 'a' as known from the start rather than
// learning it in-session.
it('unlock inserts the full arc: advancing walks phrase/hear -> phrase/meaning -> phrase/sayit', async () => {
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
  // 'a' is already earned (a prior round/day) -> the phrase opens directly with the unlock reveal.
  const { result } = renderSessionHook([phraseP], new Set(['a']));

  // Phrase's first (and only) encounter is the one-time unlock reveal — no locked stage at all.
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
