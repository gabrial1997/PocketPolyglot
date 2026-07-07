// PodcastHost — Tier-B host for the `pod` screen (WIRING_MAP §3). Mirrors CardHost: pulls the
// episode from the injected PodcastService and plays via the injected AudioService, keeping
// PodcastScreen pure (data via props). NOT a card — no ReviewItem/CardResult.
//
// Loading/error are explicit (hostStates): a failed fetch shows a retryable error and a missing
// episode row renders the screen's honest "no episode" state — never the mockup sample episode.
// Playback is a real contract: onPlay → audio.play(url), onStop → audio.stop() (the screen calls
// it on the pause tap and on unmount, so leaving the tab stops the clip).
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { PodcastScreen, type TranscriptLine } from './PodcastScreen';
import { HostLoading, HostError } from './hostStates';

type Episode = { title: string; transcript: string; audioUrl: string };

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; ep: Episode | null };

// The service still delivers the transcript as a single string; the screen now renders a structured
// TranscriptLine[]. Adapt here (host glue) — one line per non-empty paragraph, English left blank.
function toLines(transcript: string): TranscriptLine[] | undefined {
  const lines = transcript
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((lv) => ({ lv, en: '' }));
  return lines.length ? lines : undefined;
}

export function PodcastHost(): React.JSX.Element {
  const { podcast, audio } = useServices();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    podcast
      .getEpisode()
      .then((e) => {
        // An episode needs both a title and audio to be playable; anything less is "no episode".
        if (alive) setState({ status: 'ready', ep: e.title && e.audioUrl ? e : null });
      })
      .catch(() => {
        if (alive) setState({ status: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [podcast, attempt]);

  if (state.status === 'loading') return <HostLoading />;
  if (state.status === 'error') return <HostError onRetry={() => setAttempt((a) => a + 1)} />;

  const ep = state.ep;
  // ep === null → PodcastScreen (no title) renders its honest empty state.
  return (
    <PodcastScreen
      title={ep?.title}
      transcript={ep ? toLines(ep.transcript) : undefined}
      onPlay={ep ? () => void audio.play(ep.audioUrl) : undefined}
      onStop={ep ? () => void audio.stop() : undefined}
    />
  );
}
