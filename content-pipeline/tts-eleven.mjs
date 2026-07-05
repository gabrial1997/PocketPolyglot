#!/usr/bin/env node
// PocketPolyglot — ElevenLabs (eleven_v3) Latvian TTS pipeline.
//
//   build:    assemble a manifest of {slug,text,type,meaning} from the workspace word/phrase CSVs
//   generate: ElevenLabs v3 -> ONE pcm_24000 generation per item, written as
//               <slug>.wav            (canonical/approved take; plays everywhere; lossless source)
//               <slug>.envelope.json  (0..1 RMS amplitude envelope for the in-app LiveWaveform)
//             then a Whisper round-trip auto-QA pass flags clips whose transcript != target.
//
// WHY ONE GENERATION: eleven_v3 is NON-DETERMINISTIC. The audio the user approves and the
// envelope the soundbar scrolls MUST come from the SAME generation, or they won't match — and a
// re-roll to "get the pcm" would produce different audio. So we fetch pcm ONCE, wrap it into a WAV
// for playback, and derive the envelope from those exact samples. (At seed time the approved WAV
// transcodes losslessly to mp3.)
//
// Keys come from ../.env / ../../.env (workspace root) and are NEVER bundled into the app.
//   ELEVENLABS_API_KEY  (required for generate)
//   OPENAI_API_KEY      (required for the Whisper QA pass; pass --no-qa to skip)
//
// Usage:
//   node content-pipeline/tts-eleven.mjs build [--words N] [--phrases M] [--out manifest.json]
//   node content-pipeline/tts-eleven.mjs generate [manifest.json] [--no-qa] [--concurrency K]
//   node content-pipeline/tts-eleven.mjs qa [manifest.json]      # re-run QA over existing WAVs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..'); // workspace root (holds words/ and .env)
const WORDS_CSV = path.join(ROOT, 'words', 'latvian_top1000_ranked.csv');
const PHRASES_CSV = path.join(ROOT, 'words', 'phrases.csv');
const OUT_DIR = path.join(HERE, 'out-eleven');

// --- ElevenLabs v3 settings (overridable via env) -----------------------------------------
// Voice cgSgspJ2msm6clMCkdW9 = "Jessica" (English-base premade). Latvian on ElevenLabs is
// eleven_v3-only (multilingual_v2 rejects language_code=lv). v3 speed clamps ~0.85 -> 0.85 is the
// practical slowest. Stability is discrete on v3: 0.0 Creative / 0.5 Natural / 1.0 Robust.
const VOICE_ID = process.env.ELEVEN_VOICE_ID || 'cgSgspJ2msm6clMCkdW9';
const MODEL_ID = process.env.ELEVEN_MODEL_ID || 'eleven_v3';
const SPEED = Number(process.env.ELEVEN_SPEED || 0.85);
const STABILITY = Number(process.env.ELEVEN_STABILITY || 1.0); // 1.0 = Robust
const LANGUAGE = process.env.ELEVEN_LANGUAGE || 'lv';
const PCM_RATE = 24000; // pcm_24000

