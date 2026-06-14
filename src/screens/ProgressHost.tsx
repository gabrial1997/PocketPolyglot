// ProgressHost — Tier-B host for the prog screen (WIRING_MAP §3). Mirrors CardHost/HomeHost:
// pulls data from the injected services and renders the PURE ProgressScreen via props. The
// screen never touches a service. Uses progress.getCoverage() → { known, total } (NOT a
// ReviewItem/CardResult). LOCKED: no streaks/gamification — coverage is progress, not a game.
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { ProgressScreen } from './ProgressScreen';

export function ProgressHost(): React.JSX.Element {
  const { progress } = useServices();
  const [coverage, setCoverage] = useState<{ known: number; total: number }>({
    known: 0,
    total: 1000,
  });

  useEffect(() => {
    let active = true;
    void progress.getCoverage().then((c) => {
      if (active) setCoverage(c);
    });
    return () => {
      active = false;
    };
  }, [progress]);

  return <ProgressScreen known={coverage.known} total={coverage.total} />;
}
