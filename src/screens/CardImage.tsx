// CardImage — the picture prompt shared by the picturable-noun cards (word/learn-concrete,
// word/pic-review). PURE: renders from `media` + theme only (no services). Picks the dark variant
// when the theme is dark and `imageUrlDark` exists; otherwise the light `imageUrl`. When the chosen
// url is missing or the golden-slice sentinel `'placeholder'`, it draws a calm themed placeholder
// (a sunken rounded block with the word's first letter in a faint token) instead of an <Image>.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import type { ReviewItem } from '../types/reviewItem';

const PLACEHOLDER = 'placeholder'; // content sentinel: "no image seeded yet"
const SIZE = 132; // image / placeholder block edge

export function CardImage({
  media,
  word,
}: {
  media?: ReviewItem['media'];
  word?: string;
}): React.JSX.Element {
  const T = useTheme();
  const url = T.dark && media?.imageUrlDark ? media.imageUrlDark : media?.imageUrl;

  if (!url || url === PLACEHOLDER) {
    const letter = (word ?? '').trim().charAt(0).toUpperCase();
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="Picture placeholder"
        style={[styles.box, { backgroundColor: T.sunken }]}
      >
        <Text style={[styles.letter, { color: T.faint }]}>{letter}</Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityRole="image"
      source={{ uri: url }}
      style={styles.box}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    borderRadius: radii.image,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: { fontSize: 56, fontWeight: '300' },
});
