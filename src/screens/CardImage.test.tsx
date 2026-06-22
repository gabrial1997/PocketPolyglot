// CardImage routes by asset type: vector `.svg` urls render via react-native-svg (RN's <Image>
// cannot draw SVG on-device), raster urls render via <Image>, and a missing/placeholder url draws
// the themed letter tile. It also honors dark mode by swapping in `imageUrlDark` when present.
import React from 'react';
import { Image } from 'react-native';
import { render } from '@testing-library/react-native';
import { SvgUri } from 'react-native-svg';
import { ThemeProvider } from '../theme/ThemeProvider';
import { CardImage } from './CardImage';

// Force the light/dark scheme: ThemeProvider defaults to 'system', which reads useColorScheme().
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — deep RN internal module has no bundled type declaration
import useColorScheme from 'react-native/Libraries/Utilities/useColorScheme';
jest.mock('react-native/Libraries/Utilities/useColorScheme');
const mockScheme = useColorScheme as unknown as jest.Mock;

// SvgUri fetches its uri on mount — stub fetch so the network call is inert in tests.
beforeAll(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve('<svg/>') }),
  ) as unknown as typeof fetch;
});
beforeEach(() => mockScheme.mockReturnValue('light'));

function renderImg(media: { imageUrl?: string; imageUrlDark?: string } | undefined, word?: string) {
  return render(
    <ThemeProvider>
      <CardImage media={media} word={word} />
    </ThemeProvider>,
  );
}

describe('CardImage', () => {
  it('renders a vector SvgUri (not a raster Image) for a .svg url', () => {
    const u = renderImg({ imageUrl: 'https://cdn/house.svg' });
    expect(u.UNSAFE_getByType(SvgUri).props.uri).toBe('https://cdn/house.svg');
    expect(u.UNSAFE_queryByType(Image)).toBeNull();
  });

  it('renders a raster Image (not SvgUri) for a non-svg url', () => {
    const u = renderImg({ imageUrl: 'https://cdn/cat.png' });
    expect(u.UNSAFE_getByType(Image).props.source).toEqual({ uri: 'https://cdn/cat.png' });
    expect(u.UNSAFE_queryByType(SvgUri)).toBeNull();
  });

  it('swaps to the night SVG in dark mode', () => {
    mockScheme.mockReturnValue('dark');
    const u = renderImg({ imageUrl: 'https://cdn/house.svg', imageUrlDark: 'https://cdn/house-night.svg' });
    expect(u.UNSAFE_getByType(SvgUri).props.uri).toBe('https://cdn/house-night.svg');
  });

  it('draws the themed placeholder tile when no url is seeded', () => {
    const u = renderImg(undefined, 'māja');
    expect(u.getByLabelText('Picture placeholder')).toBeTruthy();
    expect(u.UNSAFE_queryByType(SvgUri)).toBeNull();
    expect(u.UNSAFE_queryByType(Image)).toBeNull();
  });
});