// --- tiny .env loader (no dep) ------------------------------------------------------------
function loadEnv() {
  for (const p of [path.join(HERE, '..', '.env'), path.join(HERE, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

// --- minimal RFC4180 CSV parser (handles quoted fields w/ commas) --------------------------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== '')).map((r) => {
    const o = {};
    header.forEach((h, i) => (o[h] = r[i]));
    return o;
  });
}

// Latvian diacritics -> ascii, for filesystem-safe slugs.
const TRANSLIT = { ā: 'a', č: 'c', ē: 'e', ģ: 'g', ī: 'i', ķ: 'k', ļ: 'l', ņ: 'n', š: 's', ū: 'u', ž: 'z' };
function slugify(s) {
  return s.toLowerCase().replace(/[āčēģīķļņšūž]/g, (c) => TRANSLIT[c] || c)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// --- build a manifest from the CSVs --------------------------------------------------------
function buildManifest(opts) {
  const wantWords = opts.words ?? 80;
  const wantPhrases = opts.phrases ?? 20;
  const words = parseCsv(fs.readFileSync(WORDS_CSV, 'utf8'))
    .sort((a, b) => Number(a.utility_rank) - Number(b.utility_rank))
    .slice(0, wantWords)
    .map((w) => ({
      slug: `w${String(w.utility_rank).padStart(3, '0')}-${slugify(w.lemma)}`,
      type: 'word',
      text: w.lemma,
      meaning: w.meaning,
      rank: Number(w.utility_rank),
    }));
  const phrases = parseCsv(fs.readFileSync(PHRASES_CSV, 'utf8'))
    .filter((p) => p.latvian && p.latvian.trim())
    .sort((a, b) => (a.tier || '').localeCompare(b.tier || '') || a.phrase_id.localeCompare(b.phrase_id))
    .slice(0, wantPhrases)
    .map((p) => ({
      slug: p.phrase_id, // p0001 ...
      type: 'phrase',
      text: p.latvian.trim(),
      meaning: p.english,
      tier: p.tier,
    }));
  return {
    voice: VOICE_ID, model: MODEL_ID, speed: SPEED, stability: STABILITY, language: LANGUAGE,
    items: [...words, ...phrases],
  };
}

// --- audio helpers -------------------------------------------------------------------------
function wavFromPcm16(pcm, rate = PCM_RATE) {
  const header = Buffer.alloc(44);
  const dataLen = pcm.length;
  header.write('RIFF', 0); header.writeUInt32LE(36 + dataLen, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); // block align, bits
  header.write('data', 36); header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}

function computeEnvelope(pcm, frameMs = 30) {
  const samplesPerFrame = Math.round((PCM_RATE * frameMs) / 1000);
  const count = Math.floor(pcm.length / 2 / samplesPerFrame);
  const env = []; let peak = 0;
  for (let f = 0; f < count; f++) {
    let sumSq = 0; const base = f * samplesPerFrame * 2;
    for (let i = 0; i < samplesPerFrame; i++) { const s = pcm.readInt16LE(base + i * 2) / 32768; sumSq += s * s; }
    const rms = Math.sqrt(sumSq / samplesPerFrame); env.push(rms); if (rms > peak) peak = rms;
  }
  return env.map((v) => Number((peak > 0 ? v / peak : 0).toFixed(3)));
}

// --- ElevenLabs call -----------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function synth(text, attempt = 0) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY not set (put it in ../../.env).');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=pcm_${PCM_RATE}`;
  const body = {
    text,
    model_id: MODEL_ID,
    language_code: LANGUAGE,
    voice_settings: { stability: STABILITY, speed: SPEED, use_speaker_boost: true },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', accept: 'audio/pcm' },
    body: JSON.stringify(body),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`ElevenLabs ${res.status} after ${attempt} retries: ${(await res.text()).slice(0, 200)}`);
    await sleep(1000 * 2 ** attempt + Math.floor(Math.random() * 400)); // backoff for concurrent/rate limits
    return synth(text, attempt + 1);
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer()); // raw 16-bit LE pcm @ PCM_RATE
}

// --- Whisper round-trip QA -----------------------------------------------------------------
function normalize(s) {
  return s.toLowerCase().normalize('NFC').replace(/[.,!?;:"'…]/g, '').replace(/\s+/g, ' ').trim();
}
function deAccent(s) { return s.replace(/[āčēģīķļņšūž]/g, (c) => TRANSLIT[c] || c); }
function similarity(a, b) {
  // Levenshtein ratio on de-accented normalized strings (0..1).
  a = deAccent(normalize(a)); b = deAccent(normalize(b));
  if (!a && !b) return 1; if (!a || !b) return 0;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}

async function transcribe(wavPath) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set (needed for QA; pass --no-qa to skip).');
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(wavPath)], { type: 'audio/wav' }), path.basename(wavPath));
  fd.append('model', 'whisper-1');
  fd.append('language', 'lv');
  fd.append('response_format', 'text');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.text()).trim();
}

async function qaItem(item) {
  const wav = path.join(OUT_DIR, `${item.slug}.wav`);
  if (!fs.existsSync(wav)) return { ...meta(item), error: 'missing wav' };
  const transcript = await transcribe(wav);
  const sim = similarity(item.text, transcript);
  const exact = deAccent(normalize(item.text)) === deAccent(normalize(transcript));
  const flagged = !exact && sim < (item.type === 'phrase' ? 0.85 : 0.95);
  return { ...meta(item), transcript, similarity: Number(sim.toFixed(3)), exact, flagged };
}
function meta(item) { return { slug: item.slug, type: item.type, target: item.text, meaning: item.meaning }; }

