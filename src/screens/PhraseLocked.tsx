// phrase/locked — gating glimpse rebuilt to the founder mockup (spec 2026-07-23 §6).
// Chips show each word AS IT APPEARS in the phrase; earned words carry a "form of <lemma>"
// bridge when the surface differs from what was taught (the Man/ir fix, bug e9e78a2a).
// Still a GATE, not a review: Continue advances WITHOUT posting a CardResult.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, CtaButton } from '../components';
import { CardIcon, PhraseLine } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import type { PhraseGateProps } from './cardProps';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

function countCopy(known: number, remaining: number): string {
  if (known === 0) return 'Learn these words and the phrase opens.';
  // "these words" refers to the phrase's whole set of component words (always plural, since a
  // phrase gate always has 2+ components) — NOT to the count just learned, so this stays "words"
  // even when known === 1 ("You already know one of these words.").
  const knowLine = `You already know ${numberWord(known)} of these words.`;
  const learnLine = `Learn ${remaining === 1 ? 'one more' : `${numberWord(remaining)} more`} and the phrase opens.`;
  return `${knowLine}\n${learnLine}`;
}

export function PhraseLocked({ item, onAdvance }: PhraseGateProps): React.JSX.Element {
  const T = useTheme();
  const chips = item.componentBreakdown ?? [];
  // `known` is undefined on every non-phrase/locked item (the controller only decorates it here) —
  // treated as falsy, so an undecorated chip renders as "new"/locked, never "known" by accident.
  const knownCount = chips.filter((c) => c.known).length;
  // Computed ONCE and shared by the count copy and the lock pill — they must never disagree about
  // how many words are still missing (reviewer finding: two independent `?? ` fallbacks could
  // diverge when lockLemma is set without lockRemaining and >1 chips are unknown).
  const remaining = item.lockRemaining ?? Math.max(1, chips.length - knownCount);

  return (
    <Screen>
      {chips.length > 0 ? (
        <View style={styles.chipRow}>
          {chips.map((c, i) => (
            <View
              key={i}
              style={[
                styles.chip,
                c.known
                  ? { backgroundColor: T.surface, borderColor: T.hair }
                  : { backgroundColor: T.sunken, borderColor: T.sunken },
              ]}
            >
              <Text style={[styles.chipWord, { color: c.known ? T.ink : T.sub }]}>{c.surface}</Text>
              <View style={styles.chipStatus}>
                <CardIcon name={c.known ? 'check' : 'lock'} size={11} color={c.known ? T.good : T.faint} />
                <Text style={[styles.chipStatusText, { color: T.faint }]}>
                  {c.known
                    ? c.surface.toLowerCase() !== c.lemma.toLowerCase() ? `form of ${c.lemma}` : 'known'
                    : 'new'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.body}>
        {chips.length > 0 ? (
          <Text style={[styles.count, { color: T.sub }]}>{countCopy(knownCount, remaining)}</Text>
        ) : null}
        <View style={{ marginTop: 18 }}>
          <PhraseLine phrase={item.target} size={32} />
        </View>
        <View style={[styles.pill, { borderColor: T.hair }]}>
          <CardIcon name="lock" size={14} color={T.faint} />
          <Text style={[styles.pillText, { color: T.sub }]}>
            {item.lockLemma ? (
              <>
                {remaining} {remaining === 1 ? 'word' : 'words'} to go — learn{' '}
                <Text style={{ fontFamily: fonts.headline, fontWeight: '600', color: T.ink }}>{item.lockLemma}</Text>
              </>
            ) : (
              'Unlocks when you know its words.'
            )}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <CtaButton title="Continue" onPress={() => onAdvance?.()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', justifyContent: 'center', columnGap: 10, marginTop: 8 },
  chip: { minWidth: 86, borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  chipWord: { fontFamily: fonts.headline, fontSize: 17 },
  chipStatus: { flexDirection: 'row', alignItems: 'center', columnGap: 4, marginTop: 6 },
  chipStatusText: { fontSize: 11.5 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  count: { fontSize: 14.5, lineHeight: 21, textAlign: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', columnGap: 7, borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, marginTop: 26 },
  pillText: { fontSize: 14 },
  footer: { paddingBottom: 12 },
});
