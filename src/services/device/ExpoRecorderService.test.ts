// ExpoRecorderService tests — TDD (logic project, mocks expo-audio).
// Verifies: permission request on start(); record() called; isRecording() internal flag;
// stop() resolves to uri; rejects on denied permission; rejects when uri is null.
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { ExpoRecorderService } from './ExpoRecorderService';

// --- fake AudioRecorder factory --------------------------------------------------

interface FakeRecorder {
  prepareToRecordAsync: jest.Mock;
  record: jest.Mock;
  stop: jest.Mock;
  isRecording: boolean;
  uri: string | null;
}

function makeFakeRecorder(uri: string | null = 'file:///tmp/test.m4a'): FakeRecorder {
  return {
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(() => undefined),
    stop: jest.fn(async () => undefined),
    isRecording: false,
    uri,
  };
}

// --- mock expo-audio -------------------------------------------------------------
//
// AudioRecorder is accessed as AudioModule.AudioRecorder in the implementation.
// jest.mock hoists before imports, so we cannot reference an outer variable inside the factory.
// Instead, use jest.fn() inside the factory (accessible from module scope after require()).

jest.mock('expo-audio', () => ({
  AudioModule: {
    AudioRecorder: jest.fn(() => makeFakeRecorder('file:///tmp/test.m4a')),
  },
  RecordingPresets: {
    HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 },
  },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

// Retrieve the mocked constructor via jest.requireMock — safe after jest.mock() hoists.
const MockAudioRecorder: jest.Mock = (
  jest.requireMock('expo-audio') as { AudioModule: { AudioRecorder: jest.Mock } }
).AudioModule.AudioRecorder;
const mockRequestPerm = requestRecordingPermissionsAsync as jest.Mock;
const mockSetAudioMode = setAudioModeAsync as jest.Mock;

/** Returns the FakeRecorder from the last call to `new AudioModule.AudioRecorder(...)`. */
function lastFakeRecorder(): FakeRecorder | undefined {
  const calls = MockAudioRecorder.mock.results;
  return calls.at(-1)?.value as FakeRecorder | undefined;
}

beforeEach(() => {
  MockAudioRecorder.mockClear();
  mockRequestPerm.mockClear();
  mockSetAudioMode.mockClear();
  // Default: permission granted, recorder with non-null uri
  mockRequestPerm.mockResolvedValue({ granted: true, status: 'granted' });
  MockAudioRecorder.mockImplementation(() => makeFakeRecorder('file:///tmp/test.m4a'));
});

// ---------------------------------------------------------------------------------

describe('ExpoRecorderService.start()', () => {
  it('requests mic permission', async () => {
    const svc = new ExpoRecorderService();
    await svc.start();
    expect(mockRequestPerm).toHaveBeenCalledTimes(1);
  });

  it('calls setAudioModeAsync with allowsRecording:true the first time', async () => {
    const svc = new ExpoRecorderService();
    await svc.start();
    expect(mockSetAudioMode).toHaveBeenCalledWith({ allowsRecording: true, playsInSilentMode: true });
  });

  it('only calls setAudioModeAsync once across multiple takes', async () => {
    const svc = new ExpoRecorderService();
    await svc.start();
    await svc.stop();
    await svc.start();
    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
  });

  it('creates a fresh AudioRecorder and calls prepareToRecordAsync then record()', async () => {
    const svc = new ExpoRecorderService();
    await svc.start();
    expect(MockAudioRecorder).toHaveBeenCalledTimes(1);
    expect(lastFakeRecorder()?.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(lastFakeRecorder()?.record).toHaveBeenCalledTimes(1);
  });

  it('sets isRecording() to true after start()', async () => {
    const svc = new ExpoRecorderService();
    expect(svc.isRecording()).toBe(false);
    await svc.start();
    expect(svc.isRecording()).toBe(true);
  });

  it('rejects when permission is denied', async () => {
    mockRequestPerm.mockResolvedValueOnce({ granted: false, status: 'denied' });
    const svc = new ExpoRecorderService();
    await expect(svc.start()).rejects.toThrow(/permission/i);
    expect(svc.isRecording()).toBe(false);
  });

  it('creates a NEW recorder on a second start() (one per take)', async () => {
    const svc = new ExpoRecorderService();
    await svc.start();
    await svc.stop();
    await svc.start();
    expect(MockAudioRecorder).toHaveBeenCalledTimes(2);
  });
});

describe('ExpoRecorderService.stop()', () => {
  it('calls recorder.stop(), flips isRecording() to false, resolves to the uri', async () => {
    const svc = new ExpoRecorderService();
    await svc.start();
    const fake = lastFakeRecorder();
    expect(svc.isRecording()).toBe(true);

    const uri = await svc.stop();

    expect(fake?.stop).toHaveBeenCalledTimes(1);
    expect(svc.isRecording()).toBe(false);
    expect(uri).toBe('file:///tmp/test.m4a');
  });

  it('rejects when recorder.uri is null (interrupted/empty recording)', async () => {
    MockAudioRecorder.mockImplementationOnce(() => makeFakeRecorder(null));

    const svc = new ExpoRecorderService();
    await svc.start();
    await expect(svc.stop()).rejects.toThrow(/uri/i);
    expect(svc.isRecording()).toBe(false);
  });
});
