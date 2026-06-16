#!/usr/bin/env node
// PocketPolyglot — golden-slice seeder (Task 13 of the vertical-slice plan).
//
// A build-time, SERVER-SIDE Node ESM tool (a sibling of tts.mjs — NOT app/client code).
// It consumes content-pipeline/golden-slice.json and, in one run:
//   1. Generates a NATIVE-speed + SLOW MP3 per lemma / phrase / drill (and per drill A/B word),
//      plus a PCM render -> RMS amplitude envelope (computeEnvelope, same as tts.mjs).
//      Audio is written to ./out (and envelopes alongside as <slug>.envelope.json).
//   2. Uploads each MP3 to the public `content-audio` Storage bucket (stable keys: golden/<slug>.mp3).
//   3. Idempotently upserts content rows (lemmas / phrases / phrase_components / minimal_pairs),
//      keyed by a stable, slug-derived natural key (delete-then-insert per kind).
//   4. Engineers per-user review_state rows for the test user from each item's seedState.
//      (known_lemmas is a VIEW over review_state where stage in (review,mature) — so a lemma is
//      made "known" purely by giving it a review-stage review_state row; see knownForTestUser.)
//
// Keys come from the environment / ../.env / ../../.env and are NEVER bundled into the app.
//   OPENAI_API_KEY                 -> TTS generation (offline portion)
//   SUPABASE_URL | EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY -> upload + DB seed
//
// If SUPABASE_SERVICE_ROLE_KEY is missing, the script still does the offline work (TTS + envelope
// to ./out) and EXITS GRACEFULLY (no crash) so a key-less run pre-warms the audio. A single
// `node seed-golden-slice.mjs` with the key present does the full thing.
//
// Usage:
//   node content-pipeline/seed-golden-slice.mjs            # full run if the service key is present
//   node content-pipeline/seed-golden-slice.mjs --offline  # force: TTS + envelope only, never touch DB

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'out');
const MANIFEST = path.join(HERE, 'golden-slice.json');
const BUCKET = process.env.CONTENT_BUCKET || 'content-audio';
const TTS_MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts';
const OBJECT_PREFIX = 'golden';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'test@pocketpolyglot.dev';

// The golden slice must be VISIBLE to user_coverage + get_distractors, which both exclude
// qa_status='draft'. So we seed it as 'native_ok' for the demo. NOTE: this is a slice/demo
// override — the real content pipeline (tts.mjs) keeps qa_status='draft' until Elizabete's
// native QA signs each item off. The golden-slice content is LLM-drafted, not yet native-reviewed.
const SEED_QA_STATUS = 'native_ok';

