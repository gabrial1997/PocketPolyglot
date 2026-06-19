// cardChrome — shared presentational pieces for the SRS cards, matched 1:1 to the design mockups
// (kit.jsx + screens-*.jsx). PURE: theme + props only, never a service. Cards compose these so each
// card body is a faithful render of the mockup while staying a thin presentational component.
//
// NOTE for wiring: nothing here changes the card data/event contract. `SessionTop` is session chrome
// (progress + close) — mount it once in SessionHost where step/total are known, OR per card if you
// pass a `progress` prop. It is exported but not required by any card body.
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle, type DimensionValue } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { hexA, fonts } from '../theme/tokens';
import { LiveWaveform } from './LiveWaveform';
import { usePlayClip, FRAME_MS } from './usePlayClip';
import { PlayOrb } from './PlayOrb';

// ── icons (ported from kit.jsx Icon paths) ────────────────────────────────
type IconName = 'check' | 'speaker' | 'mic' | 'replay' | 'lock' | 'unlock' | 'text' | 'close' | 'play' | 'chevR' | 'chevD' | 'settings';
export function CardIcon({ name, size = 20, color, sw = 1.8 }: { name: IconName; size?: number; color: string; sw?: number }): React.JSX.Element {
  const p = { fill: 'none' as const, stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 6.5" {...p} strokeWidth={sw + 0.3} />}
      {name === 'speaker' && <Path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z" {...p} />}
      {name === 'speaker' && <Path d="M16.5 9a4 4 0 0 1 0 6" {...p} />}
      {name === 'mic' && <Rect x="9" y="2.5" width="6" height="12" rx="3" {...p} />}
      {name === 'mic' && <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" {...p} />}
      {name === 'replay' && <Path d="M4 12a8 8 0 1 1 2.3 5.6" {...p} />}
      {name === 'replay' && <Path d="M4 20v-5h5" {...p} />}
      {name === 'lock' && <Rect x="5.5" y="10.5" width="13" height="9.5" rx="2.8" {...p} />}
      {name === 'lock' && <Path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" {...p} />}
      {name === 'unlock' && <Rect x="5.5" y="10.5" width="13" height="9.5" rx="2.8" {...p} />}
      {name === 'unlock' && <Path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 6.8-1.4" {...p} />}
      {name === 'text' && <Path d="M5 6h14M5 11h14M5 16h9" {...p} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {name === 'play' && <Path d="M6 4.5v15a1 1 0 0 0 1.5.87l12-7.5a1 1 0 0 0 0-1.74l-12-7.5A1 1 0 0 0 6 4.5z" fill={color} />}
      {name === 'chevR' && <Path d="M9 5l7 7-7 7" {...p} />}
      {name === 'chevD' && <Path d="M5 9l7 7 7-7" {...p} />}
      {name === 'settings' && <Circle cx={12} cy={12} r={3} {...p} />}
      {name === 'settings' && <Path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.5 5.5l-2 2M7.5 16.5l-2 2M18.5 18.5l-2-2M7.5 7.5l-2-2" {...p} />}
    </Svg>
  );
}

// ── layout helpers ────────────────────────────────────────────────────────
export function CardBody({ children, style }: { children: React.ReactNode; style?: ViewStyle }): React.JSX.Element {
  return <View style={[chrome.body, style]}>{children}</View>;
}
export function CardFooter({ children, style }: { children: React.ReactNode; style?: ViewStyle }): React.JSX.Element {
  return <View style={[chrome.footer, style]}>{children}</View>;
}
export function HeadRow({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={chrome.headRow}>{children}</View>;
}

// ── text bits ───────────────────────────────────────────────────────────--
export function Eyebrow({ children }: { children: string }): React.JSX.Element {
  const T = useTheme();
  return <Text style={[chrome.eyebrow, { color: T.faint }]}>{children.toUpperCase()}</Text>;
}
export function WordHero({ children, size = 52 }: { children: React.ReactNode; size?: number }): React.JSX.Element {
  const T = useTheme();
  return <Text style={{ color: T.ink, fontFamily: fonts.headline, fontSize: size, letterSpacing: -0.8, lineHeight: Math.round(size * 1.18), textAlign: 'center' }}>{children}</Text>;
}
export function GlossLine({ gloss, pron, size = 16 }: { gloss: string; pron?: string; size?: number }): React.JSX.Element {
  const T = useTheme();
  return (
    <Text style={[chrome.center, { color: T.sub, fontSize: size }]}>
      {gloss}
      {pron ? <Text style={{ color: T.faint }}> · {pron}</Text> : null}
    </Text>
  );
}
export function Caption({ children }: { children: React.ReactNode }): React.JSX.Element {
  const T = useTheme();
  return <Text style={[chrome.caption, { color: T.faint }]}>{children}</Text>;
}
export function FootNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  const T = useTheme();
  return <Text style={[chrome.footNote, { color: T.faint }]}>{children}</Text>;
}
export function PromptText({ children, variant = 'ui' }: { children: React.ReactNode; variant?: 'ui' | 'serif' }): React.JSX.Element {
  const T = useTheme();
  return (
    <Text style={[chrome.center, variant === 'serif'
      ? { color: T.sub, fontFamily: fonts.headline, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 }
      : { color: T.sub, fontSize: 14.5 }]}>{children}</Text>
  );
}

// ── word-type tag ───────────────────────────────────────────────────────--
export type TagTone = 'primary' | 'good' | 'neutral';
export function wordTagFor(wc?: 'concrete' | 'abstract' | 'function'): { label: string; tone: TagTone } | null {
  if (wc === 'concrete') return { label: 'Picturable noun', tone: 'primary' };
  if (wc === 'abstract') return { label: 'Abstract word', tone: 'good' };
  if (wc === 'function') return { label: 'Function word', tone: 'neutral' };
  return null;
}
export function WordTag({ label, tone = 'primary' }: { label: string; tone?: TagTone }): React.JSX.Element {
  const T = useTheme();
  const c =
    tone === 'good' ? { bg: T.goodSoft, fg: T.good, bd: hexA(T.good, 0.35) }
    : tone === 'neutral' ? { bg: 'transparent', fg: T.sub, bd: T.hair }
    : { bg: T.primarySoft, fg: T.primary, bd: hexA(T.primary, 0.3) };
  return (
    <View style={[chrome.tag, { backgroundColor: c.bg, borderColor: c.bd }]}>
      <Text style={[chrome.tagText, { color: c.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

// ── mnemonic card (abstract learn) ─────────────────────────────────────────
export function MnemonicCard({ soundsLike, note }: { soundsLike: string; note: string }): React.JSX.Element {
  const T = useTheme();
  return (
    <View style={[chrome.mnem, { backgroundColor: T.surface, borderColor: T.hair }, T.shadow]}>
      <View style={chrome.mnemHead}>
        <Text style={[chrome.mnemEyebrow, { color: T.faint }]}>SOUNDS LIKE</Text>
        <Text style={[chrome.mnemWord, { color: T.ink, fontFamily: fonts.headline }]}>“{soundsLike}”</Text>
      </View>
      <Text style={[chrome.mnemNote, { color: T.sub, fontFamily: fonts.headline }]}>{note}</Text>
    </View>
  );
}

// ── example sentence row (function/abstract learn) — tap to play ───────────
export function ExampleRow({ pre, w, post, en, onPress }: { pre: string; w: string; post: string; en: string; onPress?: () => void }): React.JSX.Element {
  const T = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={chrome.exRow}>
      <PlayOrb size={34} filled={false} />
      <View style={{ flex: 1 }}>
        <Text style={[chrome.exLv, { color: T.ink, fontFamily: fonts.headline }]}>
          {pre}
          <Text style={{ color: T.primary }}>{w}</Text>
          {post}
        </Text>
        <Text style={[chrome.exEn, { color: T.sub }]}>{en}</Text>
      </View>
    </Pressable>
  );
}

// ── native-vs-you compare row (pic-review/say/sayit/pron result) ──────────-
// Self-gating reactive soundbar: tapping fires onPress (the parent's onPlayCompare) and runs the
// soundbar for the clip via usePlayClip, then it settles to rest. The "You" take has no precomputed
// envelope, so its bar honestly rests rather than faking motion (locked: REAL amplitude only).
export function CompareRow({ label, icon, envelope, onPress }: {
  label: string; icon: 'speaker' | 'mic'; envelope?: number[]; onPress?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const { playing, play } = usePlayClip(envelope);
  return (
    <Pressable accessibilityRole="button" onPress={() => play(() => onPress?.())} style={[chrome.cmpRow, { backgroundColor: T.surface, borderColor: playing ? hexA(T.primary, 0.4) : T.hair }, T.shadow]}>
      <CardIcon name={icon} size={18} color={playing ? T.primary : T.faint} />
      <Text style={[chrome.cmpLabel, { color: playing ? T.ink : T.sub }]}>{label}</Text>
      <View style={{ flex: 1 }}>
        <LiveWaveform envelope={envelope} playing={playing} frameMs={FRAME_MS} height={26} count={32} />
      </View>
    </Pressable>
  );
}

export function PlayBackToBack({ onPress, label = 'Play back-to-back' }: { onPress?: () => void; label?: string }): React.JSX.Element {
  const T = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[chrome.pbb, { borderColor: hexA(T.primary, 0.45) }]}>
      <CardIcon name="play" size={14} color={T.primary} />
      <Text style={[chrome.pbbText, { color: T.primary }]}>{label}</Text>
    </Pressable>
  );
}

export function ResultNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  const T = useTheme();
  return (
    <View style={chrome.resRow}>
      <View style={[chrome.resCircle, { backgroundColor: T.goodSoft }]}>
        <CardIcon name="check" size={13} color={T.good} sw={2.4} />
      </View>
      <Text style={[chrome.resText, { color: T.sub }]}>{children}</Text>
    </View>
  );
}

// ── 2×2 grid choice (pic-review) — centered serif word; same state model as ChoiceButton ──
export type GridChoiceState = 'idle' | 'correct' | 'wrong' | 'faded';
export function GridChoiceButton({ label, state = 'idle', disabled = false, onPress }: {
  label: string; state?: GridChoiceState; disabled?: boolean; onPress?: () => void;
}): React.JSX.Element {
  const T = useTheme();
  const isCorrect = state === 'correct', isWrong = state === 'wrong', isFaded = state === 'faded';
  const borderColor = isCorrect ? hexA(T.good, 0.5) : isWrong ? hexA(T.record, 0.45) : T.hair;
  const bg = isCorrect ? T.goodSoft : isWrong ? hexA(T.record, T.dark ? 0.12 : 0.07) : T.surface;
  const fg = isCorrect ? T.good : isWrong ? T.record : T.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[chrome.gridCell, { borderColor, backgroundColor: bg, opacity: isFaded ? 0.45 : 1 }, state === 'idle' ? T.shadow : null]}
    >
      <Text style={[chrome.gridWord, { color: fg, fontFamily: fonts.headline }]}>{label}</Text>
      {isCorrect ? <CardIcon name="check" size={17} color={T.good} sw={2.4} /> : null}
    </Pressable>
  );
}

// ── phrase line — serif phrase, the just-learned word in primary + underlined ──────────────
// `highlight` is the inflected surface form to emphasise (e.g. "dzeru"); matched case-insensitively
// and ignoring trailing punctuation. `dim` greys the whole line (the locked glimpse). When no
// highlight is supplied the line renders plainly — degrades gracefully for transparent phrases.
export function PhraseLine({ phrase, highlight, dim = false, size = 34 }: {
  phrase: string; highlight?: string; dim?: boolean; size?: number;
}): React.JSX.Element {
  const T = useTheme();
  const norm = (s: string): string => s.replace(/[.,!?;:]+$/g, '').toLowerCase();
  const hl = highlight ? norm(highlight) : null;
  const tokens = phrase.split(/(\s+)/); // keep the whitespace tokens so spacing survives
  return (
    <Text style={{ fontFamily: fonts.headline, fontSize: size, fontWeight: '500', letterSpacing: -0.5, lineHeight: size * 1.25, textAlign: 'center', color: dim ? T.faint : T.ink }}>
      {tokens.map((tok, i) => {
        if (/^\s+$/.test(tok) || tok === '') return tok;
        const isHl = !dim && hl !== null && norm(tok) === hl;
        return isHl
          ? <Text key={i} style={{ color: T.primary, textDecorationLine: 'underline', textDecorationColor: hexA(T.primary, 0.35) }}>{tok}</Text>
          : <Text key={i}>{tok}</Text>;
      })}
    </Text>
  );
}

// ── session chrome (progress + close). Mount in SessionHost; not part of any card contract. ──
export function SessionTop({ step, total, onClose }: { step: number; total: number; onClose?: () => void }): React.JSX.Element {
  const T = useTheme();
  const pct = total > 0 ? Math.max(0, Math.min(1, step / total)) : 0;
  return (
    <View style={chrome.stRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close session" hitSlop={8} onPress={onClose} style={[chrome.stClose, { backgroundColor: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(26,39,51,0.05)' }]}>
        <CardIcon name="close" size={17} color={T.sub} />
      </Pressable>
      <View style={[chrome.stTrack, { backgroundColor: T.dark ? 'rgba(255,255,255,0.09)' : 'rgba(26,39,51,0.08)' }]}>
        <View style={[chrome.stFill, { backgroundColor: T.primary, width: `${pct * 100}%` as DimensionValue }]} />
      </View>
      <Text style={[chrome.stLabel, { color: T.faint }]}>{step}/{total}</Text>
    </View>
  );
}

const chrome = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', rowGap: 14, paddingBottom: 8 },
  footer: { paddingBottom: 30, rowGap: 11 },
  headRow: { flexDirection: 'row', alignItems: 'center', columnGap: 10 },
  center: { textAlign: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.3, textAlign: 'center' },
  caption: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  footNote: { fontSize: 13.5, fontWeight: '500', textAlign: 'center' },
  tag: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1 },
  tagText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  mnem: { width: '100%', borderRadius: 20, padding: 18, borderWidth: StyleSheet.hairlineWidth },
  mnemHead: { flexDirection: 'row', alignItems: 'baseline', columnGap: 10 },
  mnemEyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2 },
  mnemWord: { fontSize: 21, fontWeight: '600' },
  mnemNote: { fontStyle: 'italic', fontSize: 15.5, marginTop: 8, lineHeight: 22 },
  exRow: { flexDirection: 'row', alignItems: 'center', columnGap: 13, width: '100%' },
  exLv: { fontSize: 19, fontWeight: '500' },
  exEn: { fontSize: 13, marginTop: 2 },
  cmpRow: { flexDirection: 'row', alignItems: 'center', columnGap: 14, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, width: '100%' },
  cmpLabel: { fontSize: 13, fontWeight: '600', width: 48 },
  pbb: { flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 99, borderWidth: 1.5, alignSelf: 'center' },
  pbbText: { fontSize: 14, fontWeight: '600' },
  resRow: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  resCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  resText: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  gridCell: { flexBasis: '47%', flexGrow: 1, minHeight: 52, borderRadius: 16, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7, paddingHorizontal: 12 },
  gridWord: { fontSize: 19, fontWeight: '500' },
  stRow: { flexDirection: 'row', alignItems: 'center', columnGap: 14 },
  stClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stTrack: { flex: 1, height: 4, borderRadius: 99, overflow: 'hidden' },
  stFill: { height: 4, borderRadius: 99 },
  stLabel: { fontSize: 13, fontWeight: '600', minWidth: 36, textAlign: 'right' },
});