// --- concurrency pool ----------------------------------------------------------------------
async function pool(items, k, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => {
    while (true) { const i = next++; if (i >= items.length) break; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// --- commands ------------------------------------------------------------------------------
async function cmdGenerate(manifest, { qa, concurrency }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`voice=${VOICE_ID} model=${MODEL_ID} speed=${SPEED} stability=${STABILITY} lang=${LANGUAGE}`);
  console.log(`generating ${manifest.items.length} clips (concurrency ${concurrency}) -> ${OUT_DIR}\n`);

  await pool(manifest.items, concurrency, async (item) => {
    const wavPath = path.join(OUT_DIR, `${item.slug}.wav`);
    if (fs.existsSync(wavPath) && !process.env.FORCE) { // resume: skip already-generated takes
      console.log(`  · ${item.slug.padEnd(16)} (exists, skip)`);
      return;
    }
    const pcm = await synth(item.text);
    fs.writeFileSync(wavPath, wavFromPcm16(pcm));
    const env = computeEnvelope(pcm);
    fs.writeFileSync(path.join(OUT_DIR, `${item.slug}.envelope.json`), JSON.stringify(env));
    const secs = (pcm.length / 2 / PCM_RATE).toFixed(2);
    console.log(`  ✓ ${item.slug.padEnd(16)} "${item.text}"  ${secs}s  env:${env.length}f`);
  });
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nAudio done. WAV + envelope per item in ${OUT_DIR}`);

  if (qa) await cmdQa(manifest);
}

async function cmdQa(manifest) {
  console.log(`\nWhisper round-trip QA (whisper-1, lv) over ${manifest.items.length} clips...\n`);
  const results = await pool(manifest.items, 4, (item) => qaItem(item).catch((e) => ({ ...meta(item), error: e.message })));
  const flagged = results.filter((r) => r.flagged || r.error);
  for (const r of results) {
    const tag = r.error ? '⚠︎ ERR ' : r.flagged ? '✗ FLAG' : r.exact ? '✓ ok  ' : '~ near';
    const detail = r.error ? r.error : `"${r.transcript}" sim=${r.similarity}`;
    console.log(`  ${tag} ${r.slug.padEnd(16)} ${r.target.padEnd(22)} -> ${detail}`);
  }
  const report = { generatedAt: new Date().toISOString(), voice: VOICE_ID, model: MODEL_ID, speed: SPEED, stability: STABILITY, total: results.length, flaggedCount: flagged.length, results };
  fs.writeFileSync(path.join(OUT_DIR, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nQA: ${results.length - flagged.length}/${results.length} clean, ${flagged.length} flagged. Report -> ${path.join(OUT_DIR, 'qa-report.json')}`);
  if (flagged.length) console.log(`Flagged slugs: ${flagged.map((r) => r.slug).join(', ')}`);
}

// --- review page (shared by the static `review` file and the live `serve` server) ----------
function loadQa() {
  const qaPath = path.join(OUT_DIR, 'qa-report.json');
  return fs.existsSync(qaPath) ? JSON.parse(fs.readFileSync(qaPath, 'utf8')) : { results: [] };
}
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function rowHtml(r) {
  const q = r.qa || {};
  const cls = [q.flagged && 'flag', q.needsReview && 'needs'].filter(Boolean).join(' ');
  const flag = cls ? ` class="${cls}"` : '';
  return `<tr id="row-${escHtml(r.slug)}"${flag} data-slug="${escHtml(r.slug)}">`
    + `<td><input type="checkbox" class="pick"${q.flagged ? ' checked' : ''}></td>`
    + `<td class="status">${q.needsReview ? '🔍' : q.flagged ? '✗' : q.error ? '⚠' : '✓'}</td>`
    + `<td>${escHtml(r.slug)}</td><td>${escHtml(r.type)}</td>`
    + `<td class="lv">${escHtml(r.text)}</td><td>${escHtml(r.meaning)}</td>`
    + `<td class="t">${escHtml(q.transcript ?? q.error ?? '')}</td>`
    + `<td class="sim">${q.similarity ?? ''}</td>`
    + `<td><audio controls preload="none" src="${escHtml(r.slug)}.wav"></audio></td></tr>`;
}

function renderReviewHtml(manifest, qa, { live } = {}) {
  const byslug = Object.fromEntries(qa.results.map((r) => [r.slug, r]));
  const rows = manifest.items.map((it) => ({ ...it, qa: byslug[it.slug] || {} }));
  rows.sort((a, b) => Number(!!b.qa.flagged) - Number(!!a.qa.flagged) || (a.qa.similarity ?? 1) - (b.qa.similarity ?? 1));
  const flaggedCount = qa.flaggedCount ?? rows.filter((r) => r.qa.flagged).length;
  const needs = rows.filter((r) => r.qa.needsReview);
  const needsBanner = needs.length
    ? `<details open class="needs-box"><summary><b>🔍 ${needs.length} clip(s) failed Whisper after 3 auto re-rolls — manual QA needed</b> (Whisper is unreliable on isolated Latvian words, so trust your ears)</summary>
<ul>${needs.map((r) => `<li><a href="#row-${escHtml(r.slug)}">${escHtml(r.slug)}</a> — <b>${escHtml(r.text)}</b> <span class="t">(${escHtml(r.meaning)}; whisper heard "${escHtml(r.qa.transcript ?? r.qa.error ?? '')}")</span></li>`).join('')}</ul></details>`
    : '';
  const banner = live
    ? `<div class="bar"><button id="regen">Regenerate selected</button> <span id="hint">tick rows, then regenerate — clips re-roll in place</span></div>`
    : `<div class="bar warn">Static page — run <code>node content-pipeline/tts-eleven.mjs serve</code> to enable the Regenerate button.</div>`;
  return `<!doctype html><meta charset="utf-8"><title>PocketPolyglot — ElevenLabs review</title>
<style>body{font:15px/1.4 -apple-system,system-ui,sans-serif;margin:24px;color:#222}
h1{font-size:20px;margin-bottom:4px}.meta{color:#666;margin-bottom:12px}
.bar{position:sticky;top:0;background:#fff;padding:10px 0;border-bottom:1px solid #eee;z-index:2}
.bar.warn{color:#a15c00}button{font:inherit;padding:6px 14px;border:1px solid #888;border-radius:6px;background:#f5f5f5;cursor:pointer}
button:disabled{opacity:.5;cursor:default}#hint{color:#888;margin-left:8px}
table{border-collapse:collapse;width:100%}th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left;vertical-align:middle}
th{position:sticky;top:46px;background:#fff;border-bottom:2px solid #ddd}
.lv{font-weight:600}.t{color:#777;font-style:italic}tr.flag{background:#fff6f6}tr.flag .t{color:#c0392b}
tr.busy{opacity:.45}audio{height:32px}tr.needs{background:#fff3e0}tr.needs .status{font-size:16px}
.needs-box{margin:10px 0;padding:8px 12px;background:#fff8ee;border:1px solid #f0d9b0;border-radius:6px}
.needs-box ul{margin:6px 0 0;padding-left:20px}.needs-box li{margin:2px 0}.needs-box summary{cursor:pointer}</style>
<h1>ElevenLabs v3 — Latvian audio review</h1>
<div class="meta">voice ${escHtml(manifest.voice)} · model ${escHtml(manifest.model)} · speed ${manifest.speed} · stability ${manifest.stability} (Robust) · lang ${manifest.language}<br>
Flagged <span id="flagcount">${flaggedCount}</span>/${rows.length} by Whisper round-trip (transcript ≠ target). Flagged rows pre-ticked &amp; shown first. Short function words often false-flag — trust your ears.</div>
${needsBanner}
${banner}
<table><thead><tr><th>✓</th><th></th><th>slug</th><th>type</th><th>Latvian</th><th>meaning</th><th>Whisper heard</th><th>sim</th><th>audio</th></tr></thead>
<tbody>${rows.map(rowHtml).join('\n')}</tbody></table>
${live ? `<script>
const regen = document.getElementById('regen'), hint = document.getElementById('hint');
function applyRow(res){
  const tr = document.getElementById('row-'+res.slug); if(!tr) return;
  tr.classList.remove('busy');
  if(res.error){ tr.querySelector('.status').textContent='⚠'; tr.querySelector('.t').textContent=res.error; return; }
  tr.querySelector('.status').textContent = res.flagged?'✗':'✓';
  tr.querySelector('.t').textContent = res.transcript||'';
  tr.querySelector('.sim').textContent = res.similarity ?? '';
  tr.classList.toggle('flag', !!res.flagged);
  tr.querySelector('.pick').checked = !!res.flagged;
  const a = tr.querySelector('audio'); a.src = res.slug+'.wav?v='+Date.now(); a.load();
  document.getElementById('flagcount').textContent = document.querySelectorAll('tr.flag').length;
}
regen.addEventListener('click', async () => {
  const slugs = [...document.querySelectorAll('tr')].filter(tr=>tr.querySelector('.pick')?.checked).map(tr=>tr.dataset.slug);
  if(!slugs.length){ hint.textContent='nothing ticked'; return; }
  regen.disabled = true; hint.textContent = 're-rolling '+slugs.length+'… (≤2 at a time)';
  slugs.forEach(s=>document.getElementById('row-'+s)?.classList.add('busy'));
  try {
    const r = await fetch('reroll', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({slugs})});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error||('HTTP '+r.status));
    data.results.forEach(applyRow);
    hint.textContent = 'done — '+data.results.filter(x=>!x.flagged&&!x.error).length+'/'+data.results.length+' clean';
  } catch(e){ hint.textContent = 'error: '+e.message; slugs.forEach(s=>document.getElementById('row-'+s)?.classList.remove('busy')); }
  regen.disabled = false;
});
</script>` : ''}`;
}

