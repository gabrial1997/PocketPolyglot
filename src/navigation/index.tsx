// App root + minimal stack. Wraps everything in ThemeProvider + ServiceProvider and renders a
// simple two-route stack (home -> session). A real navigator (react-navigation/expo-router) can
// replace this; the load-bearing piece is the CARD_REGISTRY keyed by stable CardKind strings.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, SafeAreaView, Animated, AccessibilityInfo } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import type { User } from '@supabase/supabase-js';
import { CardPreviewGallery } from '../dev/CardPreviewGallery';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { ServiceProvider, useServices } from '../services/ServiceProvider';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { SignInScreen } from '../auth/SignInScreen';
import { createSupabaseServices } from '../services/supabase';
import { supabase } from '../services/supabaseClient';
import { useSession } from '../session/sessionController';
import { useReviewCardHandlers } from '../session/useReviewCardHandlers';
import { PlaybackProvider } from '../session/PlaybackProvider';
import { CARD_REGISTRY } from './registry';
import { Screen, GlideViewport } from '../components';
import { SessionTop } from '../components/cardChrome';
import { CalendarIcon, SoundIcon, BarsIcon, SettingsIcon, type IconProps } from '../components/icons';
import { HomeHost, PodcastHost, ProgressHost, SettingsHost } from '../screens';
import { OnboardingGate } from '../onboarding/OnboardingGate';
import { type } from '../theme/tokens';
import type { ReviewItem } from '../types/reviewItem';
import type { CardKind } from '../types/cardKind';
import type { CardResult } from '../types/cardResult';
import { EditorProvider, useEditor } from '../services/EditorProvider';
import { EditSheet, type EditSheetProps } from '../components/EditSheet';
import type { EditableTable } from '../services/index';
import { BugReportLayer, useSetReportScreen } from '../components/BugReportLayer';

// Import only the one weight we use. The package's barrel (`@expo-google-fonts/spectral`) requires
// every weight, and some of those .ttf assets aren't present in this install — which breaks the
// bundler. Registering the family name 'Spectral_500Medium' matches `fonts.headline` in tokens.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const SpectralMedium = require('@expo-google-fonts/spectral/500Medium/Spectral_500Medium.ttf') as number;

type Route = 'home' | 'pod' | 'prog' | 'settings' | 'session';

/** The Tier-B tabs (session is a focused flow, not a tab). Labels/icons match the mockup. */
export const TABS: { route: Route; label: string; Icon: React.ComponentType<IconProps> }[] = [
  { route: 'home', label: 'Today', Icon: CalendarIcon },
  { route: 'pod', label: 'Listen', Icon: SoundIcon },
  { route: 'prog', label: 'Progress', Icon: BarsIcon },
  { route: 'settings', label: 'Settings', Icon: SettingsIcon },
];

/** Derive a first-name greeting from the signed-in user — never hard-coded. Falls back to the
 *  email's local part, title-cased, then to undefined (greeting renders without a name). */
