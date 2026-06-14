// App root + minimal stack. Wraps everything in ThemeProvider + ServiceProvider and renders a
// simple two-route stack (home -> session). A real navigator (react-navigation/expo-router) can
// replace this; the load-bearing piece is the CARD_REGISTRY keyed by stable CardKind strings.
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { useSession } from '../session/sessionController';
import { useReviewCardHandlers } from '../session/useReviewCardHandlers';
import { CARD_REGISTRY } from './registry';
import { HomeScreen, ProgressScreen } from '../screens';
import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';
import type { CardResult } from '../types/cardResult';

type Route = 'home' | 'session';

/**
 * CardHost — mounts the card for the current item with service-backed callbacks. Split out so
 * useReviewCardHandlers (a hook) is always called when a card renders, never conditionally.
 */
function CardHost({
  item,
  kind,
  submit,
  nextReviewLabel,
}: {
  item: ReviewItem;
  kind: CardKind;
  submit: (result: CardResult) => void | Promise<void>;
  nextReviewLabel: string | null;
}): React.JSX.Element {
  // The controller wires every callback to the injected services; the card stays pure (§1, §5).
  const handlers = useReviewCardHandlers(item, submit);
  const Card = CARD_REGISTRY[kind];
  return <Card item={item} {...handlers} nextReviewLabel={nextReviewLabel} />;
}

/** SessionHost — pulls the controller state and mounts the card for the current item. */
export function SessionHost({ onExit }: { onExit: () => void }): React.JSX.Element {
  const session = useSession();

  if (session.loading) return <ProgressScreen known={0} total={1000} />;
  if (session.done || !session.current) {
    // Empty batch / finished — bounce back to home.
    onExit();
    return <ProgressScreen known={0} total={1000} />;
  }

  return (
    // key on item id: remount a fresh card per item so ephemeral state (stage, first-try miss)
    // and the recording buffer never leak from one review into the next.
    <CardHost
      key={session.current.item.id}
      item={session.current.item}
      kind={session.current.kind}
      submit={session.submit}
      nextReviewLabel={session.lastReviewLabel}
    />
  );
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