function cmdReview() {
  const html = renderReviewHtml(loadManifest(), loadQa(), { live: false });
  const out = path.join(OUT_DIR, 'review.html');
  fs.writeFileSync(out, html);
  console.log(`wrote review page -> ${out}\nOpen it in a browser to listen (flagged first).`);
}

// --- reroll: delete + regenerate specific slugs, then re-QA them ----------------------------
async function rerollSlugs(manifest, slugs) {
  const items = slugs.map((s) => manifest.items.find((i) => i.slug === s)).filter(Boolean);
  // Regenerate audio (ElevenLabs caps at 2 concurrent), forcing a fresh take.
  await pool(items, 2, async (item) => {
    const pcm = await synth(item.text);
    fs.writeFileSync(path.join(OUT_DIR, `${item.slug}.wav`), wavFromPcm16(pcm));
    fs.writeFileSync(path.join(OUT_DIR, `${item.slug}.envelope.json`), JSON.stringify(computeEnvelope(pcm)));
  });
  // Re-run Whisper QA for just these items.
  const results = await pool(items, 4, (item) => qaItem(item).catch((e) => ({ ...meta(item), error: e.message })));
  // Merge into the persisted qa-report.json.
  const qa = loadQa();
  const map = Object.fromEntries(qa.results.map((r) => [r.slug, r]));
  results.forEach((r) => (map[r.slug] = r));
  qa.results = manifest.items.map((i) => map[i.slug]).filter(Boolean);
  qa.flaggedCount = qa.results.filter((r) => r.flagged || r.error).length;
  qa.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, 'qa-report.json'), JSON.stringify(qa, null, 2));
  return results;
}

