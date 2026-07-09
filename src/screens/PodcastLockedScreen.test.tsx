// PodcastLockedScreen honesty tests — pure screen: renders locked copy from props only.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PodcastLockedScreen } from './PodcastLockedScreen';
import { ThemeProvider } from '../theme/ThemeProvider';

function renderLocked(props: React.ComponentProps<typeof PodcastLockedScreen>) {
  return render(
    <ThemeProvider>
      <PodcastLockedScreen {...props} />
    </ThemeProvider>,
  );
}

describe('PodcastLockedScreen', () => {
  it('states the unlock condition and the current coverage', () => {
    const { getByText } = renderLocked({ pct: 12 });
    getByText('Podcasts unlock at 25%');
    getByText(/Episodes are built from words you already know/);
    getByText(/You can follow 12% of everyday speech so far\./);
  });

  it('renders 0% honestly for a brand-new learner', () => {
    const { getByText } = renderLocked({ pct: 0 });
    getByText(/You can follow 0% of everyday speech so far\./);
  });

  it('fires onKeepLearning; hides the action when the callback is absent', () => {
    const go = jest.fn();
    const { getByLabelText } = renderLocked({ pct: 5, onKeepLearning: go });
    fireEvent.press(getByLabelText('Keep learning'));
    expect(go).toHaveBeenCalledTimes(1);
    const { queryByLabelText } = renderLocked({ pct: 5 });
    expect(queryByLabelText('Keep learning')).toBeNull();
  });
});
