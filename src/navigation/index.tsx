// App root + minimal stack. Wraps everything in ThemeProvider + ServiceProvider and renders a
// simple two-route stack (home -> session). A real navigator (react-navigation/expo-router) can
// replace this; the load-bearing piece is the CARD_REGISTRY keyed by stable CardKind strings.
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { useSession } from '../session/sessionController';
import { CARD_REGISTRY } from './registry';
import { HomeScreen, ProgressScreen } from '../screens';
import type { CardResult } from '../types/cardResult';

type Route = 'home' | 'session';

/** SessionHost — pulls the controller state and mounts the card for the current item. */
function SessionHost({ onExit }: { onExit: () => void }): React.JSX.Element {
  const session = useSession();

  if (session.loading) return <ProgressScreen known={0} total={1000} />;
  if (session.done || !session.current) {
    // Empty batch / finished — bounce back to home.
    onExit();
    return <ProgressScreen known={0} total={1000} />;
  }

  const { item, kind } = session.current;
  const Card = CARD_REGISTRY[kind];

  // The controller supplies every callback; cards stay pure (BACKEND_INTEGRATION §1).
  const callbacks = {
    item,
    onPlay: () => undefined,
    onAnswer: () => undefined,
    onRecordStart: () => undefined,
    onRecordStop: () => undefined,
    onPlayCompare: () => undefined,
    onUnlocked: () => undefined,
    onComplete: (result: CardResult) => void session.submit(result),
    nextReviewLabel: session.lastReviewLabel,
  };

  return <Card {...callbacks} />;
}

export function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('home');
  return (
    <ThemeProvider>
      <ServiceProvider>
        <StatusBar style="auto" />
        {route === 'home' ? (
          <HomeScreen onStart={() => setRoute('session')} />
        ) : (
          <SessionHost onExit={() => setRoute('home')} />
        )}
      </ServiceProvider>
    </ThemeProvider>
  );
}