async function cmdReroll(slugs) {
  if (!slugs.length) { console.error('usage: ... reroll <slug> [slug...]'); process.exit(1); }
  const manifest = loadManifest();
  const results = await rerollSlugs(manifest, slugs);
  for (const r of results) {
    console.log(`  ${r.error ? '⚠' : r.flagged ? '✗ FLAG' : '✓ ok'} ${r.slug.padEnd(16)} ${r.target.padEnd(22)} -> ${r.error ? r.error : `"${r.transcript}" sim=${r.similarity}`}`);
  }
  cmdReview(); // refresh the static page too
  console.log(`re-rolled ${results.length}; ${results.filter((r) => !r.flagged && !r.error).length} clean.`);
}

// --- greenup: re-roll flagged clips up to N attempts, keep the best take -------------------
// Each re-roll is a fresh (non-deterministic) v3 take. We keep a new take only if it PASSES or
// has higher Whisper similarity than the current one — so a clip never gets worse. After N
// attempts a still-flagged clip is marked needsReview (it'll likely never pass — e.g. isolated
// function words Whisper can't transcribe) and shown on the review site for a human ear.
function writeQa(manifest, map) {
  const qa = loadQa();
  qa.results = manifest.items.map((i) => map[i.slug]).filter(Boolean);
  qa.flaggedCount = qa.results.filter((r) => r.flagged || r.error).length;
  qa.needsReviewCount = qa.results.filter((r) => r.needsReview).length;
  qa.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, 'qa-report.json'), JSON.stringify(qa, null, 2));
}

