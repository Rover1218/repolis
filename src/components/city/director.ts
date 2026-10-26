import { CONSTRUCTION_SECONDS, constructionDelays } from '@/lib/city/construction';
import { heightFor } from '@/lib/city/height';
import type { CityHistory } from '@/lib/city/history';
import type { CityLayout } from '@/lib/city/layout';
import { IDLE_REPLAY, type ReplayState, startReplay, tickReplay, waveDelays } from '@/lib/city/playback';
import type { TodayCity } from '@/lib/city/today';
import type { CityScene, HoverCallback, LabelPosition } from '@/scene/city-scene';

/** The CityScene surface the director drives (type-only, so three.js stays out of this module). */
export type SceneDriver = Pick<
  CityScene,
  | 'setLayout'
  | 'setFrame'
  | 'startConstruction'
  | 'collapse'
  | 'frame'
  | 'labelPositions'
  | 'isInside'
  | 'toggleDive'
  | 'onHover'
  | 'screenshot'
  | 'dispose'
>;

export interface ReplayCity {
  layout: CityLayout;
  history: CityHistory;
}

/** The only per-frame values React sees, published when one of them changes. */
export interface DirectorUi {
  index: number;
  playing: boolean;
  inside: boolean;
}

export interface DirectorListener {
  onUi(ui: DirectorUi): void;
  onLabels(positions: readonly LabelPosition[]): void;
  onHover: HoverCallback;
}

/** Playback never jumps more than this per frame, e.g. when a background tab wakes up. */
const MAX_PLAYBACK_DT = 0.1;

/** Once the replay has ended at the last snapshot, its change glow eases out over this long (R36). */
export const HEAT_FADE_SECONDS = 1.5;
const HEAT_EPSILON = 1e-3;

/**
 * Drives one CityScene outside React: today's city, the replay and its
 * construction waves, and the per-frame tick called by CityView's rAF loop.
 */
export class CityDirector {
  private replay: ReplayCity | null = null;
  private state: ReplayState = IDLE_REPLAY;
  private ui: DirectorUi = { index: 0, playing: false, inside: false };
  private listener: DirectorListener | null = null;
  private hasCity = false;
  private waveLeft = 0;
  private frame: { heights: Float32Array; heat: Float32Array } | null = null;
  /** 1 during the replay; eases to 0 once it has ended at the last snapshot. */
  private heatScale = 0;

  constructor(
    private readonly scene: SceneDriver,
    private readonly reducedMotion: boolean,
  ) {
    scene.onHover((id, x, y) => this.listener?.onHover(id, x, y));
  }

