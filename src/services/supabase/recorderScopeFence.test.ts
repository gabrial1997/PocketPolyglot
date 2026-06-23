// E4: SCOPE-FENCE TEST — static-analysis + behavioral guard.
//
// Asserts that the entire Module-E source set never:
//   1. Writes `score` or `score_payload` as an inserted/updated DB column.
//   2. References ML/inference APIs (Whisper, GOP scorer, transcribe functions).
//
// False-positive avoidance strategy:
//   - Score column danger signature: look for `score:` / `'score'` / `"score"` as an OBJECT KEY
//     in an insert/upsert payload, or the literal column name `score_payload`. These are the
//     actual dangerous patterns — bare word "score" in prose or a comment is harmless.
//   - ML danger signatures: `import ... whisper` / `require ... whisper` (an actual import of a
//     Whisper library), `gop(` / `.gop(` / `GOP(` (an actual function call, not a comment word),
//     `transcribe(` (an actual function call). These patterns do not match a comment that says
//     "GOP scoring lands with Phase-1" because those comments never follow a call-expression syntax.
//
// How the patterns work:
//   - `score_payload` — always a violation; only appears as a column name.
//   - `/score\s*:/` — matches `score:` as an object-key assignment (e.g. `{ score: x }`).
//     A comment saying "no score write" does NOT contain `score:` with a colon.
//   - `/'score'/` and `/"score"/` — matches `'score'` or `"score"` as a quoted key in dynamic
//     access or array (e.g. `insert({ 'score': x })`). Safe: comments never quote the word this way.
//   - `/whisper/i` restricted to import/require lines only — `importsWhisper` regex.
//   - `/gop\s*\(/i` — `gop(` as a function call. A comment "GOP scoring" has no `(`.
//   - `/transcribe\s*\(/i` — `transcribe(` as a call. A comment "no transcribe" has no `(`.
//
// The test PASSES against the current E1–E3 implementation and FAILS the moment any of those
// patterns appears in real code (not in a comment).

import * as fs from 'fs';
import * as path from 'path';

import { SupabaseRecordingUploader } from './SupabaseRecordingUploader';

// ---------------------------------------------------------------------------
// Module-E source set
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '../../..');

const MODULE_E_FILES = [
  'src/services/device/ExpoRecorderService.ts',
  'src/services/supabase/SupabaseRecordingUploader.ts',
  'src/services/supabase/SupabaseSrsService.ts',
  'src/screens/WordSay.tsx',
  'src/screens/PhraseSayIt.tsx',
  'src/screens/PronounceScreen.tsx',
  'src/session/cardWiring.ts',
  'src/screens/cardProps.ts',
].map(f => path.join(ROOT, f));

// ---------------------------------------------------------------------------
// Danger signatures (patterns that indicate a real scope violation)
// ---------------------------------------------------------------------------

/** `score_payload` as a string literal — always a column-name violation. */
const SCORE_PAYLOAD = /score_payload/;

/** `score:` as an object key (insert/update payload). Excludes bare word in comments. */
const SCORE_COLON = /score\s*:/;

/** `'score'` or `"score"` as a quoted string (dynamic column key). */
const SCORE_QUOTED = /'score'|"score"/;

/**
 * Whisper import — an actual `import` or `require` that pulls in a Whisper library.
 * Avoids false-positives on comments that mention Whisper as a future scope item.
 */
