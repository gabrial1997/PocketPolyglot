import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { GlideViewport } from './GlideViewport';

jest.useFakeTimers();

// GlideViewport reads the theme for its layer background, so it renders under ThemeProvider
// (like every card test). `key` forces a fresh provider tree per render-call where needed.
function wrap(itemKey: string, label: string) {
  return (
    <ThemeProvider>
      <GlideViewport itemKey={itemKey}><Text>{label}</Text></GlideViewport>
    </ThemeProvider>
  );
}

describe('GlideViewport', () => {
  it('renders the current child', () => {
    const u = render(wrap('a', 'Card A'));
    expect(u.getByText('Card A')).toBeTruthy();
  });

  it('shows both old and new child during a transition, then settles on the new one', () => {
    const u = render(wrap('a', 'Card A'));
    u.rerender(wrap('b', 'Card B'));
    // mid-transition: both layers mounted
    expect(u.getByText('Card B')).toBeTruthy();
    expect(u.queryByText('Card A')).toBeTruthy();
    // after the animation + commit window, only the new card remains
    act(() => { jest.advanceTimersByTime(800); });
    expect(u.getByText('Card B')).toBeTruthy();
    expect(u.queryByText('Card A')).toBeNull();
  });
});
