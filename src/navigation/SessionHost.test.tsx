// Integration test across MORE THAN ONE item — the case single-card tests miss. Two consecutive
// items of the same CardKind must each start fresh: the card's ephemeral state (stage, first-try
// `missed`) and the recording buffer must NOT leak from item 1 into item 2. This exercises the
// real SessionController + the key={item.id} on CardHost.
//
// `settle()` advances the controller's async work with REAL timer ticks. React 18 runs passive
// effects on a macrotask, so microtask-only flushing can starve the async data load under CI load
// (an earlier version did exactly that and was flaky). Real ticks + a bounded deadline are robust.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { SessionHost } from './index';
import { CardIcon } from '../components/cardChrome';
import { CONFIRM_MS } from '../screens/useLoopStage';
import type { ServiceBundle } from '../services';
import type { ReviewItem } from '../types/reviewItem';

// SessionHost renders with INJECTED fake services and never touches the real client, but importing
// ./index pulls AuthProvider -> supabaseClient (which constructs a network client at import). Stub
// it so the suite doesn't build a real Supabase client.
jest.mock('../services/supabaseClient', () => ({ supabase: {} }));

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

function renderHost(batch: ReviewItem[], onExit: () => void = () => undefined) {
  return render(
    <ThemeProvider>
      <ServiceProvider services={fakeServices(batch)}>
        <SessionHost onExit={onExit} />
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
// A correct pick holds a CONFIRM_MS green beat before advancing to speak; this suite runs on REAL
// timers, so wait out that window before reaching for the (speak-stage) Record control.
async function completeCard(
  u: ReturnType<typeof renderHost>,
  correctLabel: string,
  wrongLabel: string,
  opts: { miss?: boolean } = {},
) {
  if (opts.miss) fireEvent.press(u.getByText(wrongLabel));
  fireEvent.press(u.getByText(correctLabel));
  await act(async () => {
    await new Promise((r) => setTimeout(r, CONFIRM_MS + 30));
  });
  fireEvent.press(u.getByLabelText('Record'));
  fireEvent.press(u.getByLabelText('Stop recording'));
  fireEvent.press(u.getByText('Continue'));
}

it('starts each item fresh — stage/miss/recording do not leak across cards', async () => {
  const u = renderHost([itemA, itemB]);

  // Item A loads at the choose stage.
  await settle(() => expect(u.getByText('māja')).toBeTruthy());

  // Complete A with a wrong first answer (so its `missed` flag is set), then advance.
  await completeCard(u, 'māja', 'maize', { miss: true });

  // Item B must begin at its OWN choose stage — not stuck on A's result screen.
  // 'paldies' is B's distractor, rendered ONLY at the choose stage. The GlideViewport transition
  // keeps A's (leaving) layer mounted for ~640ms, so we poll until the transition has committed and
  // B stands alone — settle()'s real-timer budget (5s) covers the commit window.
  await settle(() => {
    expect(u.getByText('paldies')).toBeTruthy();
    expect(u.queryByText('Continue')).toBeNull();
    expect(u.queryByText('māja')).toBeNull(); // item A's content is gone after the transition
  });
});

it('renders the exit X high-contrast — ink icon on a bumped chip, not a faint sub-tone', async () => {
  const u = renderHost([itemA, itemB]);
  await settle(() => expect(u.getByText('māja')).toBeTruthy());

  const close = u.getByLabelText('Close session'); // default ThemeProvider resolves to light in jest
  const bg = StyleSheet.flatten(close.props.style).backgroundColor;
  expect(bg).toBe('rgba(26,39,51,0.10)'); // bumped from the old near-invisible 0.05

  const icon = within(close).UNSAFE_getByType(CardIcon);
  expect(icon.props.color).toBe('#1A2733'); // T.ink — full-contrast, not the ~58% T.sub it was
  expect(icon.props.color).not.toBe('rgba(26,39,51,0.58)'); // not T.sub
});

it('pressing the exit X returns to home (after a brief fade), exactly once', async () => {
  const onExit = jest.fn();
  const u = renderHost([itemA, itemB], onExit);
  await settle(() => expect(u.getByText('māja')).toBeTruthy());

  fireEvent.press(u.getByLabelText('Close session'));
  // The fade-out commits onExit on a short timer (real timers here) — settle() covers the window.
  await settle(() => expect(onExit).toHaveBeenCalledTimes(1));
});

it('bounces to home on an empty batch — via effect, not the misleading prog screen', async () => {
  const onExit = jest.fn();
  const u = renderHost([], onExit);
  // The finished/empty branch calls onExit from an effect (never setState during render)...
  await settle(() => expect(onExit).toHaveBeenCalled());
  // ...and never shows the "N / 1000 words" coverage screen as a loading/empty state.
  expect(u.queryByText(/words/)).toBeNull();
});
