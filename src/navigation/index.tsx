// App root + minimal stack. Wraps everything in ThemeProvider + ServiceProvider and renders a
// simple two-route stack (home -> session). A real navigator (react-navigation/expo-router) can
// replace this; the load-bearing piece is the CARD_REGISTRY keyed by stable CardKind strings.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { SignInScreen } from '../auth/SignInScreen';
import { createSupabaseServices } from '../services/supabase';
import { supabase } from '../services/supabaseClient';
import { useSession } from '../session/sessionController';
import { useReviewCardHandlers } from '../session/useReviewCardHandlers';
import { CARD_REGISTRY } from './registry';
import { Screen } from '../components';
import { HomeHost, PodcastHost, ProgressHost } from '../screens';
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
            accessibilityRole="tab"
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

/** Neutral full-screen placeholder for loading / between cards (NOT the prog coverage screen). */
function SessionPlaceholder({ label }: { label?: string }): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <View style={styles.placeholder}>
        {label ? <Text style={{ color: T.faint, fontSize: type.body }}>{label}</Text> : null}
      </View>
    </Screen>
  );
}

/** SessionHost — pulls the controller state and mounts the card for the current item. */
export function SessionHost({ onExit }: { onExit: () => void }): React.JSX.Element {
  const session = useSession();
  const finished = !session.loading && (session.done || !session.current);

  // Empty batch / finished — bounce back to home in an effect, never via setState during render.
  useEffect(() => {
    if (finished) onExit();
  }, [finished, onExit]);

  // Loading or finished: show a neutral placeholder (a "0 / 1000 words" progress bar here would
  // misread as the user knowing nothing — that's the Tier-B prog screen, not a loading state).
  if (session.loading) return <SessionPlaceholder label="Loading your session…" />;
  if (!session.current) return <SessionPlaceholder />; // also narrows current for the card below

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

/**
 * AuthGate — the session boundary. Signed out -> SignInScreen; signed in -> the app backed by the
 * REAL Supabase services (createSupabaseServices) scoped to the user. Until an auth session exists
 * the app never touches user data (RLS would deny it anyway).
 */
function AuthGate(): React.JSX.Element {
  const { session, user, loading } = useAuth();
  // Build the real, user-scoped service bundle once per signed-in user.
  const services = useMemo(
    () => (user ? createSupabaseServices(supabase, user.id) : null),
    [user?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (loading) return <SessionPlaceholder label="Loading…" />;
  if (!session || !user || !services) return <SignInScreen />;

  return (
    <ServiceProvider services={services}>
      <Root />
    </ServiceProvider>
  );
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 24,
    paddingTop: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
});
