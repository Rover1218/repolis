import { beforeEach, describe, expect, it, vi } from 'vitest';
import { constructionDelays } from '@/lib/city/construction';
import { heightFor } from '@/lib/city/height';
import { layoutCity } from '@/lib/city/layout';
import { buildTodayCity } from '@/lib/city/today';
import { CityDirector, type DirectorListener, type ReplayCity } from './director';
import { FakeScene, makeHistory, makeLatest, type Script } from './test-city';

/** Snapshot 2 adds most of the final city, so it is a construction snapshot. */
const WAVE_AT_TWO: Script = [[['a.ts', 100]], [['b.ts', 100]], [['c.ts', 10000]], [['a.ts', 200]]];

function replayOf(script?: Script): ReplayCity {
  const { history } = makeHistory(script);
  return { layout: layoutCity(history.paths), history };
}

function listener() {
  return {
    onUi: vi.fn<DirectorListener['onUi']>(),
    onLabels: vi.fn<DirectorListener['onLabels']>(),
    onHover: vi.fn<DirectorListener['onHover']>(),
  };
}

/** Heights as the scene receives them (Float32). */
const heightsOf = (sizes: Float32Array) => Array.from(sizes.map(heightFor));

function ticks(director: CityDirector, n: number, dt = 0.1) {
  for (let i = 0; i < n; i += 1) director.tick(dt);
}

let scene: FakeScene;
beforeEach(() => {
  FakeScene.reset();
  scene = new FakeScene();
});

describe('today', () => {
  it('lays out today, sets heights with zero heat and starts the wave', () => {
    const director = new CityDirector(scene, false);
    const today = buildTodayCity(makeLatest());
    director.showToday(today);
    expect(scene.setLayout).toHaveBeenCalledWith(today.layout);
    const [heights, heat] = scene.setFrame.mock.calls[0] as [Float32Array, Float32Array];
    expect(Array.from(heights)).toEqual(heightsOf(today.sizes));
    expect(Array.from(heat).every((h) => h === 0)).toBe(true);
    expect(scene.startConstruction).toHaveBeenCalledWith(constructionDelays(today.layout, today.sizes));
  });

  it('skips the wave under reduced motion', () => {
    const director = new CityDirector(scene, true);
    director.showToday(buildTodayCity(makeLatest()));
    expect(scene.startConstruction).not.toHaveBeenCalled();
  });

  it('reports whether a city was standing when it collapses', () => {
    const director = new CityDirector(scene, false);
    expect(director.collapse()).toBe(false);
    director.showToday(buildTodayCity(makeLatest()));
    expect(director.collapse()).toBe(true);
    expect(scene.collapse).toHaveBeenCalledTimes(2);
  });
});

describe('replay', () => {
  it('starts at the first snapshot and plays', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    const replay = replayOf();
    director.playReplay(replay);
    expect(scene.setLayout).toHaveBeenCalledWith(replay.layout);
    const [heights] = scene.setFrame.mock.calls[0] as [Float32Array];
    expect(Array.from(heights)).toEqual(heightsOf(replay.history.sizesAt(0)));
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 0, playing: true, inside: false });
  });

  it('advances through snapshots over REPLAY_SECONDS and stops at the end', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    director.playReplay(replayOf()); // 3 snapshots: 0.25 per second
    ticks(director, 41);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 1, playing: true, inside: false });
    expect(scene.setFrame).toHaveBeenCalledTimes(2);
    ticks(director, 100);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 2, playing: false, inside: false });
  });

  it('caps a long frame so a background tab does not skip the replay', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    director.playReplay(replayOf());
    director.tick(30);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 0, playing: true, inside: false });
    expect(scene.frame).toHaveBeenLastCalledWith(30);
  });

  it('runs the wave for new buildings only and holds on a construction snapshot', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    const replay = replayOf(WAVE_AT_TWO); // 4 snapshots: 1/3 per second
    expect(replay.history.constructionSnapshots.has(2)).toBe(true);
    director.playReplay(replay);
    expect(scene.startConstruction).not.toHaveBeenCalled();
    ticks(director, 61);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 2, playing: true, inside: false });
    expect(scene.startConstruction).toHaveBeenCalledTimes(1);
    const delays = scene.startConstruction.mock.calls[0][0] as Float32Array;
    const [a, b] = ['a.ts', 'b.ts'].map((p) => replay.layout.paths.indexOf(p));
    expect([delays[a], delays[b]]).toEqual([0, 0]);
    ticks(director, 45);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 2, playing: true, inside: false });
    ticks(director, 40);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 3, playing: false, inside: false });
  });

  it('plays the wave for a one-commit repo without playing the timeline', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    director.playReplay(replayOf([[['a.ts', 100], ['b/c.ts', 300]]]));
    expect(scene.startConstruction).toHaveBeenCalledTimes(1);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 0, playing: false, inside: false });
  });

  it('shows the last snapshot, paused, with no wave under reduced motion', () => {
    const director = new CityDirector(scene, true);
    const l = listener();
    director.listen(l);
    const replay = replayOf(WAVE_AT_TWO);
    director.playReplay(replay);
    const [heights] = scene.setFrame.mock.calls[0] as [Float32Array];
    expect(Array.from(heights)).toEqual(heightsOf(replay.history.sizesAt(3)));
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 3, playing: false, inside: false });
    ticks(director, 100);
    expect(scene.startConstruction).not.toHaveBeenCalled();
  });

  it('seeks to a snapshot, pauses and cancels a running wave', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    const replay = replayOf(WAVE_AT_TWO);
    director.playReplay(replay);
    ticks(director, 61);
    director.seek(1);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 1, playing: false, inside: false });
    const cancel = scene.startConstruction.mock.calls[1][0] as Float32Array;
    expect(Array.from(cancel).every((d) => d === 0)).toBe(true);
    const [heights] = scene.setFrame.mock.lastCall as [Float32Array];
    expect(Array.from(heights)).toEqual(heightsOf(replay.history.sizesAt(1)));
    director.seek(99);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 3, playing: false, inside: false });
  });

  it('pauses, resumes, and restarts from the start at the end', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    director.playReplay(replayOf());
    director.togglePlay();
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 0, playing: false, inside: false });
    director.togglePlay();
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 0, playing: true, inside: false });
    director.seek(2);
    director.togglePlay();
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 0, playing: true, inside: false });
  });

  it('ignores seek and play without a replay', () => {
    const director = new CityDirector(scene, false);
    director.seek(1);
    director.togglePlay();
    expect(scene.setFrame).not.toHaveBeenCalled();
  });
});

