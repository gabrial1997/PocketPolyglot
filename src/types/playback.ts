// Live playback status published by AudioService and consumed by the UI read-model
// (PlaybackContext). Units are milliseconds. Defined here — not in services or components — so
// both layers share it without a cross-layer import.
export interface PlaybackStatus {
  /** True while a clip is actively sounding; false at rest / on finish / on stop. */
  playing: boolean;
  /** Current media position in ms (0 when unknown, e.g. the stub). */
  positionMs: number;
  /** Total clip duration in ms (0 when unknown/not-yet-determined). */
  durationMs: number;
}
