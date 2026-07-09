// ProgressHost — Tier-B host for the prog screen (WIRING_MAP §3). Mirrors CardHost/HomeHost:
// pulls data from the injected services and renders the PURE ProgressScreen via props. The
// screen never touches a service. Uses progress.getCoverage() → { known, total } (NOT a
// ReviewItem/CardResult). LOCKED: no streaks/gamification — coverage is progress, not a game.
//
// Loading/error are explicit (hostStates): a fetch failure shows a retryable error, never a
// silent "0 known" default that would misread as the user knowing nothing.
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { ProgressScreen } from './ProgressScreen';
import { HostLoading, HostError } from './hostStates';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; known: number; total: number };

export function ProgressHost(): React.JSX.Element {
  const { progress } = useServices();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    progress
      .getCoverage()
      .then((c) => {
        if (active) setState({ status: 'ready', known: c.known, total: c.total });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [progress, attempt]);

  if (state.status === 'loading') return <HostLoading />;
  if (state.status === 'error') return <HostError onRetry={() => setAttempt((a) => a + 1)} />;
  return <ProgressScreen known={state.known} total={state.total} />;
}
