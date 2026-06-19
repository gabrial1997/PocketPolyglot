// phrase/locked — gating glimpse (BACKEND_INTEGRATION §4). The phrase is visible but greyed; it
// unlocks only once every component word is known (the controller decides via KnownWordsStore).
// This is a GATE, not a review: Continue advances past the glimpse WITHOUT posting a CardResult.
//
// 2026-06-19 VISUAL SYNC: rebuilt to the mockup (screens-phrase.jsx `PhraseLocked`). Top eyebrow
// "UPCOMING PHRASE"; the phrase dimmed (PhraseLine dim); a quiet lock hint ("1 word to go — learn
// dzert") + the in-phrase form ("It appears here as 'dzeru'."). Calm, nothing to dwell on, so the
// advance is a faint text button — not the filled CTA.
//
// Dynamic hint fields are optional/additive on ReviewItem (see front-end-sync handoff PATCH):
//   lockRemaining?: number — words still to learn (default 1)
//   lockLemma?: string     — the dictionary form to go learn (e.g. "dzert")
//   newForm?: string       — how it appears inflected in this phrase (e.g. "dzeru")
// All degrade gracefully: with none present the hint falls back to "Unlocks when you know its words."
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { CardIcon, Eyebrow, PhraseLine } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import type { PhraseGateProps } from './cardProps';
import type { ReviewItem } from '../types/reviewItem';

type LockExtra = { lockRemaining?: number; lockLemma?: string; newForm?: string };

export function PhraseLocked({ item, onAdvance }: PhraseGateProps): React.JSX.Element {
  const T = useTheme();
  const x = item as ReviewItem & LockExtra;
  const remaining = x.lockRemaining ?? 1;

  return (
    <Screen>
      <View style={styles.head}>
        <Eyebrow>Upcoming phrase</Eyebrow>
      </View>

      <View style={styles.body}>
        <PhraseLine phrase={item.target} dim size={32} />

        <View style={styles.hintRow}>
          <CardIcon name="lock" size={15} color={T.faint} />
          <Text style={[styles.hint, { color: T.sub }]}>
            {x.lockLemma ? (
              <>
                {remaining} {remaining === 1 ? 'word' : 'words'} to go — learn{' '}
                <Text style={{ fontFamily: fonts.headline, fontWeight: '600', color: T.ink }}>{x.lockLemma}</Text>
              </>
            ) : (
              'Unlocks when you know its words.'
            )}
          </Text>
        </View>

        {x.newForm ? (
          <Text style={[styles.appears, { color: T.faint }]}>It appears here as “{x.newForm}”.</Text>
        ) : null}
      </View>

      {/* Gate advance — restrained, not the filled CTA (matches the calm glimpse). */}
      <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={() => onAdvance?.()} style={styles.continue}>
        <Text style={[styles.continueText, { color: T.faint }]}>Continue</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: 6, alignItems: 'flex-start' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },
  hintRow: { flexDirection: 'row', alignItems: 'center', columnGap: 8, marginTop: 28 },
  hint: { fontSize: 15 },
  appears: { fontSize: 13, marginTop: 10 },
  continue: { paddingBottom: 30, paddingTop: 8, alignItems: 'center' },
  continueText: { fontSize: 14.5, fontWeight: '600' },
});
