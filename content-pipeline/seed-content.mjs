#!/usr/bin/env node
// PocketPolyglot — full content importer (text-first, NO audio).
//   Reads the ranked top-1000 + candidates (for word_class) + phrases CSVs and
//   idempotently upserts ALL 1000 lemmas + 273 phrases + phrase_components as
//   qa_status='draft' with NO audio URLs/envelope. Audio backfills later
//   (tts.mjs) per utility-rank tranche. Server-side only; the service-role key
//   is read from ../.env and is NEVER bundled into the app.
//
// Usage:
//   node content-pipeline/seed-content.mjs           # needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   node content-pipeline/seed-content.mjs --dry-run # parse + assemble only, no DB
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORDS_DIR = path.join(HERE, '..', '..', 'words');
const RANKED_CSV = path.join(WORDS_DIR, 'latvian_top1000_ranked.csv');
const CANDIDATES_CSV = path.join(WORDS_DIR, 'candidates_full.csv');
const PHRASES_CSV = path.join(WORDS_DIR, 'phrases.csv');
const ALLOWED_CLASSES = new Set(['concrete', 'abstract', 'function']);

// Minimal .env loader (no dep): fills process.env from ../.env and ../../.env if unset.
export function loadEnv() {
  for (const p of [path.join(HERE, '..', '.env'), path.join(HERE, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

// Quote-aware CSV parser -> array of objects keyed by the header row. Handles
// double-quoted fields containing commas. No escaped-quote handling needed for
// these files (no embedded double-quotes in the data).
export function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
}
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

// freq_rank 1..1000 -> band 1..10 (each band ~100 ranks). null rank -> null band.
export function bucketFreqBand(freqRank) {
  if (freqRank == null || Number.isNaN(Number(freqRank))) return null;
  const r = Number(freqRank);
  return Math.min(10, Math.max(1, Math.ceil(r / 100)));
}

// word_class from the candidates map; default 'function' for missing/invalid.
export function wordClassFromCandidates(map, lemma) {
  const wc = map.get(lemma);
  return wc && ALLOWED_CLASSES.has(wc) ? wc : 'function';
}

// 'viens kafija lūdzu' -> ['viens','kafija','lūdzu']; '' -> [].
export function parseComponentLemmas(str) {
  return (str || '').trim().split(/\s+/).filter(Boolean);
}

// Resolve a phrase's component tokens to { lemma, lemma_id, position }, skipping
// tokens that don't match an imported lemma (logged by the caller). Position is the
// token's index in the phrase (preserved for display/highlight).
export function resolveComponents(componentLemmasStr, lemmaIdByLemma) {
  const out = [];
  parseComponentLemmas(componentLemmasStr).forEach((tok, idx) => {
    const id = lemmaIdByLemma.get(tok);
    if (id) out.push({ lemma: tok, lemma_id: id, position: idx });
  });
  return out;
}

// Assemble the lemma/phrase row arrays from the CSVs (pure; no DB). Returns
// { lemmaRows, phraseRows } where phraseRows carry the raw component string for
// later resolution against inserted ids.
export function assemble({ rankedText, candidatesText, phrasesText }) {
  const ranked = parseCsv(rankedText);
  const candidates = parseCsv(candidatesText);
  const classByLemma = new Map(candidates.map((c) => [c.lemma, c.word_class]));
  const lemmaRows = ranked.map((r) => ({
    lemma: r.lemma,
    gloss_en: r.meaning,
    word_class: wordClassFromCandidates(classByLemma, r.lemma),
    freq_rank: r.freq_rank ? Number(r.freq_rank) : null,
    utility_rank: r.utility_rank ? Number(r.utility_rank) : null,
    freq_band: bucketFreqBand(r.freq_rank),
    qa_status: 'draft',
  }));
  const phrases = parseCsv(phrasesText);
  const phraseRows = phrases.map((p) => ({
    target: p.latvian,
    gloss_en: p.english,
    is_idiom: String(p.is_idiom).toLowerCase() === 'true',
    qa_status: 'draft',
    _components: p.component_lemmas,
  }));
  return { lemmaRows, phraseRows };
}

async function run({ dryRun }) {
  const rankedText = fs.readFileSync(RANKED_CSV, 'utf8');
  const candidatesText = fs.readFileSync(CANDIDATES_CSV, 'utf8');
  const phrasesText = fs.readFileSync(PHRASES_CSV, 'utf8');
  const { lemmaRows, phraseRows } = assemble({ rankedText, candidatesText, phrasesText });
  console.log(`assembled ${lemmaRows.length} lemmas + ${phraseRows.length} phrases`);
  if (dryRun) { console.log('--dry-run: no DB writes. Exiting.'); return; }

  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('seed needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (../.env).');
  if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = (await import('ws')).WebSocket;
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // -- LEMMAS: upsert on `lemma`. Requires a unique index on lemmas.lemma; if the
  //    onConflict upsert errors (no unique constraint), fall back to select+update/insert.
  //    Batch in chunks of 200 to avoid PostgREST request-size limits.
  const CHUNK = 200;
  const lemmaIdByLemma = new Map();
  let lemmaUpserted = 0;
  try {
    for (let i = 0; i < lemmaRows.length; i += CHUNK) {
      const chunk = lemmaRows.slice(i, i + CHUNK);
      const { error } = await db.from('lemmas').upsert(chunk, { onConflict: 'lemma' });
      if (error) throw error;
      lemmaUpserted += chunk.length;
    }
  } catch (e) {
    console.log(`  upsert(onConflict:lemma) unavailable (${e.message || e}); falling back to select+write`);
    lemmaUpserted = 0;
    for (const row of lemmaRows) {
      const { data: existing } = await db.from('lemmas').select('id').eq('lemma', row.lemma).maybeSingle();
      if (existing) await db.from('lemmas').update(row).eq('id', existing.id);
      else await db.from('lemmas').insert(row);
      lemmaUpserted++;
    }
  }
  // Re-read ids for every imported lemma (needed for phrase_components).
  // Chunk to ≤100 lemmas per request to stay under PostgREST's URL-length limit.
  for (let i = 0; i < lemmaRows.length; i += 100) {
    const slice = lemmaRows.slice(i, i + 100).map((r) => r.lemma);
    const { data, error } = await db.from('lemmas').select('id,lemma').in('lemma', slice);
    if (error) throw error;
    for (const r of data) lemmaIdByLemma.set(r.lemma, r.id);
  }
  console.log(`  ✓ lemmas upserted: ${lemmaUpserted} (ids resolved: ${lemmaIdByLemma.size})`);

  // -- PHRASES: upsert on `target`. Capture target -> id.
  //    Batch in chunks of 200 for consistency.
  const phraseInsert = phraseRows.map(({ _components, ...row }) => row);
  const phraseIdByTarget = new Map();
  try {
    for (let i = 0; i < phraseInsert.length; i += CHUNK) {
      const chunk = phraseInsert.slice(i, i + CHUNK);
      const { error } = await db.from('phrases').upsert(chunk, { onConflict: 'target' });
      if (error) throw error;
    }
  } catch (e) {
    console.log(`  upsert(onConflict:target) unavailable (${e.message || e}); falling back to select+write`);
    for (const row of phraseInsert) {
      const { data: existing } = await db.from('phrases').select('id').eq('target', row.target).maybeSingle();
      if (existing) await db.from('phrases').update(row).eq('id', existing.id);
      else await db.from('phrases').insert(row);
    }
  }
  // Chunk the target lookup to stay under URL-length limits.
  for (let i = 0; i < phraseInsert.length; i += 100) {
    const slice = phraseInsert.slice(i, i + 100).map((r) => r.target);
    const { data, error } = await db.from('phrases').select('id,target').in('target', slice);
    if (error) throw error;
    for (const r of data) phraseIdByTarget.set(r.target, r.id);
  }
  console.log(`  ✓ phrases upserted: ${phraseInsert.length}`);

  // -- PHRASE_COMPONENTS: delete the rows for these phrases, then insert fresh.
  const phraseIds = [...phraseIdByTarget.values()];
  for (let i = 0; i < phraseIds.length; i += 500) {
    await db.from('phrase_components').delete().in('phrase_id', phraseIds.slice(i, i + 500));
  }
  let compCount = 0;
  let missingTokens = 0;
  const componentRows = [];
  for (const p of phraseRows) {
    const phraseId = phraseIdByTarget.get(p.target);
    if (!phraseId) continue;
    const resolved = resolveComponents(p._components, lemmaIdByLemma);
    missingTokens += parseComponentLemmas(p._components).length - resolved.length;
    // Deduplicate by (phrase_id, lemma_id) — the PK — keeping first occurrence.
    // A phrase may repeat a lemma (e.g. "pa kreisi vai pa labi" repeats "pa").
    const seen = new Set();
    for (const c of resolved) {
      const key = `${phraseId}:${c.lemma_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      componentRows.push({ phrase_id: phraseId, lemma_id: c.lemma_id, position: c.position, is_new: false });
    }
  }
  for (let i = 0; i < componentRows.length; i += 1000) {
    const { error } = await db.from('phrase_components').insert(componentRows.slice(i, i + 1000));
    if (error) throw error;
    compCount += Math.min(1000, componentRows.length - i);
  }
  console.log(`  ✓ phrase_components inserted: ${compCount} (unresolved component tokens skipped: ${missingTokens})`);
  console.log('\nDone — all rows qa_status=draft, no audio. Audio backfills via tts.mjs later.');
}

// Only run the live seed when invoked as a script (tests import the pure fns).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  loadEnv();
  run({ dryRun: process.argv.slice(2).includes('--dry-run') }).catch((e) => {
    console.error('ERROR:', e.message || e);
    process.exit(1);
  });
}
