-- Precomputed RMS amplitude envelope (0..1 per ~30ms frame) so the in-app live waveform
-- moves with the actual audio, not a timer-fill (locked product constraint; soundbar.md).
alter table public.lemmas        add column if not exists envelope jsonb;
alter table public.phrases       add column if not exists envelope jsonb;
alter table public.minimal_pairs add column if not exists envelope jsonb;
