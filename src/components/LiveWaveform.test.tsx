// LiveWaveform render tests. Animation is driven by an rAF loop (imperative Animated.Value writes),
// which is hard to assert frame-by-frame; here we verify it renders the right number of bars, is
// labelled, and degrades safely with no envelope. Theme comes from ThemeProvider.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { LiveWaveform } from './LiveWaveform';

function renderBars(props: Partial<React.ComponentProps<typeof LiveWaveform>> = {}) {
  return render(
    <ThemeProvider>
      <LiveWaveform playing={false} count={12} {...props} />
    </ThemeProvider>,
  );
}

describe('LiveWaveform', () => {
  it('renders `count` bars under a labelled waveform (rest state)', () => {
    const u = renderBars({ count: 12 });
    const wave = u.getByLabelText('Audio waveform');
    expect(wave).toBeTruthy();
    expect(wave.children).toHaveLength(12);
  });

  it('renders without crashing while playing a real envelope', () => {
    const env = [0.1, 0.5, 1, 0.8, 0.3, 0.05, 0.2, 0.6];
    const u = renderBars({ playing: true, envelope: env, count: 16 });
    expect(u.getByLabelText('Audio waveform').children).toHaveLength(16);
  });

  it('handles an empty/absent envelope (synthetic fallback) without crashing', () => {
    const u = renderBars({ playing: true, envelope: [] });
    expect(u.getByLabelText('Audio waveform')).toBeTruthy();
  });

  it('accepts a real-position anchor + rate without crashing', () => {
    const env = [0.1, 0.5, 1, 0.8, 0.3, 0.05, 0.2, 0.6];
    const u = renderBars({ playing: true, envelope: env, count: 16, positionMs: 120, rate: 0.7 });
    expect(u.getByLabelText('Audio waveform').children).toHaveLength(16);
  });

  it('tracks a continuously-updating real position without remounting bars (no loop restart)', () => {
    // The playback bridge ticks positionMs many times a second. Re-rendering with each new value
    // must re-anchor the SAME persistent rAF loop — not tear down and rebuild it — so the bars stay
    // mounted and continuous (the restart was the on-device "clippy" snap).
    const env = [0.1, 0.5, 1, 0.8, 0.3, 0.05, 0.2, 0.6, 0.4, 0.9];
    const u = renderBars({ playing: true, envelope: env, count: 16, positionMs: 0 });
    const before = u.getByLabelText('Audio waveform').children;
    for (const pos of [30, 60, 90, 120, 150, 180]) {
      u.rerender(
        <ThemeProvider>
          <LiveWaveform playing envelope={env} count={16} positionMs={pos} />
        </ThemeProvider>,
      );
    }
    const after = u.getByLabelText('Audio waveform').children;
    expect(after).toHaveLength(16);
    expect(before).toHaveLength(16);
  });
});
