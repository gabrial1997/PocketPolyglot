// DEV-ONLY card preview gallery. Renders each Tier-A card with fixture data so the screens can be
// visually QA'd (chrome-devtools MCP) WITHOUT auth or seeded content. Reached only on web via
// `?preview` (see navigation/index.tsx) — never bundled into the iOS/Android user path. Cards stay
// pure: all callbacks are no-ops here. Not a shipping screen; safe to delete.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { LiveWaveform } from '../components';
import type { ReviewItem } from '../types/reviewItem';

// A representative amplitude envelope (a short speech-like pattern repeated) so the demo soundbar
// keeps visibly moving for a screenshot. Real clips carry their own envelope on item.audio.envelope.
const DEMO_ENV: number[] = Array.from({ length: 600 }, (_, i) => {
  const base = [0.2, 0.6, 1, 0.85, 0.4, 0.3, 0.35, 0.32, 0.2, 0.08, 0.05, 0.15, 0.5, 0.8, 0.7, 0.45];
  return base[i % base.length] ?? 0.2;
});
import {
  WordLearnConcrete,
  WordLearnAbstract,
  WordLearnFunction,
  WordHear,
  WordPicReview,
  WordSay,
  DrillScreen,
  PhraseHear,
  PhraseMeaning,
  PhraseSayIt,
  PhraseUnlock,
  PhraseLocked,
  PronounceScreen,
} from '../screens';

const noop = (): void => {};
// Superset of every card callback — each card destructures only what it needs.
const handlers = {
  onPlay: noop,
  onComplete: noop,
  onAnswer: noop,
  onRecordStart: noop,
  onRecordStop: noop,
  onPlayCompare: noop,
  onUnlocked: noop,
};

const wordConcrete: ReviewItem = {
  id: 'maja', type: 'word', stage: 'new', reps: 0,
  target: 'māja', gloss: 'house', pron: 'MAAH-ya', wordClass: 'concrete',
  audio: { nativeUrl: '', slowUrl: '' },
  media: { imageUrl: 'house.png' },
  choices: [
    { value: 'māja', gloss: 'house', correct: true },
    { value: 'maize', gloss: 'bread', correct: false },
    { value: 'māsa', gloss: 'sister', correct: false },
    { value: 'mēs', gloss: 'we', correct: false },
  ],
  receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
};
const wordAbstract: ReviewItem = {
  id: 'brivs', type: 'word', stage: 'learning', reps: 1,
  target: 'brīvs', gloss: 'free', pron: 'BREEVS', wordClass: 'abstract',
  audio: { nativeUrl: '' },
  mnemonic: { soundsLike: '"breeze"', note: 'a breeze feels free' },
  choices: [
    { value: 'brīvs', gloss: 'free', correct: true },
    { value: 'brālis', gloss: 'brother', correct: false },
  ],
  receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
};
const wordFunction: ReviewItem = {
  id: 'uz', type: 'word', stage: 'learning', reps: 1,
  target: 'uz', gloss: 'on / to', wordClass: 'function',
  audio: { nativeUrl: '' },
  examples: [
    { pre: 'Grāmata ir ', w: 'uz', post: ' galda.', en: 'The book is on the table.', audioUrl: '' },
    { pre: 'Es eju ', w: 'uz', post: ' veikalu.', en: 'I go to the shop.', audioUrl: '' },
  ],
  choices: [
    { value: 'uz', gloss: 'on / to', correct: true },
    { value: 'no', gloss: 'from', correct: false },
  ],
  receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
};
const pairItem: ReviewItem = {
  id: 'sit-sit', type: 'pair', stage: 'review', reps: 2,
  target: 'sit', gloss: 'this', audio: { nativeUrl: '' },
  pair: { a: 'sit', b: 'sīt', correct: 'a', audioUrl: '' },
  receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
};
const phraseItem: ReviewItem = {
  id: 'es-dzeru-kafiju', type: 'phrase', stage: 'new', reps: 0,
  target: 'Es dzeru kafiju.', gloss: 'I drink coffee.', audio: { nativeUrl: '' },
  choices: [
    { value: 'I drink coffee.', correct: true },
    { value: 'I make coffee.', correct: false },
    { value: 'I like coffee.', correct: false },
  ],
  receptiveReps: 0, productiveReps: 0, translationVisibility: 'auto',
};

function Phone({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const T = useTheme();
  return (
    <View style={styles.cell}>
      <Text style={[styles.label, { color: T.sub }]}>{label}</Text>
      <View style={[styles.phone, { borderColor: T.hair }]}>{children}</View>
    </View>
  );
}

export function CardPreviewGallery(): React.JSX.Element {
  const T = useTheme();
  return (
    <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={styles.scroll}>
      <Text style={[styles.h, { color: T.ink, fontFamily: fonts.headline }]}>Card preview (dev)</Text>
      <View style={styles.cell}>
        <Text style={[styles.label, { color: T.sub }]}>Live soundbar (playing demo envelope)</Text>
        <View style={[styles.soundbar, { borderColor: T.hair }]}>
          <LiveWaveform envelope={DEMO_ENV} playing count={40} height={56} />
        </View>
      </View>
      <Phone label="Word · learn (concrete)"><WordLearnConcrete item={wordConcrete} {...handlers} /></Phone>
      <Phone label="Word · learn (abstract)"><WordLearnAbstract item={wordAbstract} {...handlers} /></Phone>
      <Phone label="Word · learn (function)"><WordLearnFunction item={wordFunction} {...handlers} /></Phone>
      <Phone label="Word · hear → pick"><WordHear item={wordConcrete} {...handlers} /></Phone>
      <Phone label="Word · pic-review (choose)"><WordPicReview item={wordConcrete} {...handlers} /></Phone>
      <Phone label="Word · say (gloss cue)"><WordSay item={wordConcrete} {...handlers} /></Phone>
      <Phone label="Drill · minimal pair"><DrillScreen item={pairItem} {...handlers} /></Phone>
      <Phone label="Phrase · hear first"><PhraseHear item={phraseItem} {...handlers} /></Phone>
      <Phone label="Phrase · meaning"><PhraseMeaning item={phraseItem} {...handlers} /></Phone>
      <Phone label="Phrase · say it"><PhraseSayIt item={phraseItem} {...handlers} /></Phone>
      <Phone label="Phrase · unlock"><PhraseUnlock item={phraseItem} {...handlers} /></Phone>
      <Phone label="Phrase · locked"><PhraseLocked item={phraseItem} {...handlers} /></Phone>
      <Phone label="Pronounce"><PronounceScreen item={wordConcrete} {...handlers} /></Phone>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingVertical: 24, rowGap: 28 },
  h: { fontSize: 24, marginBottom: 8 },
  cell: { rowGap: 8, alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  phone: { width: 390, height: 800, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  soundbar: { width: 360, paddingHorizontal: 24, paddingVertical: 20, borderWidth: 1, borderRadius: 12 },
});
