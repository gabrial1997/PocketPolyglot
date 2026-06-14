// HomeHost — Tier-B host for the home screen (WIRING_MAP §3). Mirrors CardHost: pulls data from
// the injected services and renders the PURE HomeScreen via props. The screen never touches a
// service. Home reuses srs.getDueSummary() (NOT a ReviewItem/CardResult). LOCKED: no gamification.
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { HomeScreen } from './HomeScreen';

export function HomeHost({ onStart }: { onStart?: () => void }): React.JSX.Element {
  const { srs } = useServices();
  const [summary, setSummary] = useState<{ newCount: number; reviewCount: number }>({
    newCount: 0,
    reviewCount: 0,
  });

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
    return () => {
      active = false;
    };
  }, [srs]);

  return (
    <HomeScreen newCount={summary.newCount} reviewCount={summary.reviewCount} onStart={onStart} />
  );
}
