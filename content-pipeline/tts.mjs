#!/usr/bin/env node
// PocketPolyglot — offline TTS content pipeline.
//   generate: OpenAI TTS -> native + slow mp3 per manifest item, written to ./out
//   seed:     upload ./out to a PUBLIC Supabase Storage bucket + insert content rows (native_url/
//             slow_url / audio_url) so the app can play them.
// Keys are read from the environment / ../.env / ../../.env and are NEVER bundled into the app
// (this is a build-time tool). See README.md.
//
// Usage:
//   node content-pipeline/tts.mjs generate [manifest.json]   # needs OPENAI_API_KEY
//   node content-pipeline/tts.mjs seed     [manifest.json]   # needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'out');
const BUCKET = process.env.CONTENT_BUCKET || 'content-audio';
const TTS_MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts';

// Minimal .env loader (no dep): fills process.env from ../.env and ../../.env if unset.
function loadEnv() {
  for (const p of [path.join(HERE, '..', '.env'), path.join(HERE, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

function readManifest(argPath) {
  const file = argPath ? path.resolve(argPath) : path.join(HERE, 'sample.json');
  return { file, manifest: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

async function synth(client, text, voice, instructions, format = 'mp3') {
  const res = await client.audio.speech.create({
    model: TTS_MODEL,
    voice,
    input: text,
    instructions,
    response_format: format,
  });
  return Buffer.from(await res.arrayBuffer());
}

// Compute a normalized RMS amplitude envelope from raw PCM (16-bit LE mono, 24kHz — OpenAI's
// `pcm` format). One value per ~`frameMs` window, 0..1. This is the data the in-app LiveWaveform
// uses to make the bars "move with the voice" WITHOUT realtime DSP on device (soundbar.md, Option A).
const PCM_RATE = 24000;
function computeEnvelope(pcm, frameMs = 30) {
  const samplesPerFrame = Math.round((PCM_RATE * frameMs) / 1000);
  const count = Math.floor(pcm.length / 2 / samplesPerFrame);
  const env = [];
  let peak = 0;
  for (let f = 0; f < count; f++) {
    let sumSq = 0;
    const base = f * samplesPerFrame * 2;
    for (let i = 0; i < samplesPerFrame; i++) {
      const s = pcm.readInt16LE(base + i * 2) / 32768; // -1..1
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / samplesPerFrame);
    env.push(rms);
    if (rms > peak) peak = rms;
  }
  // Normalize to 0..1 against the clip's own peak; round to keep the JSON small.
  return env.map((v) => Number((peak > 0 ? v / peak : 0).toFixed(3)));
}

async function generate(manifest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set (put it in ../.env or the environment).');
  const client = new OpenAI({ apiKey: key });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const voice = manifest.voice || 'alloy';
  const baseInstr =
    manifest.instructions || 'Clear, warm, natural native Latvian for a language learner.';

  // One clip per item. "Slow" is done in-app via pitch-corrected playback rate (SpeedChip),
  // which is deterministic — the model's "speak slowly" steering is unreliable.
  // We also fetch PCM once per item to compute the amplitude envelope for the live soundbar
  // (it ships next to the clip as <slug>.envelope.json and is seeded onto audio.envelope).
  for (const item of manifest.items) {
    // mp3 (playback) and pcm (envelope) are independent — fetch concurrently.
    const [native, pcm] = await Promise.all([
      synth(client, item.text, voice, baseInstr, 'mp3'),
      synth(client, item.text, voice, baseInstr, 'pcm'),
    ]);
    fs.writeFileSync(path.join(OUT_DIR, `${item.slug}.mp3`), native);
    const envelope = computeEnvelope(pcm);
    fs.writeFileSync(path.join(OUT_DIR, `${item.slug}.envelope.json`), JSON.stringify(envelope));
    console.log(
      `✓ ${item.slug.padEnd(14)} "${item.text}"  ${(native.length / 1024).toFixed(1)}kB  env:${envelope.length}f`,
    );
  }
  console.log(`\nGenerated ${manifest.items.length} clips (+ envelopes) -> ${OUT_DIR}`);
}

async function seed(manifest) {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('seed needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from the Supabase dashboard).');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Ensure the public content bucket exists (idempotent).
  await db.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  async function upload(slug) {
    const local = path.join(OUT_DIR, `${slug}.mp3`);
    if (!fs.existsSync(local)) return null;
    const key = `${slug}.mp3`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(key, fs.readFileSync(local), { contentType: 'audio/mpeg', upsert: true });
    if (error) throw error;
    return db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }

  for (const item of manifest.items) {
    const nativeUrl = await upload(item.slug); // slow is in-app playback rate, not a separate file
    if (item.type === 'phrase') {
      await db.from('phrases').insert({ target: item.text, gloss_en: item.gloss, audio_url: nativeUrl });
    } else if (item.type === 'pair') {
      await db.from('minimal_pairs').insert({
        a: item.a,
        b: item.b,
        correct: item.correct,
        audio_url: nativeUrl,
        contrast_type: item.contrastType || 'unspecified',
      });
    } else {
      await db.from('lemmas').insert({
        lemma: item.text,
        gloss_en: item.gloss,
        word_class: item.wordClass || 'concrete',
        native_url: nativeUrl,
        qa_status: 'draft',
      });
    }
    console.log(`✓ seeded ${item.type.padEnd(6)} ${item.slug}`);
  }
  console.log(`\nSeeded ${manifest.items.length} items into the DB + ${BUCKET} bucket.`);
}

async function main() {
  loadEnv();
  const [cmd, manifestArg] = process.argv.slice(2);
  const { file, manifest } = readManifest(manifestArg);
  console.log(`manifest: ${file}  (${manifest.items.length} items, model ${TTS_MODEL})\n`);
  if (cmd === 'generate') await generate(manifest);
  else if (cmd === 'seed') await seed(manifest);
  else {
    console.error('usage: node content-pipeline/tts.mjs <generate|seed> [manifest.json]');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
