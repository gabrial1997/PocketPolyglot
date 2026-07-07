// LiteralNote is PURE (theme + props only). Render it under ThemeProvider with fixture props and
// assert it shows the literal/usage text when authored, and renders nothing when there is no literal.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { LiteralNote, CompareRow } from './cardChrome';
import { LiveWaveform } from './LiveWaveform';

jest.useFakeTimers();

function renderNote(props: { literal?: string; usageNote?: string }) {
  return render(
    <ThemeProvider>
      <LiteralNote {...props} />
    </ThemeProvider>,
  );
}

describe('LiteralNote', () => {
  it('shows the literal reading and the usage note when both are present', () => {
    const u = renderNote({ literal: 'like / as', usageNote: 'used as "how"' });
    expect(u.getByText(/like \/ as/)).toBeTruthy();
    expect(u.getByText('used as "how"')).toBeTruthy();
  });

  it('shows the literal reading alone when there is no usage note', () => {
    const u = renderNote({ literal: 'I ask / beg' });
    expect(u.getByText(/I ask \/ beg/)).toBeTruthy();
  });

  it('renders nothing when there is no literal reading', () => {
    const u = renderNote({ usageNote: 'orphan note' });
    expect(u.toJSON()).toBeNull();
  });
});

// CompareRow rows share ONE audio channel: starting one row's playback must settle the sibling
// immediately. Regression for the overlap bug — tapping "You" while "Native" was still lit left
// BOTH rows' gates open, and the stale Native row animated against the You clip's positionMs.
describe('CompareRow (single audio channel)', () => {
  function renderRows() {
    const onNative = jest.fn();
    const onYou = jest.fn();
    const env = new Array(10).fill(0.5); // 10 * 30ms + 200ms tail = 500ms gate
    const u = render(
      <ThemeProvider>
        <CompareRow label="Native" icon="speaker" envelope={env} onPress={onNative} />
        <CompareRow label="You" icon="mic" onPress={onYou} />
      </ThemeProvider>,
    );
    // Rendered in order: [0] = Native's soundbar, [1] = You's.
    const waves = () => u.UNSAFE_getAllByType(LiveWaveform);
    return { u, waves, onNative, onYou };
  }

  it('tapping "You" while "Native" is still playing settles the Native row at once', () => {
    const { u, waves, onNative, onYou } = renderRows();
    fireEvent.press(u.getByText('Native'));
    expect(onNative).toHaveBeenCalledTimes(1);
    expect(waves()[0]!.props.playing).toBe(true);

    fireEvent.press(u.getByText('You')); // overlap: Native's 500ms gate is still open
    expect(onYou).toHaveBeenCalledTimes(1);
    expect(waves()[1]!.props.playing).toBe(true); // the new clip owns the channel
    expect(waves()[0]!.props.playing).toBe(false); // the sibling settled — no double-lit bars
  });

  it('a replay of the SAME row keeps its own bar lit (self-claim does not self-cancel)', () => {
    const { u, waves } = renderRows();
    fireEvent.press(u.getByText('Native'));
    fireEvent.press(u.getByText('Native')); // tap-to-replay
    expect(waves()[0]!.props.playing).toBe(true);
    expect(waves()[1]!.props.playing).toBe(false);
  });
});
