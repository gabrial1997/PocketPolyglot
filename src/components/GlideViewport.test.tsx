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

  // CONTRACT: GlideViewport transitions only on a CHANGED itemKey, and treats a stable itemKey as
  // "the same card" — it does NOT swap the rendered node for a same-key children change. The host
  // must therefore pass a key that uniquely identifies which CARD is showing (id + kind), so a
  // gated phrase's locked -> unlock -> hear renders — which share one row id — each get their own
  // transition. See SessionHost (navigation/index.tsx) and StartingLoop.test.tsx.
  it('does NOT swap the node on a same-key children change (stable key = same card)', () => {
    const u = render(wrap('ph', 'First node'));
    u.rerender(wrap('ph', 'Second node')); // same key
    act(() => { jest.advanceTimersByTime(800); });
    expect(u.getByText('First node')).toBeTruthy(); // unchanged: stable key holds the first node
    expect(u.queryByText('Second node')).toBeNull();
  });
});
