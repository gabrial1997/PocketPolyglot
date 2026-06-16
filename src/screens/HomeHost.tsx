// HomeHost — Tier-B host for the home screen (WIRING_MAP §3). Mirrors CardHost: pulls data from
// the injected services and renders the PURE HomeScreen via props. The screen never touches a
// service. Home reuses srs.getDueSummary() + progress.getCoverage() (NOT a ReviewItem/CardResult).
// `name` is supplied by the caller (derived from the signed-in user) — never hard-coded. LOCKED: no gamification.
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { HomeScreen } from './HomeScreen';

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

export function HomeHost({
  name,
  onStart,
  onOpenPodcast,
}: {
  name?: string;
  onStart?: () => void;
  onOpenPodcast?: () => void;
}): React.JSX.Element {
  const { srs, progress } = useServices();
  const [summary, setSummary] = useState<{ newCount: number; reviewCount: number }>({
    newCount: 0,
    reviewCount: 0,
  });
  const [coverage, setCoverage] = useState<{ known: number; total: number }>({ known: 0, total: 1000 });

  const now = new Date();
  const greeting = greetingFor(now.getHours());
  const dateLabel = formatDate(now);

  useEffect(() => {
    let active = true;
    void srs
      .getDueSummary()
      .then((s) => {
        if (active) setSummary(s);
      })
      .catch(() => {
        /* keep defaults on failure */
      });
    void progress
      .getCoverage()
      .then((c) => {
        if (active) setCoverage(c);
      })
      .catch(() => {
        /* keep defaults on failure */
      });
    return () => {
      active = false;
    };
  }, [srs, progress]);

  return (
    <HomeScreen
      greeting={greeting}
      name={name}
      dateLabel={dateLabel}
      newCount={summary.newCount}
      reviewCount={summary.reviewCount}
      knownCount={coverage.known}
      totalWords={coverage.total}
      onStart={onStart}
      onOpenPodcast={onOpenPodcast}
    />
  );
}
