// One-off audition: find a "calm, warm, in-the-middle" Latvian voice.
// onyx read flat/boring; nova read too enthusiastic. Render the two lines across a few
// middle-ground voices with delivery steering, into out/middle/<voice>-<slug>.mp3.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out', 'middle');
const MODEL = 'gpt-4o-mini-tts';

// Minimal .env loader (same as tts.mjs).
for (const p of [path.join(HERE, '..', '.env'), path.join(HERE, '..', '..', '.env')]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const INSTRUCTIONS =
  'You are a calm, warm native Latvian speaker recording for a beginner learner. ' +
  'Tone: gentle, friendly and reassuring — relaxed, never flat or monotone, and never bubbly, ' +
  'bright or overly enthusiastic. Speak slowly and clearly so every sound is easy to follow, ' +
  'but keep the natural rising-and-falling intonation and stress of real spoken Latvian, with ' +
  'correct long vowels (ā, ē, ī, ū) and soft consonants (ļ, ņ, ķ, ģ). Latvian only.';

// Middle-ground candidates: warmer/more human males + the calmer voices.
const VOICES = ['ash', 'verse', 'echo', 'ballad', 'sage'];
const LINES = [
  ['dzeru', 'Dzeru.'],
  ['es-dzeru-kafiju', 'Es dzeru kafiju.'],
];

const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('OPENAI_API_KEY not set (../.env or ../../.env).');
const client = new OpenAI({ apiKey: key });
fs.mkdirSync(OUT, { recursive: true });

for (const voice of VOICES) {
  for (const [slug, text] of LINES) {
    const res = await client.audio.speech.create({
      model: MODEL,
      voice,
      input: text,
      instructions: INSTRUCTIONS,
      response_format: 'mp3',
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const file = path.join(OUT, `${voice}-${slug}.mp3`);
    fs.writeFileSync(file, buf);
    console.log(`✓ ${voice.padEnd(7)} ${slug.padEnd(16)} ${(buf.length / 1024).toFixed(1)}kB`);
  }
}
console.log(`\nDone -> ${OUT}`);