function displayName(user: User | null): string | undefined {
  if (!user) return undefined;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromMeta = meta.name ?? meta.full_name ?? meta.display_name;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim().split(' ')[0];
  const local = (user.email ?? '').split('@')[0]?.split('+')[0]?.replace(/[._-]+/g, ' ').trim() ?? '';
  if (!local) return undefined;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Minimal placeholder tab bar — a real navigator (expo-router/react-navigation) replaces this. */
function TabBar({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }): React.JSX.Element {
  const T = useTheme();
  return (
    <View style={[styles.tabBar, { borderTopColor: T.hair, backgroundColor: T.bg }]}>
      {TABS.map((tab) => {
        const active = tab.route === route;
        const color = active ? T.primary : T.faint;
        return (
          <Pressable
            key={tab.route}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onNavigate(tab.route)}
            style={styles.tab}
          >
            <tab.Icon size={22} color={color} />
            <Text style={{ color, fontSize: type.caption, fontWeight: active ? '700' : '500', marginTop: 3 }}>
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
  advance,
  recConsent,
}: {
  item: ReviewItem;
  kind: CardKind;
  submit: (result: CardResult) => void | Promise<void>;
  /** Gate-card advance (phrase/locked, phrase/unlock) — steps the deck WITHOUT posting a review. */
  advance: () => void;
  /** GDPR record gate sourced from ProfileService once per session; pure cards receive the value. */
  recConsent: boolean;
}): React.JSX.Element {
  // The controller wires every callback to the injected services; the card stays pure (§1, §5).
  // `handlers` includes onAdvance/onUnlocked (the gate-card path) — spread reaches phrase/locked
  // (onAdvance) and phrase/unlock (onUnlocked); other cards simply ignore the extra callbacks.
  const handlers = useReviewCardHandlers(item, submit, advance);
  const Card = CARD_REGISTRY[kind];
  return <Card item={item} {...handlers} recConsent={recConsent} />;
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
const EXIT_FADE_MS = 200;

/**
 * Map a ReviewItem to the EditableTable name (word→lemmas, phrase→phrases, pair→minimal_pairs).
 * Used to seed the EditSheet for the founder affordance; no scheduler impact.
 */
function itemTypeToEditableTable(type: ReviewItem['type']): EditableTable {
  if (type === 'word') return 'lemmas';
  if (type === 'phrase') return 'phrases';
  return 'minimal_pairs';
}

export function SessionHost({ onExit }: { onExit: () => void }): React.JSX.Element {
  const session = useSession();
  const finished = !session.loading && (session.done || !session.current);
  // Read GDPR recording consent ONCE per session mount from ProfileService (CLAUDE.md §GDPR).
  // Cards are pure — they receive the resolved boolean; they never call the service themselves.
  const { profile, editor } = useServices();
  // Fail-closed default (GDPR): until getRecConsent() resolves, cards see recConsent=false so no
  // mic is ever shown to a user whose consent isn't confirmed (same safe default as
  // src/onboarding/useRecordingAllowed.ts). A brief consent-off flash beats the reverse.
  const [recConsent, setRecConsent] = useState<boolean>(false);
  useEffect(() => {
    // Also fail-closed on error: if consent cannot be confirmed, recording stays disabled.
    void profile.getRecConsent().then(setRecConsent).catch(() => setRecConsent(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Founder edit affordance — enabled only when useEditor().enabled is true.
  const { enabled: editorEnabled } = useEditor();
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Exit fade: leaving via the X shouldn't be an abrupt cut. Fade the whole session out, then hand
  // back to home. Reduced motion / the finished-bounce skip the animation. (Probe + timer-commit
  // pattern mirrors GlideViewport/StageFade — the Animated callback is unreliable under fake timers.)
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);
  const closing = useRef(false); // guard: a double-tap during the fade must not fire onExit twice
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => {
        reduceMotion.current = !!on;
      })
      .catch(() => {});
  }, []);

  const handleClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduceMotion.current) {
      onExit();
      return;
    }
    Animated.timing(exitOpacity, {
      toValue: 0,
      duration: EXIT_FADE_MS,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    setTimeout(onExit, EXIT_FADE_MS + 20);
  }, [exitOpacity, onExit]);

  // Empty batch / finished — bounce back to home in an effect, never via setState during render.
  useEffect(() => {
    if (finished) onExit();
  }, [finished, onExit]);

  // Loading or finished: show a neutral placeholder (a "0 / 1000 words" progress bar here would
  // misread as the user knowing nothing — that's the Tier-B prog screen, not a loading state).
  if (session.loading) return <SessionPlaceholder label="Loading your session…" />;
  if (!session.current) return <SessionPlaceholder />; // also narrows current for the card below

  const currentItem = session.current.item;
  const editTable = itemTypeToEditableTable(currentItem.type);

  // Seed the EditSheet initial values from the ReviewItem.
  // `qa_status` is not stored on ReviewItem (it's a DB provenance trail); default to 'draft'.
  const editInitial: EditSheetProps['initial'] = {
    gloss_en: currentItem.gloss,
    target: currentItem.target,
    // Pass through optional fields if present on the item (additive, no scheduler impact).
    usage_note: currentItem.usageNote,
    literal_gloss: currentItem.literal,
    // qa_status is provenance metadata — NOT on ReviewItem; default 'draft' for stepper start.
    qa_status: 'draft',
  };

  const handleEditSubmit: React.ComponentProps<typeof EditSheet>['onSubmit'] = (patch) => {
    // Build the full ContentEditRequest from the current item + patch.
    const req = {
      table: editTable,
      id: currentItem.id,
      ...(patch.fields ? { fields: patch.fields } : {}),
      ...(patch.qa_status !== undefined ? { qa_status: patch.qa_status } : {}),
    };
    setEditSubmitting(true);
    void editor
      .edit(req)
      .then(() => {
        setEditSubmitting(false);
        setEditSheetOpen(false);
      })
      .catch((err: unknown) => {
        // Non-blocking: the deck MUST NOT stall on an edit failure (mirrors submit-resilience
        // in sessionController — srs.submit errors are caught and the session advances).
        setEditSubmitting(false);
        // Surface the error for visibility without blocking the learner.
        // eslint-disable-next-line no-console
        console.warn('[editor] edit failed — session unaffected', err);
      });
  };

  return (
    <Animated.View style={[styles.sessionShell, { opacity: exitOpacity }]}>
      {/* GlideViewport owns "remount per CARD encounter": keyed off queue position + item id +
          kind, it freezes the leaving card and glides in the entering one, so per-card ephemeral
          state (stage, first-try miss, recording buffer) resets when the committed card changes.
          The kind MUST be part of the key: a gated phrase keeps ONE row id across its locked ->
          unlock -> hear renders, so keying on id alone left the unlock node frozen (the hear card
          never mounted, its audio never replayed). The POSITION must be part of it too: adjacent
          queue entries can legitimately share id+kind (e.g. a word arc whose MC step degraded to
          the intro's fallback kind — intro word/hear followed by an mc-fallback word/hear after a
          distractor-RPC failure), and id+kind alone left the second card showing the first card's
          frozen completed state. See GlideViewport's same-key contract + StartingLoop.test.tsx. */}
      <GlideViewport itemKey={`${session.step}:${session.current.item.id}:${session.current.kind}`}>
        <CardHost
          item={session.current.item}
          kind={session.current.kind}
          submit={session.submit}
          advance={session.advance}
          recConsent={recConsent}
        />
      </GlideViewport>
      {/* Session chrome (close + progress) floats above the gliding cards so the learner can leave
          to home at any time. box-none lets taps fall through to the centered card body; only the
          close button captures them. */}
      <SafeAreaView style={styles.sessionTopOverlay} pointerEvents="box-none">
        <View style={styles.sessionTopInner} pointerEvents="box-none">
          <SessionTop step={session.step} total={session.total} onClose={handleClose} />
          {/* Founder-only flag/edit affordance — hidden for all non-founder users.
              Lives in the session HOST chrome, NOT inside any card (cards stay pure).
              The server Edge Function is the real gate; useEditor().enabled is client UX only. */}
          {editorEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Flag or edit this card"
              onPress={() => setEditSheetOpen(true)}
              style={styles.editAffordance}
            />
          ) : null}
        </View>
      </SafeAreaView>
      {/* EditSheet — rendered in the session host, never inside a card. */}
      {editorEnabled && editSheetOpen ? (
        <View style={styles.editSheetOverlay}>
          <EditSheet
            table={editTable}
            initial={editInitial}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditSheetOpen(false)}
            submitting={editSubmitting}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

/** Routes the three Tier-B hosts + the focused session flow. */
function Root(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('home');
  const { user } = useAuth();
  const name = displayName(user);
  const setReportScreen = useSetReportScreen();
  useEffect(() => { setReportScreen(route); }, [route, setReportScreen]);

  if (route === 'session') {
    // Session is a focused flow with no tab bar; exit returns to home. PlaybackProvider (inside
    // ServiceProvider, via AuthGate) bridges live AudioService status to the cards' soundbar.
    return (
      <PlaybackProvider>
        <SessionHost onExit={() => setRoute('home')} />
      </PlaybackProvider>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {route === 'home' ? (
          <HomeHost
            name={name}
            onStart={() => setRoute('session')}
            onOpenPodcast={() => setRoute('pod')}
          />
        ) : null}
        {route === 'pod' ? <PodcastHost onKeepLearning={() => setRoute('home')} /> : null}
        {route === 'prog' ? <ProgressHost /> : null}
        {route === 'settings' ? <SettingsHost /> : null}
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
      {/* EditorProvider resolves the founder flag once; useEditor() is safe anywhere below. */}
      <EditorProvider>
        <BugReportLayer>
          <OnboardingGate>
            <Root />
          </OnboardingGate>
        </BugReportLayer>
      </EditorProvider>
    </ServiceProvider>
  );
}

/** DEV-ONLY: web `?preview` renders the card gallery (no auth/content) for visual QA via the
 *  chrome-devtools MCP. Never true on iOS/Android, so it's stripped from the shipping app path. */
function isPreview(): boolean {
  return (
    __DEV__ &&
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    /[?&]preview\b/.test(window.location?.search ?? '')
  );
}

export function App(): React.JSX.Element {
  // Load the Spectral serif used for headlines/greetings before first paint (it was never loaded
  // before, so headlines silently fell back to the system sans). Brief blank while it resolves —
  // but a load ERROR must not strand the app on the boot screen forever: proceed and let
  // headlines fall back to the system font.
  const [fontsLoaded, fontError] = useFonts({ Spectral_500Medium: SpectralMedium });
  if (!fontsLoaded && !fontError) return <View style={styles.boot} />;

  if (isPreview()) {
    return (
      <ThemeProvider>
        <CardPreviewGallery />
      </ThemeProvider>
    );
  }
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
  sessionShell: { flex: 1 },
  sessionTopOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  sessionTopInner: { paddingHorizontal: 24, paddingTop: 6 },
  boot: { flex: 1, backgroundColor: '#0E1318' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 24,
    paddingTop: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  // Founder-only flag/edit affordance button (a small tap target in the chrome row).
  editAffordance: { width: 32, height: 32, marginLeft: 8 },
  // EditSheet overlay — covers the session chrome when open.
  editSheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
