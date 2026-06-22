// A4d — the concrete LEARN card must render audio-LESS (no envelope): keep image/word/gloss/
// Continue, hide the play orb + waveform + SpeedChip, and never crash on a missing item.audio.
// (Module B can introduce a word visually before audio backfills.)
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WordLearnConcrete } from './WordLearnConcrete';
import type { ReviewItem } from '../types/reviewItem';
import type { BaseCardProps } from './cardProps';

function item(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'maja', type: 'word', stage: 'new', reps: 0,
    target: 'māja', gloss: 'house', wordClass: 'concrete',
    media: { imageUrl: 'house.png' },
    ...overrides,
  };
}
function renderCard(overrides: Partial<ReviewItem> = {}) {
  const props: BaseCardProps = { item: item(overrides), onPlay: jest.fn(), onComplete: jest.fn() };
  return render(<ThemeProvider><WordLearnConcrete {...props} /></ThemeProvider>);
}

test('renders an audio-less concrete word without the play orb and without crashing', () => {
  const { queryByLabelText, getByText } = renderCard(); // no audio on the item
  expect(getByText('māja')).toBeTruthy();
  expect(getByText('house')).toBeTruthy();
  expect(getByText('Continue')).toBeTruthy();
  expect(queryByLabelText('Play')).toBeNull(); // play orb hidden
});

test('renders the play orb when audio is present', () => {
  const { queryByLabelText } = renderCard({ audio: { nativeUrl: 'n.mp3', envelope: [0.5, 1] } });
  expect(queryByLabelText('Play')).toBeTruthy();
});
