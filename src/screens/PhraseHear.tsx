// phrase/hear — first exposure: hear the phrase, reveal meaning (BACKEND_INTEGRATION §4).
// Shows the live soundbar (LiveWaveform) that moves with the voice while the clip plays. Out: { spoke:false }.
import React, { useEffect, useRef, useState } from 'react';
import { PlayOrb, CtaButton, SpeedChip, LiveWaveform } from '../components';
import { CardShell } from './CardShell';
import type { BaseCardProps } from './cardProps';

const FRAME_MS = 30; // must match content-pipeline/tts.mjs envelope frame size
const TAIL_MS = 200; // small pad so the bars don't cut off exactly on the last frame
const FALLBACK_MS = 1600; // soundbar duration when a clip has no envelope yet

export function PhraseHear({
  item,
  onPlay,
  onComplete,
  speed,
  onSpeedChange,
}: BaseCardProps): React.JSX.Element {
  const env = item.audio.envelope;
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // STOPGAP: the card can't observe playback end yet (the AudioService knows, but that signal isn't
  // exposed through the service boundary), so we run the soundbar for the clip's known length and
  // ignore playback rate. The amplitudes shown are real; only the start/stop gate is approximated.
  // Deeper fix (deferred): surface playback start/position/end via the AudioService contract +
  // cardWiring, then drive LiveWaveform from real position and delete this timer.
  const playClip = (): void => {
    onPlay('native');
    if (timer.current) clearTimeout(timer.current);
    setPlaying(true);
    const ms = env && env.length ? env.length * FRAME_MS + TAIL_MS : FALLBACK_MS;
    timer.current = setTimeout(() => setPlaying(false), ms);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <CardShell eyebrow="New phrase" target={item.target} gloss={item.gloss}>
      <PlayOrb onPress={playClip} />
      <LiveWaveform envelope={env} playing={playing} frameMs={FRAME_MS} />
      <SpeedChip value={speed} onChange={onSpeedChange} />
      <CtaButton
        title="Continue"
        onPress={() => onComplete({ itemId: item.id, cardKind: 'phrase/hear', spoke: false })}
      />
    </CardShell>
  );
}