async function cmdGreenup({ attempts: maxAttempts = 3 } = {}) {
  const manifest = loadManifest();
  const map = Object.fromEntries(loadQa().results.map((r) => [r.slug, r]));
  let round = 0;
  while (true) {
    const eligible = manifest.items.filter((it) => {
      const r = map[it.slug];
      return r && (r.flagged || r.error) && (r.attempts || 0) < maxAttempts;
    });
    if (!eligible.length) break;
    round++;
    console.log(`\n── green-up round ${round}: re-rolling ${eligible.length} flagged clip(s) ──`);
    await pool(eligible, 2, async (item) => {
      const wavPath = path.join(OUT_DIR, `${item.slug}.wav`);
      const envPath = path.join(OUT_DIR, `${item.slug}.envelope.json`);
      const oldWav = fs.existsSync(wavPath) ? fs.readFileSync(wavPath) : null;
      const oldEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath) : null;
      const old = map[item.slug];
      const oldSim = old.similarity ?? 0;
      let res;
      try {
        const pcm = await synth(item.text);
        fs.writeFileSync(wavPath, wavFromPcm16(pcm));
        fs.writeFileSync(envPath, JSON.stringify(computeEnvelope(pcm)));
        res = await qaItem(item);
      } catch (e) {
        res = { ...meta(item), error: e.message };
      }
      const attempts = (old.attempts || 0) + 1;
      const passes = !res.flagged && !res.error;
      const better = (res.similarity ?? 0) > oldSim;
      let kept;
      if (passes || better) {
        kept = { ...res, attempts }; // keep the new (passing or higher-similarity) take
      } else {
        if (oldWav) fs.writeFileSync(wavPath, oldWav); // revert to the better existing take
        if (oldEnv) fs.writeFileSync(envPath, oldEnv);
        kept = { ...old, attempts };
      }
      if ((kept.flagged || kept.error) && attempts >= maxAttempts) kept.needsReview = true;
      map[item.slug] = kept;
      const mark = passes ? '✓ PASS' : kept.needsReview ? '✗ keep(needsReview)' : '~ keep best';
      console.log(`  ${mark.padEnd(20)} ${item.slug.padEnd(16)} ${item.text.padEnd(20)} sim=${kept.similarity ?? '-'} (try ${attempts}/${maxAttempts})`);
    });
    writeQa(manifest, map); // persist after each round so progress survives interruption
  }
  cmdReview(); // refresh static page
  const results = manifest.items.map((i) => map[i.slug]).filter(Boolean);
  const needs = results.filter((r) => r.needsReview);
  const clean = results.filter((r) => !r.flagged && !r.error).length;
  console.log(`\n══ green-up done: ${clean}/${results.length} clean. ${needs.length} need manual review ══`);
  needs.forEach((r) => console.log(`  • ${r.slug.padEnd(16)} ${r.target.padEnd(22)} whisper heard "${r.transcript ?? r.error}"`));
  if (needs.length) console.log(`\nThese are listed in the review site (run \`serve\`) under "Needs manual review".`);
}

