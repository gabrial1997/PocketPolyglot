// Race-gate tests for ExpoAudioService. Cards fire playback fire-and-forget (`void audio.play(url)`
// — see src/session/cardWiring.ts), so two rapid play-orb taps put two play() promises in flight at
// once. Without a guard, both clear the teardown before either assigns `this.player`, so two players
// sound on top of each other (the "multiple voices" device bug). These tests pin that exactly one
// player is ever live. Runs under the "logic" (node/ts-jest) project, so expo-audio is mocked here.
import { createAudioPlayer } from 'expo-audio';
import { ExpoAudioService } from './ExpoAudioService';

interface FakePlayer {
  uri: string;
  played: boolean;
  removed: boolean;
  shouldCorrectPitch: boolean;
  setPlaybackRate: jest.Mock;
  addListener: jest.Mock;
  play: jest.Mock;
  remove: jest.Mock;
}

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn((opts: { uri: string }) => {
    const play = jest.fn();
    const remove = jest.fn();
    const player = {
      uri: opts.uri,
      played: false,
      removed: false,
      shouldCorrectPitch: false,
      setPlaybackRate: jest.fn(),
      addListener: jest.fn(),
      play,
      remove,
    };
    // Mirror the player's lifecycle so the test can count concurrently-live players.
    play.mockImplementation(() => {
      player.played = true;
    });
    remove.mockImplementation(() => {
      player.removed = true;
    });
    return player;
  }),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

const createMock = createAudioPlayer as unknown as jest.Mock;

function createdPlayers(): FakePlayer[] {
  return createMock.mock.results.map((r) => r.value as unknown as FakePlayer);
}

// "Live" = play() was called but remove() has not — i.e. it is currently sounding.
function liveCount(): number {
  return createdPlayers().filter((p) => p.played && !p.removed).length;
}

beforeEach(() => {
  createMock.mockClear();
});

describe('ExpoAudioService', () => {
  it('never leaves two players sounding when play() is fired twice without awaiting (rapid taps)', async () => {
    const svc = new ExpoAudioService();
    // Two taps in the same tick, neither awaited — exactly the fire-and-forget call pattern.
    const p1 = svc.play('a.mp3');
    const p2 = svc.play('b.mp3');
    await Promise.all([p1, p2]);

    expect(liveCount()).toBe(1);
    expect(svc.isPlaying()).toBe(true);
  });

  it('stop() after a single play() leaves nothing playing and removes the player', async () => {
    const svc = new ExpoAudioService();
    await svc.play('a.mp3');
    expect(svc.isPlaying()).toBe(true);
    expect(liveCount()).toBe(1);

    await svc.stop();
    expect(svc.isPlaying()).toBe(false);
    expect(liveCount()).toBe(0);
    expect(createdPlayers()[0]?.removed).toBe(true);
  });
});
