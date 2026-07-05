// devTools.ts wraps the dev-only "reset progress" action: RPC the server-side wipe, then reset
// the local dev clock back to real time. Both steps must happen in that order, and the clock must
// NOT be reset if the RPC fails (the account still has whatever progress it had — presenting "back
// to day 0" would be a lie).
import type { SupabaseClient } from '@supabase/supabase-js';
import { resetProgress } from './devTools';
import { clearClockOffset } from './devClock';

jest.mock('./devClock', () => ({
  clearClockOffset: jest.fn(),
}));

function fakeClient(rpcResult: { error: unknown }): SupabaseClient {
  return {
    rpc: jest.fn().mockResolvedValue(rpcResult),
  } as unknown as SupabaseClient;
}

describe('devTools.resetProgress', () => {
  beforeEach(() => {
    (clearClockOffset as jest.Mock).mockClear();
  });

  it('calls client.rpc("reset_my_progress")', async () => {
    const client = fakeClient({ error: null });
    await resetProgress(client);
    expect(client.rpc).toHaveBeenCalledWith('reset_my_progress');
  });

  it('calls clearClockOffset() AFTER a successful RPC', async () => {
    const calls: string[] = [];
    const client = {
      rpc: jest.fn().mockImplementation(async () => {
        calls.push('rpc');
        return { error: null };
      }),
    } as unknown as SupabaseClient;
    (clearClockOffset as jest.Mock).mockImplementation(async () => {
      calls.push('clearClockOffset');
    });

    await resetProgress(client);

    expect(calls).toEqual(['rpc', 'clearClockOffset']);
  });

  it('throws on RPC failure and does NOT call clearClockOffset', async () => {
    const rpcError = new Error('rpc failed');
    const client = fakeClient({ error: rpcError });

    await expect(resetProgress(client)).rejects.toThrow('rpc failed');
    expect(clearClockOffset).not.toHaveBeenCalled();
  });
});