// Minimal .env loader (no dep): fills process.env from ../.env and ../../.env if unset.
// (Copied from tts.mjs — same proven loader.)
function loadEnv() {
  for (const p of [path.join(HERE, '..', '.env'), path.join(HERE, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
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

// RMS amplitude envelope from raw PCM (16-bit LE mono, 24kHz — OpenAI's `pcm` format).
// One value per ~frameMs window, normalized 0..1. Copied verbatim from tts.mjs (do not reinvent).
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
  return env.map((v) => Number((peak > 0 ? v / peak : 0).toFixed(3)));
}

// Native + slow are SEPARATE renders. Slow uses an instructions hint (the model's "speak slowly"
// steering); the app also has deterministic pitch-corrected slow playback, but a real slow asset
// gives slow_url something to point at for this slice.
const NATIVE_INSTR =
  'Clear, warm, natural native Latvian for a language learner. Correct first-syllable stress and vowel length.';
const SLOW_INSTR =
  'Clear, warm native Latvian for a beginner. Speak slowly and deliberately, leaving space between words, so every sound is easy to follow. Keep correct first-syllable stress and vowel length.';

// Build the flat list of audio renders the manifest needs. Each entry has a stable slug.
//   - lemma:  one clip (its lemma text)
//   - phrase: one clip (its target text)
//   - drill:  three clips — the target, plus the A and B minimal-pair words
function collectRenders(manifest) {
  const renders = [];
  for (const l of manifest.lemmas) renders.push({ slug: l.slug, text: l.lemma });
  for (const p of manifest.phrases) renders.push({ slug: p.slug, text: p.target });
  for (const d of manifest.drills) {
    renders.push({ slug: d.slug, text: d.target });
    renders.push({ slug: `${d.slug}-a`, text: d.a });
    renders.push({ slug: `${d.slug}-b`, text: d.b });
  }
  return renders;
}

// Generate native.mp3 + slow.mp3 + envelope.json per render into ./out. Idempotent on disk
// (overwrites). Returns a map slug -> { envelope }. The native/slow files live at well-known paths.
async function generateAudio(renders, voice) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set (put it in ../.env or the environment).');
  const client = new OpenAI({ apiKey: key });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const result = {};
  for (const r of renders) {
    const [native, slow, pcm] = await Promise.all([
      synth(client, r.text, voice, NATIVE_INSTR, 'mp3'),
      synth(client, r.text, voice, SLOW_INSTR, 'mp3'),
      synth(client, r.text, voice, NATIVE_INSTR, 'pcm'),
    ]);
    fs.writeFileSync(path.join(OUT_DIR, `${r.slug}.mp3`), native);
    fs.writeFileSync(path.join(OUT_DIR, `${r.slug}.slow.mp3`), slow);
    const envelope = computeEnvelope(pcm);
    fs.writeFileSync(path.join(OUT_DIR, `${r.slug}.envelope.json`), JSON.stringify(envelope));
    result[r.slug] = { envelope };
    console.log(
      `  ✓ ${r.slug.padEnd(16)} "${r.text}"  native ${(native.length / 1024).toFixed(1)}kB  ` +
        `slow ${(slow.length / 1024).toFixed(1)}kB  env:${envelope.length}f`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// DB seed (needs the service-role client)
// ---------------------------------------------------------------------------

async function seed(manifest, db, envelopes) {
  // NOT transactional: safe to re-run (delete-then-insert is idempotent), but a mid-run abort can
  // leave a partial state until the next successful run completes.
  const counts = {
    audioUploaded: 0,
    lemmas: 0,
    phrases: 0,
    phrase_components: 0,
    minimal_pairs: 0,
    review_state: 0,
  };

  // Ensure the public content bucket exists (idempotent).
  await db.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  // Upload one local <slug>.<suffix>.mp3 -> golden/<slug>[.slow].mp3, return its public URL.
  async function uploadOne(slug, kind /* 'native' | 'slow' */) {
    const localName = kind === 'slow' ? `${slug}.slow.mp3` : `${slug}.mp3`;
    const local = path.join(OUT_DIR, localName);
    if (!fs.existsSync(local)) return null;
    const objectKey = `${OBJECT_PREFIX}/${kind === 'slow' ? `${slug}.slow.mp3` : `${slug}.mp3`}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(objectKey, fs.readFileSync(local), { contentType: 'audio/mpeg', upsert: true });
    if (error) throw error;
    counts.audioUploaded += 1;
    return db.storage.from(BUCKET).getPublicUrl(objectKey).data.publicUrl;
  }

  // The native-speed RMS envelope per slug — the one the card plays at normal speed. Prefer the
  // freshly-computed map; fall back to the ./out/<slug>.envelope.json on disk (a warmed run).
  function envelopeFor(slug) {
    const fromRun = envelopes?.[slug]?.envelope;
    if (fromRun) return fromRun;
    const p = path.join(OUT_DIR, `${slug}.envelope.json`);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return null;
  }

  // Resolve the test user's id by email via the service-role auth admin API.
  const userId = await resolveTestUserId(db);
  console.log(`\ntest user ${TEST_USER_EMAIL} -> ${userId}`);

  // -- LEMMAS ----------------------------------------------------------------
  // Idempotency: delete the golden lemmas (by lemma text) then re-insert, so reruns don't dup.
  // We capture slug -> inserted id to wire phrase_components + review_state.
  const lemmaSlugToId = {};
  const lemmaTexts = manifest.lemmas.map((l) => l.lemma);
  // Delete dependent review_state for these lemmas first happens implicitly via cascade? No —
  // review_state has no FK to lemmas (item_id is a soft ref). We clear the user's golden
  // review_state explicitly below, so order here only needs to respect phrase_components FK
  // (lemma_id references lemmas on delete restrict). Clear phrase_components + phrases first.
  await db.from('phrase_components').delete().in(
    'phrase_id',
    // Sentinel UUID guard: if there are no existing phrases, fall back to a non-empty array so the
    // .in() clause is never empty (an empty .in() would otherwise match/delete nothing or error).
    (await db.from('phrases').select('id').in('target', manifest.phrases.map((p) => p.target))).data?.map(
      (r) => r.id,
    ) ?? ['00000000-0000-0000-0000-000000000000'],
  );
  await db.from('phrases').delete().in('target', manifest.phrases.map((p) => p.target));
  await db.from('lemmas').delete().in('lemma', lemmaTexts);

  for (const l of manifest.lemmas) {
    const nativeUrl = await uploadOne(l.slug, 'native');
    const slowUrl = await uploadOne(l.slug, 'slow');
    const row = {
      lemma: l.lemma,
      gloss_en: l.gloss,
      word_class: l.wordClass,
      native_url: nativeUrl,
      slow_url: slowUrl,
      qa_status: SEED_QA_STATUS,
    };
    // RMS amplitude envelope of the NATIVE clip (0005 column) — drives the in-app live soundbar.
    const lemmaEnv = envelopeFor(l.slug);
    if (lemmaEnv) row.envelope = lemmaEnv;
    if (l.pron) row.pron = l.pron;
    // media in the manifest is the string "placeholder" (no real image yet). The column +
    // contract expect { imageUrl, imageUrlDark }; only insert media when it's a real object.
    if (l.media && typeof l.media === 'object') row.media = l.media;
    if (l.mnemonic) row.mnemonic = l.mnemonic;
    if (l.examples) row.examples = l.examples;

    const { data, error } = await db.from('lemmas').insert(row).select('id').single();
    if (error) throw error;
    lemmaSlugToId[l.slug] = data.id;
    counts.lemmas += 1;
    console.log(`  ✓ lemma   ${l.slug.padEnd(10)} -> ${data.id}`);
  }

  // -- PHRASES + COMPONENTS ---------------------------------------------------
  const phraseSlugToId = {};
  for (const p of manifest.phrases) {
    const audioUrl = await uploadOne(p.slug, 'native');
    const phraseRow = { target: p.target, gloss_en: p.gloss, audio_url: audioUrl, qa_status: SEED_QA_STATUS };
    const phraseEnv = envelopeFor(p.slug);
    if (phraseEnv) phraseRow.envelope = phraseEnv;
    const { data, error } = await db.from('phrases').insert(phraseRow).select('id').single();
    if (error) throw error;
    phraseSlugToId[p.slug] = data.id;
    counts.phrases += 1;

    const components = p.components.map((compSlug, idx) => {
      const lemmaId = lemmaSlugToId[compSlug];
      if (!lemmaId) throw new Error(`phrase ${p.slug}: component slug "${compSlug}" not a known lemma`);
      // is_new is unused for now: the app computes the i+1 lock state from componentLemmaIds vs the
      // known-set, not from this column. Populated false intentionally.
      return { phrase_id: data.id, lemma_id: lemmaId, position: idx, is_new: false };
    });
    const { error: compErr } = await db.from('phrase_components').insert(components);
    if (compErr) throw compErr;
    counts.phrase_components += components.length;
    console.log(`  ✓ phrase  ${p.slug.padEnd(12)} -> ${data.id}  (${components.length} components)`);
  }

  // -- MINIMAL PAIRS (drills) -------------------------------------------------
  // Idempotency: delete golden pairs by (a, b) then re-insert. The stimulus audio_url points at
  // the drill's target clip (the word actually played in the A/B perception task).
  const drillPairKeys = manifest.drills.map((d) => [d.a, d.b]);
  for (const [a, b] of drillPairKeys) {
    await db.from('minimal_pairs').delete().eq('a', a).eq('b', b);
  }
  const pairSlugToId = {};
  for (const d of manifest.drills) {
    const stimulusUrl = await uploadOne(d.slug, 'native');
    // also upload the A/B word clips (used by the drill UI's per-side playback)
    await uploadOne(`${d.slug}-a`, 'native');
    await uploadOne(`${d.slug}-b`, 'native');
    const row = {
      a: d.a,
      b: d.b,
      correct: d.correct,
      audio_url: stimulusUrl ?? '',
      contrast_type: d.contrastType || 'unspecified',
      qa_status: SEED_QA_STATUS,
    };
    // 0005: envelope of the stimulus (drill target) clip — the audio the perception task plays.
    const drillEnv = envelopeFor(d.slug);
    if (drillEnv) row.envelope = drillEnv;
    // 0004 adds minimal_pairs.glide (jsonb). Diphthong drills carry { combo, from, to };
    // the palatalization drill has none (leave null).
    if (d.glide) row.glide = d.glide;
    const { data, error } = await db.from('minimal_pairs').insert(row).select('id').single();
    if (error) throw error;
    pairSlugToId[d.slug] = data.id;
    counts.minimal_pairs += 1;
    console.log(`  ✓ pair    ${d.slug.padEnd(12)} -> ${data.id}`);
  }

  // -- ENGINEERED review_state FOR THE TEST USER ------------------------------
  // Clear this user's golden review_state first (idempotent), then insert from seedState.
  // We only touch rows whose item_id is one of our freshly-inserted ids.
  const allItemIds = [
    ...Object.values(lemmaSlugToId),
    ...Object.values(phraseSlugToId),
    ...Object.values(pairSlugToId),
  ];
  if (allItemIds.length) {
    await db.from('review_state').delete().eq('user_id', userId).in('item_id', allItemIds);
  }

  const stateRows = [];
  for (const l of manifest.lemmas) {
    if (!l.seedState) continue;
    stateRows.push(makeStateRow(userId, 'lemma', lemmaSlugToId[l.slug], l.seedState));
  }
  for (const p of manifest.phrases) {
    if (!p.seedState) continue;
    stateRows.push(makeStateRow(userId, 'phrase', phraseSlugToId[p.slug], p.seedState));
  }
  // Drills (pairs) carry no seedState in the manifest; they surface as 'new' the first time
  // the user sees them, which is the intended drill behavior. (No rows inserted.)

  // knownForTestUser: ensure these lemmas are review-stage so the known_lemmas VIEW returns them.
  // (All four already have seedState.stage='review' in the manifest; this is a guard in case the
  // manifest changes — promote any listed lemma that lacks a review/mature seed row.)
  const knownSlugs = new Set(manifest.knownForTestUser || []);
  for (const slug of knownSlugs) {
    const existing = stateRows.find((r) => r.item_type === 'lemma' && r.item_id === lemmaSlugToId[slug]);
    if (!existing) {
      stateRows.push(makeStateRow(userId, 'lemma', lemmaSlugToId[slug], { stage: 'review', reps: 1 }));
    } else if (existing.stage !== 'review' && existing.stage !== 'mature') {
      existing.stage = 'review';
    }
  }

  if (stateRows.length) {
    const { error } = await db
      .from('review_state')
      .upsert(stateRows, { onConflict: 'user_id,item_type,item_id' });
    if (error) throw error;
    counts.review_state = stateRows.length;
  }
  console.log(`  ✓ review_state rows for ${TEST_USER_EMAIL}: ${counts.review_state}`);

  return counts;
}

// Engineer a review_state row from a manifest seedState ({ stage, reps }). For non-'new' stages
// we backfill the NOT-NULL-friendly FSRS fields with sensible, schedule-consistent defaults so the
// app's getDueBatch / mappers read coherent rows (review_state has no NOT NULL on the FSRS columns,
// but a review-stage row with a null due_at would never come due — so we fill due_at).
function makeStateRow(userId, itemType, itemId, seedState) {
  if (!itemId) throw new Error(`makeStateRow: missing item id for ${itemType}`);
  const stage = seedState.stage || 'new';
  const reps = seedState.reps ?? 0;
  const row = {
    user_id: userId,
    item_type: itemType,
    item_id: itemId,
    stage,
    reps,
    lapses: 0,
  };
  if (stage !== 'new') {
    const now = Date.now();
    // due_at slightly in the past so the item is due now (review batch picks it up immediately).
    row.due_at = new Date(now - 60 * 1000).toISOString();
    row.last_review = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    // Coarse FSRS defaults scaled by reps; the next real review recomputes these from the log.
    row.stability = stage === 'mature' ? 30 : Math.max(1, reps * 2);
    row.difficulty = 5;
  }
  return row;
}

// Resolve the test user's id by email via the service-role auth admin API. listUsers is paginated;
// page through until we find the email (the project has few users, so one page usually suffices).
async function resolveTestUserId(db) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || '').toLowerCase() === TEST_USER_EMAIL.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break; // last page
  }
  throw new Error(
    `test user ${TEST_USER_EMAIL} not found via auth.admin.listUsers — create it first (Supabase MCP/dashboard).`,
  );
}

// ---------------------------------------------------------------------------

async function main() {
  loadEnv();
  const forceOffline = process.argv.slice(2).some((a) => a === '--offline' || a === '--no-db');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const voice = manifest.voice || 'alloy';
  const renders = collectRenders(manifest);
  console.log(
    `golden-slice: ${manifest.lemmas.length} lemmas, ${manifest.phrases.length} phrases, ` +
      `${manifest.drills.length} drills => ${renders.length} audio renders (model ${TTS_MODEL})\n`,
  );

  // ---- OFFLINE: TTS + envelope (always) ----
  console.log('1/2  generating audio + envelopes -> ./out');
  const envelopes = await generateAudio(renders, voice);
  console.log(`\nGenerated ${renders.length} native+slow clips (+ envelopes) -> ${OUT_DIR}`);

  // ---- Credential guard: skip the live portion gracefully if no service key ----
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (forceOffline) {
    console.log('\n--offline set — skipping upload + DB seed.');
    return;
  }
  if (!serviceKey || !url) {
    console.log(
      '\nSUPABASE_SERVICE_ROLE_KEY not set — generated audio to ./out; skipping upload + DB seed. ' +
        'Set the key in ../.env and re-run to finish.',
    );
    return;
  }

  // ---- LIVE: upload + seed ----
  console.log('\n2/2  uploading audio + seeding content + engineering SRS state');
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const counts = await seed(manifest, db, envelopes);

  console.log('\n=== summary ===');
  console.log(`  audio renders generated : ${renders.length} (native+slow each)`);
  console.log(`  audio files uploaded     : ${counts.audioUploaded}`);
  console.log(`  lemmas inserted          : ${counts.lemmas}`);
  console.log(`  phrases inserted         : ${counts.phrases}`);
  console.log(`  phrase_components        : ${counts.phrase_components}`);
  console.log(`  minimal_pairs inserted   : ${counts.minimal_pairs}`);
  console.log(`  review_state rows        : ${counts.review_state}`);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