// --- seed: upload WAVs to Storage + backfill native_url/audio_url + envelope ----------------
// Words -> lemmas (match by `lemma`), phrases -> phrases (match by `target`). This is a BACKFILL:
// the rows already exist (text-seeded as draft), so we UPDATE in place. On an overwrite we also
// NULL slow_url so slow playback falls back to the new native clip (cardWiring uses slowUrl ?? nativeUrl)
// rather than keeping a stale old-voice slow clip. Idempotent (storage upsert + UPDATE by key).
const SUPA_BUCKET = process.env.CONTENT_BUCKET || 'content-audio';
async function cmdSeed(manifest, { dryRun }) {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('seed needs SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (../.env / ../../.env).');
  if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = (await import('ws')).WebSocket;
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const items = manifest.items.filter((it) => fs.existsSync(path.join(OUT_DIR, `${it.slug}.wav`)));
  const words = items.filter((i) => i.type === 'word');
  const phrases = items.filter((i) => i.type === 'phrase');
  console.log(`seed: ${items.length} clips with audio (${words.length} words + ${phrases.length} phrases) -> ${url}`);

  // Preview: which rows exist, and how many already have audio (would be overwritten).
  async function existing(table, col, urlCol, vals) {
    const found = new Map();
    for (let i = 0; i < vals.length; i += 100) {
      const slice = vals.slice(i, i + 100);
      const { data, error } = await db.from(table).select(`${col},${urlCol}`).in(col, slice);
      if (error) throw error;
      data.forEach((r) => found.set(r[col], r[urlCol] != null));
    }
    return found; // text -> hasAudioAlready
  }
  const lemmaFound = await existing('lemmas', 'lemma', 'native_url', words.map((w) => w.text));
  const phraseFound = await existing('phrases', 'target', 'audio_url', phrases.map((p) => p.text));
  const wUnmatched = words.filter((w) => !lemmaFound.has(w.text));
  const pUnmatched = phrases.filter((p) => !phraseFound.has(p.text));
  const wOverwrite = words.filter((w) => lemmaFound.get(w.text)).length;
  const pOverwrite = phrases.filter((p) => phraseFound.get(p.text)).length;
  console.log(`  lemmas: ${words.length - wUnmatched.length}/${words.length} match an existing row (${wOverwrite} already have audio → overwrite); ${wUnmatched.length} unmatched`);
  console.log(`  phrases: ${phrases.length - pUnmatched.length}/${phrases.length} match (${pOverwrite} overwrite); ${pUnmatched.length} unmatched`);
  if (wUnmatched.length) console.log(`  unmatched lemmas: ${wUnmatched.map((w) => w.text).join(', ')}`);
  if (pUnmatched.length) console.log(`  unmatched phrases: ${pUnmatched.map((p) => p.text).join(', ')}`);
  if (dryRun) { console.log('\n--dry-run: no uploads, no writes.'); return; }

  await db.storage.createBucket(SUPA_BUCKET, { public: true }).catch(() => {}); // idempotent

  let uploaded = 0, wrote = 0, skipped = 0;
  await pool(items, 6, async (item) => {
    const wav = fs.readFileSync(path.join(OUT_DIR, `${item.slug}.wav`));
    const envPath = path.join(OUT_DIR, `${item.slug}.envelope.json`);
    const envelope = fs.existsSync(envPath) ? JSON.parse(fs.readFileSync(envPath, 'utf8')) : null;
    const key = `${item.type === 'word' ? 'words' : 'phrases'}/${item.slug}.wav`;
    const { error: upErr } = await db.storage.from(SUPA_BUCKET).upload(key, wav, { contentType: 'audio/wav', upsert: true });
    if (upErr) { console.log(`  ⚠ upload ${item.slug}: ${upErr.message}`); return; }
    uploaded++;
    const publicUrl = db.storage.from(SUPA_BUCKET).getPublicUrl(key).data.publicUrl;
    if (item.type === 'word') {
      const { data, error } = await db.from('lemmas')
        .update({ native_url: publicUrl, slow_url: null, envelope })
        .eq('lemma', item.text).select('id');
      if (error) { console.log(`  ⚠ update lemma ${item.text}: ${error.message}`); return; }
      if (data?.length) wrote += data.length; else skipped++;
    } else {
      const { data, error } = await db.from('phrases')
        .update({ audio_url: publicUrl, envelope })
        .eq('target', item.text).select('id');
      if (error) { console.log(`  ⚠ update phrase ${item.text}: ${error.message}`); return; }
      if (data?.length) wrote += data.length; else skipped++;
    }
  });
  console.log(`\n✓ uploaded ${uploaded} clips to ${SUPA_BUCKET}/; updated ${wrote} rows; ${skipped} had no matching row.`);
  console.log('Audio is live — cards for these items will light up (native_url + envelope set).');
}

