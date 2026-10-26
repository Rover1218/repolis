import { describe, expect, it } from 'vitest';
import { CONSTRUCTION_SECONDS } from '@/lib/city/construction';
import { layoutCity } from '@/lib/city/layout';
import {
  advancePlayback,
  COLLAPSE_MS,
  IDLE_REPLAY,
  REPLAY_SECONDS,
  startReplay,
  tickReplay,
  waveDelays,
  type PlaybackState,
  type ReplayState,
} from './playback';

const playing = (index = 0): PlaybackState => ({ index, playing: true, carry: 0 });
const never = () => false;

describe('constants', () => {
  it('match the global timing constraints', () => {
    expect(REPLAY_SECONDS).toBe(12);
    expect(COLLAPSE_MS).toBe(900);
  });
});

describe('advancePlayback', () => {
  it('plays 200 snapshots at count / 12 per second', () => {
    const next = advancePlayback(playing(), 6, 200);
    expect(next.index).toBeCloseTo(100, 0);
    expect(next.playing).toBe(true);
  });

  it('stops at the last snapshot on a large dt', () => {
    expect(advancePlayback(playing(), 1000, 200)).toEqual({ index: 199, playing: false, carry: 0 });
  });

  it('carries fractions across small steps', () => {
    let s = playing();
    for (let i = 0; i < 7; i += 1) s = advancePlayback(s, 0.01, 200); // 7 × 0.1667 snapshots
    expect(s.index).toBe(1);
    expect(s.carry).toBeGreaterThan(0);
    expect(s.carry).toBeLessThan(1);
  });

  it('leaves a paused state untouched', () => {
    const paused: PlaybackState = { index: 4, playing: false, carry: 0.5 };
    expect(advancePlayback(paused, 3, 200)).toBe(paused);
  });

  it('ignores negative and non-finite dt', () => {
    expect(advancePlayback(playing(3), -1, 200).index).toBe(3);
    expect(advancePlayback(playing(3), Number.NaN, 200).index).toBe(3);
  });

  it('stops immediately with one snapshot', () => {
    expect(advancePlayback(playing(), 0.1, 1)).toEqual({ index: 0, playing: false, carry: 0 });
  });
});

describe('startReplay', () => {
  it('plays from the first snapshot', () => {
    expect(startReplay(10, false, never)).toEqual({ playback: { index: 0, playing: true, carry: 0 }, hold: 0 });
  });

  it('jumps to the last snapshot, paused, under reduced motion', () => {
    expect(startReplay(10, true, () => true)).toEqual({ playback: { index: 9, playing: false, carry: 0 }, hold: 0 });
  });

  it('holds on a construction first snapshot', () => {
    expect(startReplay(10, false, (i) => i === 0).hold).toBe(CONSTRUCTION_SECONDS);
  });

  it('does not play a one-snapshot replay', () => {
    expect(startReplay(1, false, never).playback.playing).toBe(false);
  });
});

describe('tickReplay', () => {
  const at = (index: number, hold = 0): ReplayState => ({ playback: playing(index), hold });

  it('advances like advancePlayback without construction snapshots', () => {
    expect(tickReplay(at(0), 6, 200, never).playback.index).toBe(100);
  });

  it('stops on the first construction snapshot it passes and holds', () => {
    const next = tickReplay(at(0), 6, 200, (i) => i === 40 || i === 60);
    expect(next).toEqual({ playback: { index: 40, playing: true, carry: 0 }, hold: CONSTRUCTION_SECONDS });
  });

  it('counts the hold down before advancing again', () => {
    const held = tickReplay(at(40, CONSTRUCTION_SECONDS), 2, 200, never);
    expect(held).toEqual({ playback: playing(40), hold: CONSTRUCTION_SECONDS - 2 });
    const released = tickReplay(tickReplay(held, 3, 200, never), 0.1, 200, never);
    expect(released.hold).toBe(0);
    expect(released.playback.index).toBe(41);
  });

  it('does nothing while paused', () => {
    const paused: ReplayState = { playback: { index: 3, playing: false, carry: 0 }, hold: 2 };
    expect(tickReplay(paused, 1, 200, () => true)).toBe(paused);
  });

  it('stops playing when the construction snapshot is the last one', () => {
    const next = tickReplay(at(8), 5, 10, (i) => i === 9);
    expect(next.playback).toEqual({ index: 9, playing: false, carry: 0 });
  });

  it('starts idle', () => {
    expect(IDLE_REPLAY).toEqual({ playback: { index: 0, playing: false, carry: 0 }, hold: 0 });
  });
});

describe('waveDelays', () => {
  const layout = layoutCity(['a/1.ts', 'a/2.ts', 'b/3.ts', 'b/4.ts', 'c/5.ts']);

  it('matches constructionDelays when nothing stood before', () => {
    const sizes = new Float32Array([100, 200, 300, 400, 500]);
    const delays = waveDelays(layout, sizes, null);
    expect(Array.from(delays).some((d) => d > 0)).toBe(true);
  });

  it('gives buildings already standing a zero delay', () => {
    const sizes = new Float32Array([100, 200, 300, 400, 500]);
    const previous = new Float32Array([100, 0, 300, 0, 0]);
    const all = waveDelays(layout, sizes, null);
    const delays = waveDelays(layout, sizes, previous);
    expect(delays[0]).toBe(0);
    expect(delays[2]).toBe(0);
    expect(delays[1]).toBe(all[1]);
    expect(delays[3]).toBe(all[3]);
    expect(delays[4]).toBe(all[4]);
  });
});
