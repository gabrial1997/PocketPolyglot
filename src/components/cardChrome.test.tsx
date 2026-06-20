// LiteralNote is PURE (theme + props only). Render it under ThemeProvider with fixture props and
// assert it shows the literal/usage text when authored, and renders nothing when there is no literal.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { LiteralNote } from './cardChrome';

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