const WHISPER_IMPORT = /(?:import|require)\s*\([^)]*whisper|(?:from|require)\s+['"][^'"]*whisper/i;

/**
 * GOP called as a function: `gop(` / `.gop(` / `GOP(`.
 * A comment "GOP scoring" never contains `gop(`.
 */
const GOP_CALL = /\bgop\s*\(/i;

/**
 * transcribe called as a function: `transcribe(`.
 * A comment "no transcribe" never contains `transcribe(`.
 */
const TRANSCRIBE_CALL = /\btranscribe\s*\(/i;

// ---------------------------------------------------------------------------
// Static-analysis assertions
// ---------------------------------------------------------------------------

describe('Module-E scope fence — static analysis', () => {
  for (const filePath of MODULE_E_FILES) {
    const rel = path.relative(ROOT, filePath);

    // All checks run on the comment-stripped source so that honest Phase-0 scope-marker
    // comments (e.g. "// NEVER set score or score_payload") never trigger a false positive.
    // Stripping line-comments (`// …`) is safe here because the danger signatures are all
    // code constructs (object keys, function calls, import statements) that never appear
    // inside a valid line comment in TypeScript.

    it(`${rel}: no score_payload column`, () => {
      const src = stripLineComments(fs.readFileSync(filePath, 'utf8'));
      expect(src).not.toMatch(SCORE_PAYLOAD);
    });

    it(`${rel}: no score: as an object key`, () => {
      const src = stripLineComments(fs.readFileSync(filePath, 'utf8'));
      expect(src).not.toMatch(SCORE_COLON);
    });

    it(`${rel}: no 'score' or "score" as a quoted key`, () => {
      const src = stripLineComments(fs.readFileSync(filePath, 'utf8'));
      expect(src).not.toMatch(SCORE_QUOTED);
    });

    it(`${rel}: no Whisper import/require`, () => {
      const src = stripLineComments(fs.readFileSync(filePath, 'utf8'));
      expect(src).not.toMatch(WHISPER_IMPORT);
    });

    it(`${rel}: no GOP function call`, () => {
      const src = stripLineComments(fs.readFileSync(filePath, 'utf8'));
      expect(src).not.toMatch(GOP_CALL);
    });

    it(`${rel}: no transcribe() function call`, () => {
      const src = stripLineComments(fs.readFileSync(filePath, 'utf8'));
      expect(src).not.toMatch(TRANSCRIBE_CALL);
    });
  }
});

// ---------------------------------------------------------------------------
// Behavioral: drive SupabaseRecordingUploader.upload() with a fake client
// ---------------------------------------------------------------------------

/** Strip `// …` line comments from source to avoid false-positives on inline comments. */
function stripLineComments(src: string): string {
  // Replace `// …` from first `//` to end of line.
  return src.replace(/\/\/[^\n]*/g, '');
}

// Allowed set of keys that may appear in the recordings row.
const ALLOWED_KEYS = new Set(['id', 'user_id', 'storage_path', 'duration_ms', 'consent_at']);

const FAKE_BLOB = new Blob(['audio-data'], { type: 'audio/m4a' });

function makeFakeClient() {
  let insertedRow: Record<string, unknown> | null = null;
  let insertCallCount = 0;
  let storageUploadCount = 0;

  const client = {
    storage: {
      from: (_bucket: string) => ({
        upload: async (_path: string, _blob: Blob, _opts: Record<string, unknown>) => {
          storageUploadCount += 1;
          return { data: { path: _path }, error: null };
        },
        remove: async (_paths: string[]) => ({ data: null, error: null }),
      }),
    },
    from: (table: string) => {
      if (table === 'recordings') {
        return {
          insert: async (row: Record<string, unknown>) => {
            insertCallCount += 1;
            insertedRow = row;
            return { error: null };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  };

  const getCounts = () => ({ insertCallCount, storageUploadCount, insertedRow });
  return { client, getCounts };
}

function mockFetch(blob: Blob = FAKE_BLOB): void {
  global.fetch = jest.fn().mockResolvedValue({
    blob: jest.fn().mockResolvedValue(blob),
  }) as unknown as typeof fetch;
}

describe('SupabaseRecordingUploader behavioral scope fence', () => {
  const USER_ID = 'user-scope-fence';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inserted row keys ⊆ { id, user_id, storage_path, duration_ms, consent_at } — no score, no score_payload', async () => {
    mockFetch();
    const { client, getCounts } = makeFakeClient();
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );

    const result = await uploader.upload('file:///recording.m4a', { durationMs: 500 });
    expect(result).not.toBeNull();

    const { insertedRow } = getCounts();
    expect(insertedRow).not.toBeNull();

    // All keys must be in the allowed set.
    const keys = Object.keys(insertedRow!);
    for (const key of keys) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }

    // Explicit checks: score and score_payload must NOT be present.
    expect('score' in insertedRow!).toBe(false);
    expect('score_payload' in insertedRow!).toBe(false);
  });

  it('consent=false → zero insert calls, zero storage uploads, returns null', async () => {
    mockFetch();
    const { client, getCounts } = makeFakeClient();
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => false,
    );

    const result = await uploader.upload('file:///recording.m4a');
    expect(result).toBeNull();

    const { insertCallCount, storageUploadCount } = getCounts();
    expect(insertCallCount).toBe(0);
    expect(storageUploadCount).toBe(0);
  });
});
