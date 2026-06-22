// Settings list primitives — pure presentational components for the Settings tab (Tier B).
// Ported from the design mockup `screens-settings.jsx`. They render from props + theme tokens
// only; no service imports. The Host/Screen layer supplies all data and callbacks.
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, hexA } from '../theme/tokens';
import {
  SunIcon,
  MoonIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  BellIcon,
  SparkleIcon,
  HelpIcon,
  InfoIcon,
  LogoutIcon,
  PersonIcon,
  MailIcon,
  GlobeIcon,
  ShieldIcon,
  CameraIcon,
  AutoThemeIcon,
  CheckIcon,
  TrashIcon,
  type IconProps,
} from './icons';

/** Icon keys a SettRow can name. Maps the mock's `<Icon name=…>` to our glyph components. */
export type SettIconName =
  | 'sun'
  | 'moon'
  | 'auto'
  | 'bell'
  | 'sparkle'
  | 'help'
  | 'info'
  | 'logout'
  | 'person'
  | 'mail'
  | 'globe'
  | 'shield'
  | 'camera'
  | 'check'
  | 'chevR'
  | 'chevL'
  | 'trash';

export const SETTINGS_ICONS: Record<SettIconName, React.ComponentType<IconProps>> = {
  sun: SunIcon,
  moon: MoonIcon,
  auto: AutoThemeIcon,
  bell: BellIcon,
  sparkle: SparkleIcon,
  help: HelpIcon,
  info: InfoIcon,
  logout: LogoutIcon,
  person: PersonIcon,
  mail: MailIcon,
  globe: GlobeIcon,
  shield: ShieldIcon,
  camera: CameraIcon,
  check: CheckIcon,
  chevR: ChevronRightIcon,
  chevL: ChevronLeftIcon,
  trash: TrashIcon,
};

/** Uppercase group label above a card (mock SettGroupLabel). */
export function SettGroupLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  const T = useTheme();
  return <Text style={[styles.groupLabel, { color: T.faint }]}>{children}</Text>;
}

/** Rounded surface that groups rows (mock SettCard). */
export function SettCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}): React.JSX.Element {
  const T = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: T.surface, borderColor: T.hair },
        T.shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface SettRowProps {
  icon?: SettIconName;
  title: string;
  sub?: string;
  value?: string;
  /** Show the trailing chevron (defaults true when onPress is set, false otherwise). */
  chevron?: boolean;
  danger?: boolean;
  onPress?: () => void;
  /** Last row in a card — suppresses the bottom hairline. */
  isLast?: boolean;
  /** Trailing custom element (e.g. a SettSwitch). Takes the place of value/chevron. */
  right?: React.ReactNode;
  accessibilityLabel?: string;
}

/** One settings row: icon tile + title/sub + trailing value/chevron/right (mock SettRow). */
export function SettRow({
  icon,
  title,
  sub,
  value,
  chevron,
  danger = false,
  onPress,
  isLast = false,
  right,
  accessibilityLabel,
}: SettRowProps): React.JSX.Element {
  const T = useTheme();
  const Glyph = icon ? SETTINGS_ICONS[icon] : null;
  const titleColor = danger ? T.record : T.ink;
  const showChevron = chevron ?? Boolean(onPress);

  const body = (
    <View style={styles.rowInner}>
      {Glyph ? (
        <View
          style={[
            styles.iconTile,
            { backgroundColor: danger ? hexA(T.record, 0.12) : T.primarySoft },
          ]}
        >
          <Glyph size={18} color={danger ? T.record : T.primary} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: titleColor }]}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: T.faint }]}>{sub}</Text> : null}
      </View>
      {right ?? (
        <View style={styles.rowTrailing}>
          {value ? <Text style={[styles.rowValue, { color: T.sub }]}>{value}</Text> : null}
          {showChevron ? <ChevronRightIcon size={18} color={T.faint} /> : null}
        </View>
      )}
    </View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? title}
          onPress={onPress}
          style={({ pressed }) => [styles.row, pressed ? { backgroundColor: T.primaryFaint } : null]}
        >
          {body}
        </Pressable>
      ) : (
        <View accessibilityLabel={accessibilityLabel} style={styles.row}>
          {body}
        </View>
      )}
      {!isLast ? (
        <View style={[styles.sep, { backgroundColor: T.hair, left: Glyph ? 62 : 16 }]} />
      ) : null}
    </View>
  );
}

/** Pill toggle (mock Switch). 46×28, knob slides; on = primary track. */
export function SettSwitch({
  on,
  onToggle,
  accessibilityLabel,
}: {
  on: boolean;
  onToggle: () => void;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const T = useTheme();
  const trackOff = T.dark ? 'rgba(255,255,255,0.16)' : 'rgba(26,39,51,0.16)';
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={accessibilityLabel ?? 'toggle'}
      onPress={onToggle}
      style={[styles.switchTrack, { backgroundColor: on ? T.primary : trackOff }]}
    >
      <View style={[styles.switchKnob, { left: on ? 21 : 3 }]} />
    </Pressable>
  );
}

/** Circular avatar with serif initials (mock Avatar). */
export function Avatar({ size = 44, initials }: { size?: number; initials: string }): React.JSX.Element {
  const T = useTheme();
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: T.primarySoft,
          borderColor: hexA(T.primary, 0.2),
        },
      ]}
    >
      <Text style={[styles.avatarText, { color: T.primary, fontSize: size * 0.42 }]}>
        {initials}
      </Text>
    </View>
  );
}

/** Sub-screen header: round back button + serif title + optional right action (mock SettNavHeader). */
export function SettNavHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
}): React.JSX.Element {
  const T = useTheme();
  return (
    <View style={styles.navHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={[styles.backBtn, { backgroundColor: T.surface, borderColor: T.hair }]}
      >
        <ChevronLeftIcon size={18} color={T.sub} />
      </Pressable>
      <Text style={[styles.navTitle, { color: T.ink }]}>{title}</Text>
      <View style={styles.navAction}>{action}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 26,
    paddingBottom: 10,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    minHeight: 58,
    justifyContent: 'center',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowSub: { fontSize: 12.5, marginTop: 2 },
  rowTrailing: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  rowValue: { fontSize: 14.5 },
  sep: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
  },
  switchKnob: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: {
    fontFamily: fonts.headline,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
    paddingTop: 12,
    paddingBottom: 18,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    flex: 1,
    fontSize: 32,
    fontFamily: fonts.headline,
  },
  navAction: { minWidth: 36, alignItems: 'flex-end' },
});
