import AsyncStorage from '@react-native-async-storage/async-storage';
import { devNow, getOffsetDays, loadClockOffset, skipDay, clearClockOffset } from './devClock';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('devClock', () => {
  beforeEach(async () => {
    await clearClockOffset();
    (AsyncStorage.setItem as jest.Mock).mockClear();
  });

  it('starts at offset 0 and real time', () => {
    expect(getOffsetDays()).toBe(0);
    expect(Math.abs(devNow().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('skipDay advances the clock by 24h and persists', async () => {
    await skipDay();
    expect(getOffsetDays()).toBe(1);
    const drift = devNow().getTime() - Date.now();
    expect(Math.abs(drift - 86_400_000)).toBeLessThan(1000);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('pp.dev.clockOffsetDays', '1');
  });

  it('loadClockOffset restores a persisted offset', async () => {
    await AsyncStorage.setItem('pp.dev.clockOffsetDays', '3');
    await loadClockOffset();
    expect(getOffsetDays()).toBe(3);
  });

  it('clearClockOffset returns to real time', async () => {
    await skipDay();
    await clearClockOffset();
    expect(getOffsetDays()).toBe(0);
  });
});
