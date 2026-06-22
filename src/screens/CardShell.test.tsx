// Behavior tests for CardShell's translationVisibility gloss-reveal gating (Module C5).
// CardShell is PURE: data-in/events-out, no services.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { CardShell } from './CardShell';

function renderShell(props: {
  gloss?: string;
  translationVisibility?: 'auto' | 'hint' | 'on-demand';
  missed?: boolean;
}) {
  return render(
    <ThemeProvider>
      <CardShell
        eyebrow="TEST"
        target="māja"
        gloss={props.gloss ?? 'house'}
        translationVisibility={props.translationVisibility}
        missed={props.missed}
      />
    </ThemeProvider>,
  );
}

describe('CardShell — translationVisibility gating', () => {
  it('auto mode (default): gloss is shown immediately', () => {
    const u = renderShell({ translationVisibility: 'auto' });
    expect(u.getByText('house')).toBeTruthy();
    expect(u.queryByText('Show meaning')).toBeNull();
  });

  it('no translationVisibility prop: gloss shown (backward-compatible)', () => {
    const u = renderShell({});
    expect(u.getByText('house')).toBeTruthy();
    expect(u.queryByText('Show meaning')).toBeNull();
  });

  it('hint mode with missed=false: gloss is hidden, Show meaning not shown (no standalone affordance on shell)', () => {
    const u = renderShell({ translationVisibility: 'hint', missed: false });
    expect(u.queryByText('house')).toBeNull();
  });

  it('hint mode with missed=true: gloss is shown', () => {
    const u = renderShell({ translationVisibility: 'hint', missed: true });
    expect(u.getByText('house')).toBeTruthy();
  });

  it('on-demand mode: gloss is hidden initially, Show meaning affordance shown', () => {
    const u = renderShell({ translationVisibility: 'on-demand' });
    expect(u.queryByText('house')).toBeNull();
    expect(u.getByText('Show meaning')).toBeTruthy();
  });

  it('on-demand mode: tapping Show meaning reveals the gloss', () => {
    const u = renderShell({ translationVisibility: 'on-demand' });
    fireEvent.press(u.getByText('Show meaning'));
    expect(u.getByText('house')).toBeTruthy();
    expect(u.queryByText('Show meaning')).toBeNull();
  });

  it('on-demand mode: gloss is not shown when gloss prop is absent (nothing to reveal)', () => {
    const u = render(
      <ThemeProvider>
        <CardShell eyebrow="TEST" target="māja" translationVisibility="on-demand" />
      </ThemeProvider>,
    );
    // No gloss to reveal → no Show meaning affordance and no gloss text
    expect(u.queryByText('Show meaning')).toBeNull();
    expect(u.queryByText('house')).toBeNull();
  });
});
