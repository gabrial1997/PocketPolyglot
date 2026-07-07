// HomeHost — Tier-B host for the home screen (WIRING_MAP §3). Mirrors CardHost: pulls data from
// the injected services and renders the PURE HomeScreen via props. The screen never touches a
// service. Home reuses srs.getDueSummary() + progress.getCoverage() (NOT a ReviewItem/CardResult).
// `name` is supplied by the caller (derived from the signed-in user) — never hard-coded. LOCKED: no gamification.
//
// Loading/error are explicit (hostStates): a failed core fetch shows a retryable error instead of
// silently rendering "0 words" defaults. The podcast teaser reuses PodcastService — it shows the
// REAL episode title when one exists and is simply hidden otherwise (honest omission; the Listen
// tab still reaches the pod screen).
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { HomeScreen } from './HomeScreen';
import { HostLoading, HostError } from './hostStates';

/** Time-of-day Latvian greeting. Morning → Labrīt, daytime → Labdien, evening → Labvakar. */
function greetingFor(hour: number): string {
  if (hour < 11) return 'Labrīt';
  if (hour < 18) return 'Labdien';
  return 'Labvakar';
}

/** e.g. "Wednesday, 10 June" — matches the mockup's date line. */
function formatDate(d: Date): string {
  try {
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
    const dayMonth = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    return `${weekday}, ${dayMonth}`;
  } catch {
    return '';
  }
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; newCount: number; reviewCount: number; known: number; total: number };

export function HomeHost({
  name,
  onStart,
  onOpenPodcast,
}: {
  name?: string;
  onStart?: () => void;
  onOpenPodcast?: () => void;
}): React.JSX.Element {
  const { srs, progress, podcast } = useServices();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [podcastTitle, setPodcastTitle] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  const now = new Date();
  const greeting = greetingFor(now.getHours());
  const dateLabel = formatDate(now);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    Promise.all([srs.getDueSummary(), progress.getCoverage()])
      .then(([s, c]) => {
        if (active)
          setState({
            status: 'ready',
            newCount: s.newCount,
            reviewCount: s.reviewCount,
            known: c.known,
            total: c.total,
          });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    // Teaser data is supplementary: no episode (or a failed fetch) just hides the teaser —
    // an honest omission, never a fabricated title.
    podcast
      .getEpisode()
      .then((e) => {
        if (active) setPodcastTitle(e.title && e.audioUrl ? e.title : undefined);
      })
      .catch(() => {
        if (active) setPodcastTitle(undefined);
      });
    return () => {
      active = false;
    };
  }, [srs, progress, podcast, attempt]);

  if (state.status === 'loading') return <HostLoading />;
  if (state.status === 'error') return <HostError onRetry={() => setAttempt((a) => a + 1)} />;

  return (
    <HomeScreen
      greeting={greeting}
      name={name}
      dateLabel={dateLabel}
      newCount={state.newCount}
      reviewCount={state.reviewCount}
      knownCount={state.known}
      totalWords={state.total}
      podcastTitle={podcastTitle}
      podcastSubtitle={podcastTitle ? 'AI episode' : undefined}
      onStart={onStart}
      onOpenPodcast={onOpenPodcast}
    />
  );
}