// --- live server: review page + audio + POST /reroll ---------------------------------------
async function cmdServe(port) {
  const http = await import('node:http');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/review.html')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(renderReviewHtml(loadManifest(), loadQa(), { live: true }));
      }
      if (req.method === 'GET' && url.pathname.endsWith('.wav')) {
        const f = path.join(OUT_DIR, path.basename(url.pathname));
        if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'content-type': 'audio/wav', 'cache-control': 'no-store' });
        return fs.createReadStream(f).pipe(res);
      }
      if (req.method === 'POST' && url.pathname === '/reroll') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { slugs } = JSON.parse(body || '{}');
        if (!Array.isArray(slugs) || !slugs.length) { res.writeHead(400); return res.end(JSON.stringify({ error: 'no slugs' })); }
        console.log(`reroll: ${slugs.join(', ')}`);
        const results = await rerollSlugs(loadManifest(), slugs);
        results.forEach((r) => console.log(`  ${r.error ? '⚠' : r.flagged ? '✗' : '✓'} ${r.slug} -> ${r.error || `"${r.transcript}" (${r.similarity})`}`));
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ results }));
      }
      res.writeHead(404); res.end('not found');
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  server.listen(port, () => console.log(`review server -> http://localhost:${port}/\n(tick rows, click "Regenerate selected"; Ctrl-C to stop)`));
}

function parseFlags(argv) {
  const f = { words: undefined, phrases: undefined, out: undefined, qa: true, concurrency: 3, port: undefined, manifest: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-qa') f.qa = false;
    else if (a === '--words') f.words = Number(argv[++i]);
    else if (a === '--phrases') f.phrases = Number(argv[++i]);
    else if (a === '--out') f.out = argv[++i];
    else if (a === '--concurrency') f.concurrency = Number(argv[++i]);
    else if (a === '--port') f.port = Number(argv[++i]);
    else if (a === '--attempts') f.attempts = Number(argv[++i]);
    else if (!a.startsWith('--')) f.manifest = a;
  }
  return f;
}

function loadManifest(p) {
  const file = p ? path.resolve(p) : path.join(OUT_DIR, 'manifest.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  loadEnv();
  const [cmd, ...rest] = process.argv.slice(2);
  const f = parseFlags(rest);
  if (cmd === 'build') {
    const manifest = buildManifest(f);
    const out = f.out ? path.resolve(f.out) : path.join(OUT_DIR, 'manifest.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
    const w = manifest.items.filter((i) => i.type === 'word').length;
    const p = manifest.items.filter((i) => i.type === 'phrase').length;
    console.log(`built manifest: ${manifest.items.length} items (${w} words + ${p} phrases) -> ${out}`);
  } else if (cmd === 'generate') {
    const manifest = f.manifest ? loadManifest(f.manifest) : buildManifest(f);
    await cmdGenerate(manifest, f);
  } else if (cmd === 'qa') {
    await cmdQa(loadManifest(f.manifest));
  } else if (cmd === 'review') {
    cmdReview();
  } else if (cmd === 'serve') {
    await cmdServe(Number(process.env.PORT || f.port || 5050));
  } else if (cmd === 'reroll') {
    await cmdReroll(rest.filter((a) => !a.startsWith('--')));
  } else if (cmd === 'greenup') {
    await cmdGreenup({ attempts: f.attempts });
  } else if (cmd === 'seed') {
    await cmdSeed(loadManifest(f.manifest), { dryRun: rest.includes('--dry-run') });
  } else {
    console.error('usage: node content-pipeline/tts-eleven.mjs <build|generate|qa|review|serve|reroll> [manifest.json] [--words N] [--phrases M] [--no-qa] [--concurrency K] [--port P]');
    process.exit(1);
  }
}

main().catch((e) => { console.error('ERROR:', e.message || e); process.exit(1); });
