// CardImage — the picture prompt shared by the picturable-noun cards (word/learn-concrete,
// word/pic-review). PURE: renders from `media` + theme only (no services). Picks the dark variant
// when the theme is dark and `imageUrlDark` exists; otherwise the light `imageUrl`. When the chosen
// url is missing or the golden-slice sentinel `'placeholder'`, it draws a calm themed placeholder.
//
// 2026-06-18 VISUAL SYNC: added `full` (full-width hero image, mockup learn-concrete 180h /
// pic-review choose 168h) + `size` (square thumb, mockup pic-review speak/result 116/104). Default
// is unchanged (132 square) so existing callers are unaffected.
import React from 'react';
import { View, Text, Image, StyleSheet, type DimensionValue } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import type { ReviewItem } from '../types/reviewItem';

const PLACEHOLDER = 'placeholder'; // content sentinel: "no image seeded yet"
const DEFAULT_SIZE = 132;

// The illustration library ships as SVG. RN's <Image> cannot draw SVG on-device, so vector urls
// route through react-native-svg's <SvgUri>; raster urls keep the native <Image> path.
const isSvgUrl = (url: string): boolean => /\.svg(\?|#|$)/i.test(url);

export function CardImage({
  media,
  word,
  full = false,
  size = DEFAULT_SIZE,
  height = 180,
}: {
  media?: ReviewItem['media'];
  word?: string;
  /** Full-width hero image (learn-concrete / pic-review choose). */
  full?: boolean;
  /** Square edge when not full (pic-review thumb). */
  size?: number;
  /** Height when full. */
  height?: number;
}): React.JSX.Element {
  const T = useTheme();
  const url = T.dark && media?.imageUrlDark ? media.imageUrlDark : media?.imageUrl;
  const dims = full
    ? { width: '100%' as DimensionValue, height, alignSelf: 'stretch' as const, borderRadius: radii.image }
    : { width: size, height: size, alignSelf: 'center' as const, borderRadius: 20 };

  if (!url || url === PLACEHOLDER) {
    const letter = (word ?? '').trim().charAt(0).toUpperCase();
    return (
      <View accessibilityRole="image" accessibilityLabel="Picture placeholder" style={[styles.box, dims, { backgroundColor: T.sunken }]}>
        <Text style={[styles.letter, { color: T.faint }]}>{letter}</Text>
      </View>
    );
  }
  // Vector illustration: <SvgUri> draws the SVG; the wrapper carries the radius + clips the overscan
  // ('slice' fills the frame like Image's resizeMode="cover").
  if (isSvgUrl(url)) {
    return (
      <View accessibilityRole="image" style={[styles.box, dims, { backgroundColor: T.sunken }]}>
        <SvgUri uri={url} width={full ? '100%' : size} height={full ? height : size} preserveAspectRatio="xMidYMid slice" />
      </View>
    );
  }
  return <Image accessibilityRole="image" source={{ uri: url }} style={[styles.box, dims]} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  letter: { fontSize: 56, fontWeight: '300' },
});
