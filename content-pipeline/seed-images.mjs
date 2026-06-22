// seed-images.mjs — host the illustration SVGs + seed lemmas.media (the picture-card art).
//
// What it does (mirrors seed-golden-slice.mjs's storage + env pattern):
//   1. Uploads each SVG in ./assets/images to the public `content-images` Storage bucket
//      (stable keys: golden/<file>.svg, contentType image/svg+xml, upsert).
//   2. Sets lemmas.media = { imageUrl, imageUrlDark? } for each mapped lemma — day art always,
//      plus the -night variant for the day/night pairs (CardImage swaps it in dark mode).
//
// Source of truth for the lemma -> file mapping is the design project's
// "PocketPolyglot Illustration Assets.html" (PAIRS/NEUT arrays). This slice seeds the 6
// golden-slice concrete nouns; the same script scales to the full 146 by extending MAP.
//
// Env (same loader as the seeder): EXPO_PUBLIC_SUPABASE_URL | SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Run:  node content-pipeline/seed-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(HERE, 'assets', 'images');
const BUCKET = process.env.CONTENT_IMAGE_BUCKET || 'content-images';

// lemma (Latvian text — the lemmas-table identity) -> day file + optional night file.
const MAP = [
  { lemma: 'māja', light: 'house.svg', dark: 'house-night.svg' },
  { lemma: 'kafija', light: 'coffee.svg', dark: 'coffee-night.svg' },
  { lemma: 'suns', light: 'dog.svg' },
  { lemma: 'ūdens', light: 'water.svg' },
  { lemma: 'galds', light: 'table.svg' },
  { lemma: 'grāmata', light: 'book.svg' },
];

// Minimal .env loader (copied from seed-golden-slice.mjs): fills process.env from ../.env, ../../.env.
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

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE url / SUPABASE_SERVICE_ROLE_KEY — set them in ../.env and re-run.');
    process.exit(1);
  }

  // Node <22 lacks global WebSocket; supabase-js builds a RealtimeClient eagerly and throws. Polyfill.
  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = (await import('ws')).WebSocket;
  }
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  await db.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  // Upload every referenced file once; remember its public url.
  const files = [...new Set(MAP.flatMap((m) => [m.light, m.dark].filter(Boolean)))];
  const publicUrl = {};
  for (const file of files) {
    const local = path.join(IMAGES_DIR, file);
    if (!fs.existsSync(local)) throw new Error(`asset missing: ${local}`);
    const key = `golden/${file}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(key, fs.readFileSync(local), { contentType: 'image/svg+xml', upsert: true });
    if (error) throw new Error(`upload ${key}: ${error.message}`);
    publicUrl[file] = db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
    console.log(`uploaded  ${key}`);
  }

  // Seed media on each lemma.
  let updated = 0;
  for (const m of MAP) {
    const media = { imageUrl: publicUrl[m.light] };
    if (m.dark) media.imageUrlDark = publicUrl[m.dark];
    const { data, error } = await db.from('lemmas').update({ media }).eq('lemma', m.lemma).select('lemma');
    if (error) throw new Error(`seed ${m.lemma}: ${error.message}`);
    if (!data?.length) console.warn(`  ! no lemma row matched "${m.lemma}" — skipped`);
    else { updated += 1; console.log(`seeded    ${m.lemma} -> ${m.light}${m.dark ? ' + ' + m.dark : ''}`); }
  }

  console.log(`\nDone. ${files.length} files uploaded, ${updated}/${MAP.length} lemmas seeded.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
