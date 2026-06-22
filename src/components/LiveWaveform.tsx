// LiveWaveform — the moving soundbar. Bars scroll/pulse with the REAL audio amplitude while a clip
// plays, settling to a calm flat line at rest. Driven by a precomputed RMS `envelope` (0..1 per
// ~frameMs frame, produced by content-pipeline/tts.mjs) advanced over time — no realtime DSP on
// device (soundbar.md, Option A). Built on RN Animated with an rAF loop writing bar heights
// imperatively (no per-frame React re-render). Reanimated/worklets are a future 60fps optimization.
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const REST = 0.08; // resting flat-line height (8%)

export function LiveWaveform({
  envelope,
  playing,
  positionMs,
  rate = 1,
  frameMs = 30,
  height = 54,
  count = 40,
  gap = 3,
  color,
  radius = 3,
}: {
  envelope?: number[];
  playing: boolean;
  /** Real media-position anchor (ms). When set, the bar interpolates from it instead of a local clock. */
  positionMs?: number;
  /** Playback rate; scales the wall-clock advance so the bar matches a slowed voice (bug 5). */
  rate?: number;
  frameMs?: number;
  height?: number;
  count?: number;
  gap?: number;
  color?: string;
  radius?: number;
}): React.JSX.Element {
  const T = useTheme();
  const c = color ?? T.wavePlayed;
  const bars = useRef<Animated.Value[]>([]);
  if (bars.current.length !== count) {
    bars.current = Array.from({ length: count }, () => new Animated.Value(REST));
  }
  const smooth = useRef<number[]>(new Array(count).fill(REST));
  const raf = useRef<number | null>(null);

  // Latest real-position anchor + rate, read by the persistent loop. Kept in refs (not effect deps)
  // so a continuously-ticking `positionMs` from the playback bridge re-anchors the SAME loop instead
  // of tearing it down and rebuilding it every tick — the restart reset `startedAt` and snapped the
  // scrolling window, which read on-device as a clipping/stuttering bar.
  const posRef = useRef(positionMs);
  posRef.current = positionMs;
  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    const set = (i: number, v: number): void => {
      const clamped = Math.max(REST, Math.min(1, v));
      smooth.current[i] = clamped;
      bars.current[i]?.setValue(clamped);
    };
    const cancel = (): void => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
    const env = envelope && envelope.length ? envelope : null;

    if (!playing) {
      // Ease every bar back down to the resting line over ~300ms.
      const start = smooth.current.slice();
      const t0 = Date.now();
      const ease = (): void => {
        const k = Math.min(1, (Date.now() - t0) / 300);
        for (let i = 0; i < count; i++) {
          const s = start[i] ?? REST;
          set(i, s + (REST - s) * k);
        }
        if (k < 1) raf.current = requestAnimationFrame(ease);
      };
      raf.current = requestAnimationFrame(ease);
      return cancel;
    }

    // ONE persistent loop runs for the whole `playing` span. It anchors the bar to real playback
    // position when the bridge supplies one; otherwise it runs a local clock. Either way it advances
    // by `rate` so a 0.7x clip scrolls ~0.7x as fast (bug 5). A fresh `positionMs` re-anchors the
    // running loop (soft, smoothed) — it does NOT restart it, so the window never snaps.
    let anchorMs = posRef.current ?? 0;
    let anchorWall = Date.now();
    let lastSeenPos = posRef.current;
    const loop = (): void => {
      if (env) {
        // Scrolling window of the amplitude envelope: newest frame on the right, so the bars
        // visibly travel with the voice. Out-of-range frames rest at the flat line.
        if (posRef.current != null && posRef.current !== lastSeenPos) {
          // The bridge reported a new real position — re-anchor to it and restart the local clock
          // from this instant. Bar heights stay continuous (smooth.current persists); only the
          // window's reference point updates, so the bar tracks the voice without a teardown.
          lastSeenPos = posRef.current;
          anchorMs = posRef.current;
          anchorWall = Date.now();
        }
        const mediaMs = anchorMs + (Date.now() - anchorWall) * rateRef.current;
        const idx = Math.floor(mediaMs / frameMs);
        for (let i = 0; i < count; i++) {
          const sampleIdx = idx - (count - 1) + i;
          const target = sampleIdx >= 0 && sampleIdx < env.length ? env[sampleIdx] ?? REST : REST;
          const prev = smooth.current[i] ?? REST;
          // Fast attack, slower release reads as natural speech.
          set(i, prev + (target - prev) * (target > prev ? 0.6 : 0.16));
        }
      } else {
        // No envelope available: the soundbar must move with REAL amplitude only (locked product
        // constraint) — never a timer-driven fake. With no data, ease honestly to the resting line
        // rather than fabricating motion that reads as speech.
        for (let i = 0; i < count; i++) {
          const prev = smooth.current[i] ?? REST;
          set(i, prev + (REST - prev) * 0.16);
        }
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return cancel;
    // positionMs/rate are intentionally NOT deps — they flow through refs into the persistent loop
    // so a ticking position re-anchors rather than restarts it (see posRef/rateRef above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, envelope, count, frameMs]);

  return (
    <View style={[styles.row, { height, columnGap: gap }]} accessibilityRole="image" accessibilityLabel="Audio waveform">
      {bars.current.map((v, i) => (
        <Animated.View
          key={i}
          style={{ flex: 1, height, borderRadius: radius, backgroundColor: c, transform: [{ scaleY: v }] }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', width: '100%' },
});