describe('frame loop outputs', () => {
  it('drives the scene, forwards labels and publishes dive changes once', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    expect(l.onUi).toHaveBeenCalledTimes(1);
    director.tick(0.016);
    expect(scene.frame).toHaveBeenCalledWith(0.016);
    expect(l.onLabels).toHaveBeenCalledWith(scene.labels);
    scene.inside = true;
    ticks(director, 3, 0.016);
    expect(l.onUi).toHaveBeenCalledTimes(2);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 0, playing: false, inside: true });
  });

  it('forwards hover and dive, and stops talking after unlisten or dispose', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    const unlisten = director.listen(l);
    scene.hover?.(3, 10, 20);
    expect(l.onHover).toHaveBeenCalledWith(3, 10, 20);
    director.toggleDive();
    expect(scene.toggleDive).toHaveBeenCalled();
    unlisten();
    scene.hover?.(4, 10, 20);
    expect(l.onHover).toHaveBeenCalledTimes(1);
    director.dispose();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('heat fades when the replay is not playing (R30)', () => {
  const lastHeat = () => Array.from((scene.setFrame.mock.lastCall as [Float32Array, Float32Array])[1]);

  /** Plays to the end with 0.1 s frames; returns when playback has stopped. */
  function playToEnd(director: CityDirector, l: ReturnType<typeof listener>) {
    for (let i = 0; i < 400 && l.onUi.mock.lastCall?.[0].playing !== false; i += 1) director.tick(0.1);
  }

  it('passes the snapshot heat through while playing', () => {
    const director = new CityDirector(scene, true);
    const l = listener();
    director.listen(l);
    const replay = replayOf();
    director.playReplay(replay);
    director.togglePlay(); // reduced motion starts paused at the end; restart from 0
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 0, playing: true, inside: false });
    director.tick(0.05);
    expect(lastHeat()).toEqual(Array.from(replay.history.heatAt(0)));
    expect(lastHeat().some((h) => h > 0)).toBe(true);
  });

  it('fades heat to zero within 1.5 s after the replay ends', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    director.playReplay(replayOf());
    playToEnd(director, l);
    expect(l.onUi).toHaveBeenLastCalledWith({ index: 2, playing: false, inside: false });
    // A construction wave can still be running on the last snapshot: full heat until it is over.
    expect(Math.max(...lastHeat())).toBe(1);
    for (let i = 0; i < 80 && Math.max(...lastHeat()) === 1; i += 1) director.tick(0.1);
    const fadeStart = Math.max(...lastHeat());
    expect(fadeStart).toBeLessThan(1);
    expect(fadeStart).toBeGreaterThan(0);
    ticks(director, 15); // 1.5 s of simulated time
    expect(lastHeat().every((h) => h === 0)).toBe(true);
  });

  it('restores the snapshot heat when play resumes', () => {
    const director = new CityDirector(scene, false);
    const l = listener();
    director.listen(l);
    const replay = replayOf();
    director.playReplay(replay);
    director.seek(1);
    ticks(director, 20);
    expect(lastHeat().every((h) => h === 0)).toBe(true);
    director.togglePlay();
    director.tick(0.01);
    expect(lastHeat()).toEqual(Array.from(replay.history.heatAt(1)));
  });

  it('shows no heat after a seek on a paused replay', () => {
    const director = new CityDirector(scene, true);
    director.listen(listener());
    director.playReplay(replayOf());
    director.seek(0);
    expect(lastHeat().every((h) => h === 0)).toBe(true);
  });
});
