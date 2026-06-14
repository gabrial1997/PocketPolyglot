// PodcastHost — Tier-B host for the `pod` screen (WIRING_MAP §3). Mirrors CardHost: pulls the
// episode from the injected PodcastService and plays via the injected AudioService, keeping
// PodcastScreen pure (data via props). NOT a card — no ReviewItem/CardResult.
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { PodcastScreen } from './PodcastScreen';

type Episode = { title: string; transcript: string; audioUrl: string };

export function PodcastHost(): React.JSX.Element {
  const { podcast, audio } = useServices();
  const [ep, setEp] = useState<Episode | null>(null);

  useEffect(() => {
    let alive = true;
    podcast.getEpisode().then((e) => {
      if (alive) setEp(e);
    });
    return () => {
      alive = false;
    };
  }, [podcast]);

  // Render the screen with its defaults until the episode loads.
  return (
    <PodcastScreen
      title={ep?.title}
      transcript={ep?.transcript}
      onPlay={ep ? () => audio.play(ep.audioUrl) : undefined}
    />
  );
}
