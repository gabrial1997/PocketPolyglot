// SettingsScreen — pure Tier-B settings UI (data-in / events-out). A small `view`-state router
// over Menu / Profile / Appearance sub-screens plus a Log-out sheet. Imports NO service: all data
// and actions arrive as props from SettingsHost. Ported from the design mock `screens-settings.jsx`
// with the locked scope decisions: Subscription omitted, Profile display-only, GDPR consent in a
// dedicated Privacy group, Notifications local-only.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { LogoutIcon, CheckIcon } from '../components/icons';
import {
  SettCard,
  SettRow,
  SettSwitch,
  SettGroupLabel,
  SettNavHeader,
  Avatar,
} from '../components/SettingsPrimitives';
import type { ThemeMode } from '../theme/ThemeProvider';

export interface SettingsScreenProps {
  name?: string;
  email?: string;
  appVersion: string;
  themeMode: ThemeMode;
  onSelectMode: (m: ThemeMode) => void;
  recConsent: boolean;
  onToggleConsent: (next: boolean) => void;
  onDeleteRecordings: () => void;
  /** Set by the host when the last deleteRecordings() attempt failed; cleared on the next
   *  successful delete. Surfaced on the row (rather than a swallowed .catch) so the learner is
   *  never left believing their recordings were deleted when they weren't (GDPR). */
  deleteRecordingsError?: boolean;
  onSignOut: () => void;
  /** Dev-only controls (host passes this ONLY under __DEV__; absent in production). */
  dev?: {
    simulatedDateLabel: string;
    offsetDays: number;
    onSkipDay: () => void;
    onResetProgress: () => void;
    /** Set by the host when the last resetProgress() attempt failed; cleared on the next
     *  successful skip-day or reset. Surfaced here (rather than a swallowed .catch) so the
     *  learner isn't left believing a reset happened when it didn't. */
    resetError?: boolean;
  };
}

type SettingsView = 'menu' | 'profile' | 'appearance';

const MODE_LABEL: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'System' };

function initialsOf(name?: string): string {
  const c = (name ?? '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

export function SettingsScreen(props: SettingsScreenProps): React.JSX.Element {
  const [view, setView] = useState<SettingsView>('menu');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notif, setNotif] = useState(true); // local visual state only (no push infra yet)

  if (view === 'profile') {
    return (
      <ProfileSettings
        {...props}
        onBack={() => setView('menu')}
      />
    );
  }
  if (view === 'appearance') {
    return (
      <AppearanceSettings
        themeMode={props.themeMode}
        onSelectMode={props.onSelectMode}
        onBack={() => setView('menu')}
      />
    );
  }

  return (
    <SettingsMenu
      {...props}
      notif={notif}
      onToggleNotif={() => setNotif((v) => !v)}
      onOpenProfile={() => setView('profile')}
      onOpenAppearance={() => setView('appearance')}
      logoutOpen={logoutOpen}
      onOpenLogout={() => setLogoutOpen(true)}
      onCloseLogout={() => setLogoutOpen(false)}
    />
  );
}

// --- Menu -------------------------------------------------------------------

function SettingsMenu(
  props: SettingsScreenProps & {
    notif: boolean;
    onToggleNotif: () => void;
    onOpenProfile: () => void;
    onOpenAppearance: () => void;
    logoutOpen: boolean;
    onOpenLogout: () => void;
    onCloseLogout: () => void;
  },
): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[styles.screenTitle, { color: T.ink }]}>Settings</Text>

        {/* Profile card */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={props.onOpenProfile}
          style={({ pressed }) => [
            styles.profileCard,
            { backgroundColor: T.surface, borderColor: T.hair },
            T.shadow,
            pressed ? { backgroundColor: T.primaryFaint } : null,
          ]}
        >
          <Avatar size={52} initials={initialsOf(props.name)} />
          <View style={styles.profileText}>
            <Text style={[styles.profileName, { color: T.ink }]}>{props.name ?? 'Your account'}</Text>
            {props.email ? (
              <Text style={[styles.profileEmail, { color: T.sub }]}>{props.email}</Text>
            ) : null}
          </View>
        </Pressable>

        {/* Preferences */}
        <SettGroupLabel>Preferences</SettGroupLabel>
        <SettCard>
          <SettRow
            icon="sun"
            title="Appearance"
            value={MODE_LABEL[props.themeMode]}
            onPress={props.onOpenAppearance}
          />
          <SettRow
            icon="bell"
            title="Notifications"
            right={<SettSwitch on={props.notif} onToggle={props.onToggleNotif} accessibilityLabel="Notifications" />}
            isLast
          />
        </SettCard>

        {/* Support */}
        <SettGroupLabel>Support</SettGroupLabel>
        <SettCard>
          <SettRow icon="help" title="Help & feedback" chevron={false} />
          <SettRow icon="info" title="About" value={`v${props.appVersion}`} chevron={false} isLast />
        </SettCard>

        {/* Developer (dev builds only — the host omits `dev` in production) */}
        {props.dev ? <DevSection dev={props.dev} /> : null}

        {/* Log out */}
        <View style={styles.logoutWrap}>
          <SettCard>
            <SettRow
              icon="logout"
              title="Log out"
              danger
              chevron={false}
              isLast
              onPress={props.onOpenLogout}
              accessibilityLabel="Log out"
            />
          </SettCard>
        </View>

        <Text style={[styles.footer, { color: T.faint }]}>PocketPolyglot · v{props.appVersion}</Text>
      </ScrollView>

      <LogoutSheet
        visible={props.logoutOpen}
        onCancel={props.onCloseLogout}
        onConfirm={() => {
          props.onCloseLogout();
          props.onSignOut();
        }}
      />
    </Screen>
  );
}

