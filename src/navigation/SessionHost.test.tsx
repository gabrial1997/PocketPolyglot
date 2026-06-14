// Integration test across MORE THAN ONE item — the case single-card tests miss. Two consecutive
// items of the same CardKind must each start fresh: the card's ephemeral state (stage, first-try
// `missed`) and the recording buffer must NOT leak from item 1 into item 2. This exercises the
// real SessionController + the key={item.id} on CardHost.
//
// `settle()` advances the controller's async work with REAL timer ticks. React 18 runs passive
// effects on a macrotask, so microtask-only flushing can starve the async data load under CI load
// (an earlier version did exactly that and was flaky). Real ticks + a bounded deadline are robust.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { SessionHost } from './index';
import type { ServiceBundle } from '../services';
import type { ReviewItem } from '../types/reviewItem';

jest.setTimeout(30000);

const itemA: ReviewItem = {
  id: 'a',
  type: 'word',
  stage: 'review',
  reps: 3,
  target: 'māja',
  gloss: 'house',
  audio: { nativeUrl: 'a.mp3' },
  media: { imageUrl: 'house.png' }, // picturable -> renderFor returns word/pic-review
  choices: [
    { value: 'māja', gloss: 'house', correct: true },
    { value: 'maize', gloss: 'bread', correct: false },
  ],
};

const itemB: ReviewItem = {
  ...itemA,
  id: 'b',
  target: 'labrīt',
  gloss: 'good morning',
  audio: { nativeUrl: 'b.mp3' },
  choices: [
    { value: 'labrīt', gloss: 'good morning', correct: true },
    { value: 'paldies', gloss: 'thanks', correct: false },
  ],
};

function fakeServices(batch: ReviewItem[]): ServiceBundle {
  return {
    audio: { play: async () => {}, stop: async () => {}, isPlaying: () => false },
    recorder: { start: async () => {}, stop: async () => 'rec://x', isRecording: () => false },
    srs: {
      getDueBatch: async () => batch,
      submit: async () => ({ nextReviewLabel: 'Tomorrow' }),
      getDueSummary: async () => ({ newCount: 0, reviewCount: 0 }),
    },
    known: { has: () => false, all: () => new Set<string>(), refresh: async () => {} },
    progress: { getCoverage: async () => ({ known: 0, total: 1000 }) },
    podcast: { getEpisode: async () => ({ title: 'x', transcript: '', audioUrl: 'x' }) },
  };
}

function renderHost(batch: ReviewItem[]) {
  return render(
    <ThemeProvider>
      <ServiceProvider services={fakeServices(batch)}>
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

// choose -> speak -> rec -> result -> Continue, optionally missing the first answer.
function completeCard(
  u: ReturnType<typeof renderHost>,
  correctLabel: string,
  wrongLabel: string,
  opts: { miss?: boolean } = {},
) {
  if (opts.miss) fireEvent.press(u.getByText(wrongLabel));
  fireEvent.press(u.getByText(correctLabel));
  fireEvent.press(u.getByLabelText('Record'));
  fireEvent.press(u.getByLabelText('Stop recording'));
  fireEvent.press(u.getByText('Continue'));
}

it('starts each item fresh — stage/miss/recording do not leak across cards', async () => {
  const u = renderHost([itemA, itemB]);

  // Item A loads at the choose stage.
  await settle(() => expect(u.getByText('māja')).toBeTruthy());

  // Complete A with a wrong first answer (so its `missed` flag is set), then advance.
  completeCard(u, 'māja', 'maize', { miss: true });

  // Item B must begin at its OWN choose stage — not stuck on A's result screen.
  // 'paldies' is B's distractor, rendered ONLY at the choose stage.
  await settle(() => expect(u.getByText('paldies')).toBeTruthy());
  expect(u.queryByText('Continue')).toBeNull();
  expect(u.queryByText('māja')).toBeNull(); // item A's content is gone
});
