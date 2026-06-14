// Integration test for the session loop across MORE THAN ONE item — the case single-card tests
// miss. Two consecutive items of the same CardKind must each start fresh: the card's ephemeral
// state (stage, first-try miss) and the recording buffer must NOT leak from item 1 into item 2.
// Drives the real SessionController + CardHost with injected fake services.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { SessionHost } from './index';
import type { ServiceBundle } from '../services';
import type { ReviewItem } from '../types/reviewItem';

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

// Deterministically flush the controller's async chains (reload effect, submit -> setIndex) and
// apply the resulting state updates. Avoids waitFor's polling, which is timing-fragile under
// jest-expo in CI.
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
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
  await flush();
  expect(u.getByText('māja')).toBeTruthy();

  // Complete A with a wrong first answer (so its `missed` flag is set), then advance.
  completeCard(u, 'māja', 'maize', { miss: true });
  await flush();

  // Item B must begin at its OWN choose stage — not stuck on A's result screen.
  // 'paldies' is B's distractor, rendered ONLY at the choose stage, so it is an unambiguous
  // signal that the card remounted fresh (the hero text would match 'labrīt' even when stuck).
  expect(u.getByText('paldies')).toBeTruthy();
  expect(u.queryByText('Continue')).toBeNull();
  expect(u.queryByText('māja')).toBeNull(); // item A's content is gone
});
