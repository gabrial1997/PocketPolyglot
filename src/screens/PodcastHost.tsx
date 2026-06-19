// PodcastHost — Tier-B host for the `pod` screen (WIRING_MAP §3). Mirrors CardHost: pulls the
// episode from the injected PodcastService and plays via the injected AudioService, keeping
// PodcastScreen pure (data via props). NOT a card — no ReviewItem/CardResult.
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { PodcastScreen, type TranscriptLine } from './PodcastScreen';

type Episode = { title: string; transcript: string; audioUrl: string };

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
  const [ep, setEp] = useState<Episode | null>(null);

  useEffect(() => {
    let alive = true;
    void podcast
      .getEpisode()
      .then((e) => {
        if (alive) setEp(e);
      })
      .catch(() => {
        /* keep the screen's defaults on failure */
      });
    return () => {
      alive = false;
    };
  }, [podcast]);

  // Render the screen with its defaults until the episode loads.
  return (
    <PodcastScreen
      title={ep?.title}
      transcript={ep ? toLines(ep.transcript) : undefined}
      onPlay={ep ? () => audio.play(ep.audioUrl) : undefined}
    />
  );
}
