import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices, StubAudioService } from '../services/stubs';
import { PlaybackProvider } from './PlaybackProvider';
import { usePlaybackStatus } from '../components/PlaybackContext';

function Probe(): React.JSX.Element {
  const s = usePlaybackStatus();
  return <Text>{`${s.playing}:${s.positionMs}:${s.durationMs}`}</Text>;
}

it('feeds AudioService status into the playback context', () => {
  const audio = new StubAudioService();
  const services = { ...createStubServices(), audio };
  const u = render(
    <ServiceProvider services={services}>
      <PlaybackProvider>
        <Probe />
      </PlaybackProvider>
    </ServiceProvider>,
  );
  expect(u.getByText('false:0:0')).toBeTruthy();
  act(() => audio.emitStatus({ playing: true, positionMs: 750, durationMs: 1800 }));
  expect(u.getByText('true:750:1800')).toBeTruthy();
});
