# Content pipeline — TTS audio

Offline build-time tool. Generates Latvian reference audio (native + slow) with OpenAI TTS and
seeds it into Supabase. **Not** part of the app bundle; keys never reach the client.

## Why it's separate
The app only reads `lemmas.native_url` / `lemmas.slow_url` / `phrases.audio_url` (set here). This
pipeline produces those URLs. It lives outside `src/` and is excluded from the app's lint/typecheck/
build.

## Prereqs (env — from `../.env`, `../../.env`, or the shell)
- `OPENAI_API_KEY` — for `generate`.
- `SUPABASE_URL` (or `EXPO_PUBLIC_SUPABASE_URL`) + `SUPABASE_SERVICE_ROLE_KEY` — for `seed`
  (service_role bypasses RLS to write content; get it from the Supabase dashboard → Project Settings
  → API. **Never** put the service_role key in the app or commit it).
- Optional: `TTS_MODEL` (default `gpt-4o-mini-tts`), `CONTENT_BUCKET` (default `content-audio`).

## Usage
```bash
# 1) Generate mp3s into ./out (listen to them to QA the Latvian quality)
node content-pipeline/tts.mjs generate            # uses sample.json
node content-pipeline/tts.mjs generate my.json

# 2) Upload ./out to a PUBLIC Storage bucket + insert content rows
node content-pipeline/tts.mjs seed                # needs the service_role key
```

## Manifest shape (`sample.json`)
```jsonc
{
  "voice": "alloy",
  "instructions": "native-speaker steering prompt (gpt-4o-mini-tts only)",
  "items": [
    { "slug": "maja", "type": "lemma",  "wordClass": "concrete", "text": "māja", "gloss": "house" },
    { "slug": "p1",   "type": "phrase", "text": "Es dzeru kafiju", "gloss": "I drink coffee" },
    { "slug": "d1",   "type": "pair",   "a": "lapa", "b": "ļaut", "correct": "a", "contrastType": "l_vs_ļ" }
  ]
}
```

## Notes
- **Slow** audio uses a steering instruction (gpt-4o-mini-tts), not time-stretching.
- Cost is ~$2–5 for the full ~1,000-item corpus (gpt-4o-mini-tts ≈ $0.015/min).
- `qa_status` starts at `draft`; promote to `native_ok`/`locked` only after a native review — the
  model audio is the pronunciation ground truth.
- `seed` inserts (not upsert by text) — re-running duplicates rows; refine for production.
