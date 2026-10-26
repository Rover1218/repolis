import { CONSTRUCTION_SECONDS, constructionDelays } from '@/lib/city/construction';
import type { CityLayout } from '@/lib/city/layout';

/** The whole replay autoplays in this many seconds, whatever the snapshot count. */
export const REPLAY_SECONDS = 12;
/** Today's city collapses for this long before the replay layout replaces it. */
export const COLLAPSE_MS = 900;

export type PlaybackState = { index: number; playing: boolean; carry: number };

/** Playback plus the seconds left to hold on a construction snapshot. */
export interface ReplayState {
  playback: PlaybackState;
  hold: number;
}

export const IDLE_REPLAY: ReplayState = { playback: { index: 0, playing: false, carry: 0 }, hold: 0 };

function safeStep(dt: number): number {
  return Number.isFinite(dt) && dt > 0 ? dt : 0;
}

/** Moves `count / REPLAY_SECONDS` snapshots per second and stops at `count - 1`. */
export function advancePlayback(s: PlaybackState, dt: number, count: number): PlaybackState {
  if (!s.playing) return s;
  const last = Math.max(0, count - 1);
  if (s.index >= last) return { index: last, playing: false, carry: 0 };
  const total = s.carry + safeStep(dt) * (count / REPLAY_SECONDS);
  const whole = Math.floor(total);
  const index = s.index + whole;
  if (index >= last) return { index: last, playing: false, carry: 0 };
  return { index, playing: true, carry: total - whole };
}

/** Reduced motion shows the final snapshot, paused; otherwise play from the first one. */
export function startReplay(count: number, reducedMotion: boolean, isConstruction: (s: number) => boolean): ReplayState {
  const last = Math.max(0, count - 1);
  if (reducedMotion) return { playback: { index: last, playing: false, carry: 0 }, hold: 0 };
  return {
    playback: { index: 0, playing: last > 0, carry: 0 },
    hold: isConstruction(0) ? CONSTRUCTION_SECONDS : 0,
  };
}

/**
 * One frame of replay: counts down a construction hold, otherwise advances and
 * stops on the first construction snapshot it reaches, holding there for the wave.
 */
export function tickReplay(
  s: ReplayState,
  dt: number,
  count: number,
  isConstruction: (s: number) => boolean,
): ReplayState {
  if (!s.playback.playing) return s;
  if (s.hold > 0) return { playback: s.playback, hold: Math.max(0, s.hold - safeStep(dt)) };
  const next = advancePlayback(s.playback, dt, count);
  for (let i = s.playback.index + 1; i <= next.index; i += 1) {
    if (isConstruction(i)) {
      return { playback: { index: i, playing: i < count - 1, carry: 0 }, hold: CONSTRUCTION_SECONDS };
    }
  }
  return { playback: next, hold: 0 };
}

/** Construction delays for a snapshot; buildings already standing before it start at once. */
export function waveDelays(layout: CityLayout, sizes: Float32Array, previous: Float32Array | null): Float32Array {
  const delays = constructionDelays(layout, sizes);
  if (previous === null) return delays;
  return delays.map((d, i) => (previous[i] > 0 ? 0 : d));
}
