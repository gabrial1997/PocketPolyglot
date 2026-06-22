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

// Pull the playbackStatusUpdate callback the service registered on the most recent player.
function lastStatusCb(): (status: Record<string, unknown>) => void {
  const player = createdPlayers().at(-1) as unknown as { addListener: jest.Mock };
  const call = player.addListener.mock.calls.find((c) => c[0] === 'playbackStatusUpdate');
  return call?.[1] as (status: Record<string, unknown>) => void;
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

describe('ExpoAudioService.preload', () => {
  it('preload warms a player so play(sameUrl) does not create a second one', async () => {
    const svc = new ExpoAudioService();
    svc.preload('a.mp3');
    expect(createdPlayers()).toHaveLength(1); // warmed
    await svc.play('a.mp3');
    expect(createdPlayers()).toHaveLength(1); // reused, not recreated
    expect(svc.isPlaying()).toBe(true);
  });

  it('play(differentUrl) after preload creates a fresh player', async () => {
    const svc = new ExpoAudioService();
    svc.preload('a.mp3');
    await svc.play('b.mp3');
    expect(createdPlayers().length).toBeGreaterThanOrEqual(2);
  });
});

describe('ExpoAudioService.subscribe', () => {
  it('emits playing + ms-converted position/duration from expo-audio status (seconds → ms)', async () => {
    const svc = new ExpoAudioService();
    const seen: Array<{ playing: boolean; positionMs: number; durationMs: number }> = [];
    svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');

    lastStatusCb()({ playing: true, didJustFinish: false, currentTime: 0.5, duration: 2 });
    expect(seen.at(-1)).toEqual({ playing: true, positionMs: 500, durationMs: 2000 });
  });

  it('emits playing:false on didJustFinish', async () => {
    const svc = new ExpoAudioService();
    const seen: Array<{ playing: boolean }> = [];
    svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');

    lastStatusCb()({ playing: false, didJustFinish: true, currentTime: 2, duration: 2 });
    expect(seen.at(-1)?.playing).toBe(false);
  });

  it('emits playing:false when stop() is called', async () => {
    const svc = new ExpoAudioService();
    const seen: Array<{ playing: boolean }> = [];
    svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');
    await svc.stop();
    expect(seen.at(-1)?.playing).toBe(false);
  });

  it('does not emit for a superseded player (gen guard)', async () => {
    const svc = new ExpoAudioService();
    const seen: unknown[] = [];
    svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');
    const stale = lastStatusCb(); // first player's callback
    await svc.play('b.mp3'); // supersedes; bumps gen
    seen.length = 0;
    stale({ playing: true, didJustFinish: false, currentTime: 1, duration: 2 });
    expect(seen).toHaveLength(0); // stale player must not leak status
  });

  it('unsubscribe stops delivery', async () => {
    const svc = new ExpoAudioService();
    const seen: unknown[] = [];
    const off = svc.subscribe((s) => seen.push(s));
    await svc.play('a.mp3');
    off();
    lastStatusCb()({ playing: true, didJustFinish: false, currentTime: 0.1, duration: 2 });
    expect(seen).toHaveLength(0);
  });
});
