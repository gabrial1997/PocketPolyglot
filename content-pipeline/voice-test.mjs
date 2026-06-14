#!/usr/bin/env node
// One-off voice A/B: render 2 demanding Latvian phrases in EVERY OpenAI voice so a native speaker
// (Elizabete) can judge comprehension + naturalness and pick the male + female voices.
// Output -> content-pipeline/voice-test/  (gitignored).  Run: node content-pipeline/voice-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'voice-test');
const MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts';

// Perceived gender is approximate — the whole point is for the native speaker to judge.
const VOICES = [
  ['alloy', 'neutral'],
  ['ash', 'male'],
  ['ballad', 'male'],
  ['coral', 'female'],
  ['echo', 'male'],
  ['fable', 'neutral'],
  ['nova', 'female'],
  ['onyx', 'male'],
  ['sage', 'female'],
  ['shimmer', 'female'],
  ['verse', 'male'],
];

// Natural, conversational, and phonetically demanding (ļ ņ ķ ģ ž, ā ē ī ū, clusters, morphology).
const PHRASES = [
  ['p1', 'Atvainojiet, vai jūs varētu pateikt, kā nokļūt līdz tuvākajai aptiekai?'],
  ['p2', 'Mūsu ģimene svētdienās bieži dodas pastaigā gar jūrmalu, ja laikapstākļi ir labvēlīgi.'],
];

const INSTRUCTIONS =
  'You are a warm, clear native Latvian speaker. Pronounce naturally, with correct Latvian first-syllable stress and vowel length.';

function loadEnv() {
  for (const p of [path.join(HERE, '..', '.env'), path.join(HERE, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

async function main() {
  loadEnv();
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set (expected in ../.env).');
  const client = new OpenAI({ apiKey: key });
  fs.mkdirSync(OUT, { recursive: true });

  for (const [voice, gender] of VOICES) {
    for (const [pid, text] of PHRASES) {
      try {
        const res = await client.audio.speech.create({
          model: MODEL,
          voice,
          input: text,
          instructions: INSTRUCTIONS,
          response_format: 'mp3',
        });
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(path.join(OUT, `${voice}-${gender}.${pid}.mp3`), buf);
        console.log(`✓ ${voice.padEnd(8)} ${gender.padEnd(8)} ${pid}  ${(buf.length / 1024).toFixed(1)}kB`);
      } catch (e) {
        console.log(`✗ ${voice.padEnd(8)} ${gender.padEnd(8)} ${pid}  (${(e.message || e).slice(0, 70)})`);
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT, '_LEGEND.txt'),
    [
      'Voice comparison — 2 Latvian phrases in each OpenAI voice (gpt-4o-mini-tts).',
      'Files: <voice>-<perceived-gender>.<p1|p2>.mp3',
      '',
      `P1: ${PHRASES[0][1]}`,
      '    (Excuse me, could you tell me how to get to the nearest pharmacy?)',
      `P2: ${PHRASES[1][1]}`,
      '    (Our family often walks along the seaside on Sundays, if the weather is favorable.)',
      '',
      'Goal: pick the most clearly-intelligible MALE and FEMALE voices for Latvian.',
    ].join('\n'),
  );
  console.log(`\nDone -> ${OUT}`);
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
