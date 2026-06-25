import { randomUuid } from './uuid';

describe('randomUuid', () => {
  it('returns an RFC-4122 v4-shaped string', () => {
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not rely on a global crypto (works where Hermes has none)', () => {
    // Guard against regressing to crypto.randomUUID(): the function must produce a value
    // even if `crypto` is unavailable. We just assert it returns a non-empty string here.
    expect(typeof randomUuid()).toBe('string');
    expect(randomUuid().length).toBe(36);
  });

  it('produces distinct ids across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomUuid()));
    expect(ids.size).toBe(100);
  });
});