// --- Profile (display-only + GDPR Privacy group) ----------------------------

function ProfileSettings(props: SettingsScreenProps & { onBack: () => void }): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SettNavHeader title="Profile" onBack={props.onBack} />

        <View style={styles.profileHero}>
          <Avatar size={88} initials={initialsOf(props.name)} />
          <Text style={[styles.changePhoto, { color: T.faint }]}>Change photo</Text>
        </View>

        <SettGroupLabel>Account</SettGroupLabel>
        <SettCard>
          <SettRow icon="person" title="Name" value={props.name ?? '—'} chevron={false} />
          <SettRow icon="mail" title="Email" value={props.email ?? '—'} chevron={false} isLast />
        </SettCard>

        <SettGroupLabel>Languages</SettGroupLabel>
        <SettCard>
          <SettRow icon="globe" title="I speak" value="English" chevron={false} />
          <SettRow icon="globe" title="Learning" value="Latvian" chevron={false} isLast />
        </SettCard>

        <SettGroupLabel>Privacy</SettGroupLabel>
        <SettCard>
          <SettRow
            icon="shield"
            title="Recording consent"
            sub="Lets you record and compare your pronunciation."
            chevron={false}
            right={
              <SettSwitch
                on={props.recConsent}
                onToggle={() => props.onToggleConsent(!props.recConsent)}
                accessibilityLabel="Recording consent"
              />
            }
          />
          <SettRow
            icon="trash"
            title={props.deleteRecordingsError ? 'Delete failed — tap to retry' : 'Delete my recordings'}
            danger
            chevron={false}
            isLast
            onPress={props.onDeleteRecordings}
          />
        </SettCard>

        <SettGroupLabel>Security</SettGroupLabel>
        <SettCard>
          <SettRow icon="shield" title="Change password" chevron={false} isLast />
        </SettCard>
      </ScrollView>
    </Screen>
  );
}

// --- Appearance (real theme control) ----------------------------------------

