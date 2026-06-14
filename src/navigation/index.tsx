// App root + minimal stack. Wraps everything in ThemeProvider + ServiceProvider and renders a
// simple two-route stack (home -> session). A real navigator (react-navigation/expo-router) can
// replace this; the load-bearing piece is the CARD_REGISTRY keyed by stable CardKind strings.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { useSession } from '../session/sessionController';
import { useReviewCardHandlers } from '../session/useReviewCardHandlers';
import { CARD_REGISTRY } from './registry';
import { ProgressScreen, HomeHost, PodcastHost, ProgressHost } from '../screens';
import { type } from '../theme/tokens';
import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';
import type { CardResult } from '../types/cardResult';

type Route = 'home' | 'pod' | 'prog' | 'session';

/** The Tier-B tabs (session is a focused flow, not a tab). */
const TABS: { route: Route; label: string }[] = [
  { route: 'home', label: 'Home' },
  { route: 'pod', label: 'Podcast' },
  { route: 'prog', label: 'Progress' },
];

/** Minimal placeholder tab bar — a real navigator (expo-router/react-navigation) replaces this. */
function TabBar({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }): React.JSX.Element {
  const T = useTheme();
  return (
    <View style={[styles.tabBar, { borderTopColor: T.hair, backgroundColor: T.bg }]}>
      {TABS.map((tab) => {
        const active = tab.route === route;
        return (
          <Pressable
            key={tab.route}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onNavigate(tab.route)}
            style={styles.tab}
          >
            <Text style={{ color: active ? T.primary : T.faint, fontSize: type.label, fontWeight: active ? '700' : '500' }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * CardHost — mounts the card for the current item with service-backed callbacks. Split out so
 * useReviewCardHandlers (a hook) is always called when a card renders, never conditionally.
 */
export function CardHost({
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

/** Routes the three Tier-B hosts + the focused session flow. */
function Root(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('home');

  if (route === 'session') {
    // Session is a focused flow with no tab bar; exit returns to home.
    return <SessionHost onExit={() => setRoute('home')} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {route === 'home' ? <HomeHost onStart={() => setRoute('session')} /> : null}
        {route === 'pod' ? <PodcastHost /> : null}
        {route === 'prog' ? <ProgressHost /> : null}
      </View>
      <TabBar route={route} onNavigate={setRoute} />
    </View>
  );
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <ServiceProvider>
        <StatusBar style="auto" />
        <Root />
      </ServiceProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 24,
    paddingTop: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
});