  listen(listener: DirectorListener): () => void {
    this.listener = listener;
    listener.onUi(this.ui);
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  showToday(today: TodayCity): void {
    const { layout, sizes } = today;
    this.replay = null;
    this.state = IDLE_REPLAY;
    this.hasCity = true;
    this.heatScale = 0;
    this.scene.setLayout(layout);
    this.frame = { heights: sizes.map(heightFor), heat: new Float32Array(sizes.length) };
    this.pushFrame();
    if (!this.reducedMotion) this.startWave(constructionDelays(layout, sizes));
    this.publish();
  }

  /** Sinks every building; returns whether a city was standing (so the caller waits for it). */
  collapse(): boolean {
    this.replay = null;
    this.state = IDLE_REPLAY;
    this.waveLeft = 0;
    this.scene.collapse();
    this.publish();
    return this.hasCity;
  }

  playReplay(replay: ReplayCity): void {
    this.replay = replay;
    this.hasCity = true;
    this.scene.setLayout(replay.layout);
    this.state = startReplay(replay.history.snapshots.length, this.reducedMotion, this.isConstruction);
    // Reduced motion starts at rest on the last snapshot: nothing to fade from.
    this.heatScale = this.hasEnded() ? 0 : 1;
    this.showSnapshot(this.state.playback.index, true);
    this.publish();
  }

  seek(index: number): void {
    const replay = this.replay;
    if (!replay) return;
    const last = replay.history.snapshots.length - 1;
    const target = Math.min(Math.max(0, Math.round(index)), last);
    if (this.waveLeft > 0) this.startWave(new Float32Array(replay.layout.paths.length), 0);
    this.state = { playback: { index: target, playing: false, carry: 0 }, hold: 0 };
    // A scrubbed mid-replay frame shows its heat; scrubbing to the end keeps the current fade.
    if (!this.hasEnded()) this.heatScale = 1;
    this.showSnapshot(target, false);
    this.publish();
  }

  togglePlay(): void {
    const replay = this.replay;
    if (!replay) return;
    const count = replay.history.snapshots.length;
    const { playback } = this.state;
    if (playback.playing) {
      this.state = { playback: { ...playback, playing: false }, hold: this.state.hold };
    } else if (playback.index >= count - 1) {
      this.state = startReplay(count, false, this.isConstruction);
      this.heatScale = 1;
      this.showSnapshot(0, true);
    } else {
      this.state = { playback: { ...playback, playing: true }, hold: this.state.hold };
    }
    this.publish();
  }

  toggleDive(): void {
    this.scene.toggleDive();
  }

  /** A PNG of the current frame. Rejects with a CityError if the canvas yields nothing. */
  screenshot(): Promise<Blob> {
    return this.scene.screenshot();
  }

  /** One animation frame: playback, scene, labels, then UI changes. */
  tick(dt: number): void {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.advance(Math.min(step, MAX_PLAYBACK_DT));
    this.fadeHeat(Math.min(step, MAX_PLAYBACK_DT));
    this.waveLeft = Math.max(0, this.waveLeft - step);
    this.scene.frame(step);
    this.listener?.onLabels(this.scene.labelPositions());
    this.publish();
  }

  dispose(): void {
    this.listener = null;
    this.replay = null;
    this.scene.dispose();
  }

  private readonly isConstruction = (s: number): boolean =>
    !this.reducedMotion && (this.replay?.history.constructionSnapshots.has(s) ?? false);

  private advance(dt: number): void {
    const replay = this.replay;
    if (!replay) return;
    const before = this.state.playback.index;
    this.state = tickReplay(this.state, dt, replay.history.snapshots.length, this.isConstruction);
    if (this.state.playback.index !== before) this.showSnapshot(this.state.playback.index, true);
  }

  /** `byPlayback`: entered by playing (not seeking), so a construction snapshot runs its wave (R19). */
  private showSnapshot(s: number, byPlayback: boolean): void {
    const replay = this.replay;
    if (!replay) return;
    const { layout, history } = replay;
    const sizes = history.sizesAt(s);
    if (byPlayback && this.isConstruction(s)) {
      this.startWave(waveDelays(layout, sizes, s > 0 ? history.sizesAt(s - 1) : null));
    }
    const heat = this.isHeatless(s) ? new Float32Array(sizes.length) : history.heatAt(s);
    this.frame = { heights: sizes.map(heightFor), heat };
    this.pushFrame();
  }

  /** Every building is new on snapshot 0 and on a construction snapshot, so heat would wash the city out (R36). */
  private isHeatless(s: number): boolean {
    return s === 0 || (this.replay?.history.constructionSnapshots.has(s) ?? false);
  }

  /** Stopped on the last snapshot: by playing to the end, scrubbing there, or reduced motion. */
  private hasEnded(): boolean {
    const count = this.replay?.history.snapshots.length ?? 0;
    const { index, playing } = this.state.playback;
    return count > 0 && !playing && index >= count - 1;
  }

  /** Heat holds during the replay and eases out over HEAT_FADE_SECONDS once it has ended. */
  private fadeHeat(dt: number): void {
    if (!this.replay) return;
    const next = this.hasEnded() ? Math.max(0, this.heatScale - dt / HEAT_FADE_SECONDS) : 1;
    const scale = next < HEAT_EPSILON ? 0 : next;
    if (scale === this.heatScale) return;
    this.heatScale = scale;
    this.pushFrame();
  }

  private pushFrame(): void {
    const frame = this.frame;
    if (!frame) return;
    const scale = this.heatScale;
    this.scene.setFrame(frame.heights, scale === 1 ? frame.heat : frame.heat.map((h) => h * scale));
  }

  private startWave(delays: Float32Array, seconds = CONSTRUCTION_SECONDS): void {
    this.scene.startConstruction(delays);
    this.waveLeft = seconds;
  }

  private publish(): void {
    const { index, playing } = this.state.playback;
    const inside = this.scene.isInside();
    const ui = this.ui;
    if (ui.index === index && ui.playing === playing && ui.inside === inside) return;
    this.ui = { index, playing, inside };
    this.listener?.onUi(this.ui);
  }
}