function AppearanceSettings({
  themeMode,
  onSelectMode,
  onBack,
}: {
  themeMode: ThemeMode;
  onSelectMode: (m: ThemeMode) => void;
  onBack: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const rows: { mode: ThemeMode; icon: 'sun' | 'moon' | 'auto'; title: string }[] = [
    { mode: 'light', icon: 'sun', title: 'Light' },
    { mode: 'dark', icon: 'moon', title: 'Dark' },
    { mode: 'system', icon: 'auto', title: 'System' },
  ];
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SettNavHeader title="Appearance" onBack={onBack} />
        <SettGroupLabel>Theme</SettGroupLabel>
        <SettCard>
          {rows.map((r, i) => (
            <SettRow
              key={r.mode}
              icon={r.icon}
              title={r.title}
              chevron={false}
              isLast={i === rows.length - 1}
              onPress={() => onSelectMode(r.mode)}
              right={themeMode === r.mode ? <CheckIcon size={19} color={T.primary} /> : <View />}
            />
          ))}
        </SettCard>
      </ScrollView>
    </Screen>
  );
}

// --- Logout sheet -----------------------------------------------------------

function LogoutSheet({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const T = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable accessibilityLabel="Dismiss" onPress={onCancel} style={styles.scrim} />
      <View style={[styles.sheet, { backgroundColor: T.surface }]}>
        <View style={[styles.grab, { backgroundColor: T.hair }]} />
        <Text style={[styles.sheetTitle, { color: T.ink }]}>Log out?</Text>
        <Text style={[styles.sheetBody, { color: T.sub }]}>
          Your progress is saved. You can sign back in anytime.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirm log out"
          onPress={onConfirm}
          style={[styles.confirmBtn, { backgroundColor: T.record }]}
        >
          <LogoutIcon size={18} color={T.onPrimary} />
          <Text style={[styles.confirmText, { color: T.onPrimary }]}>Log out</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onCancel}
          style={[styles.cancelBtn, { borderColor: T.hair }]}
        >
          <Text style={[styles.cancelText, { color: T.sub }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// --- Developer (dev builds only) --------------------------------------------

function DevSection({ dev }: { dev: NonNullable<SettingsScreenProps['dev']> }): React.JSX.Element {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000); // disarm if not confirmed
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <>
      <SettGroupLabel>Developer</SettGroupLabel>
      <SettCard>
        <SettRow
          title="Skip to next day"
          value={dev.simulatedDateLabel}
          chevron={false}
          onPress={dev.onSkipDay}
        />
        <SettRow
          title={
            armed
              ? 'Tap again to erase all progress'
              : dev.resetError
                ? 'Reset failed — tap to retry'
                : 'Reset progress'
          }
          danger={armed || dev.resetError}
          chevron={false}
          isLast
          onPress={() => {
            if (armed) {
              setArmed(false);
              dev.onResetProgress();
            } else {
              setArmed(true);
            }
          }}
        />
      </SettCard>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  screenTitle: { fontSize: 34, fontFamily: fonts.headline, paddingTop: 12, paddingBottom: 18 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  profileText: { flex: 1 },
  profileName: { fontSize: 22, fontFamily: fonts.headline },
  profileEmail: { fontSize: 13.5, marginTop: 2 },
  logoutWrap: { marginTop: 26 },
  footer: { fontSize: 12, textAlign: 'center', marginTop: 26 },
  profileHero: { alignItems: 'center', rowGap: 10, paddingVertical: 8 },
  changePhoto: { fontSize: 13.5 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,14,18,0.42)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    rowGap: 12,
  },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  sheetTitle: { fontSize: 24, fontFamily: fonts.headline },
  sheetBody: { fontSize: 14.5, lineHeight: 21 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    height: 54,
    borderRadius: 16,
    marginTop: 4,
  },
  confirmText: { fontSize: 16, fontWeight: '600' },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cancelText: { fontSize: 15.5, fontWeight: '500' },
});
