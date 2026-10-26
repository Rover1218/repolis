// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityDataState } from '@/hooks/useCityData';
import { buildTodayCity } from '@/lib/city/today';
import { CityError } from '@/lib/errors';
import type { LabelPosition } from '@/scene/city-scene';
import { CityView } from './CityView';
import { FakeScene, makeHistory, makeLatest } from './test-city';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
const data = vi.hoisted(() => ({ current: { phase: 'loading' } as CityDataState }));

vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/hooks/useCityData', () => ({ useCityData: () => data.current }));
// The scene is only ever imported dynamically, after `FakeScene` is initialised.
vi.mock('@/scene/city-scene', () => ({ CityScene: FakeScene }));

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let now = 0;

function runFrames(n: number, ms = 16) {
  act(() => {
    for (let i = 0; i < n; i += 1) {
      const due = [...frames.values()];
      frames = new Map();
      now += ms;
      for (const cb of due) cb(now);
    }
  });
}

function view(owner = 'o', repo = 'r') {
  return <CityView owner={owner} repo={repo} />;
}

async function liveScene(): Promise<FakeScene> {
  await waitFor(() => expect(FakeScene.instances).toHaveLength(1));
  return FakeScene.instances[0];
}

beforeEach(() => {
  FakeScene.reset();
  nav.replace.mockReset();
  data.current = { phase: 'loading' };
  frames = new Map();
  now = 0;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CityView phases', () => {
  it('shows the repo being built while loading', async () => {
    render(view());
    expect(screen.getByText('Building o/r…')).toBeInTheDocument();
    await liveScene();
  });

  it('shows a not-found error with a way back', async () => {
    data.current = { phase: 'error', error: new CityError('not-found') };
    render(view());
    expect(screen.getByText('Repo not found or private')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try another repo' })).toHaveAttribute('href', '/');
    await liveScene();
  });

  it("builds today's city once and shows history progress", async () => {
    const latest = makeLatest();
    data.current = { phase: 'today', latest, progress: 0.2 };
    const { rerender } = render(view());
    const scene = await liveScene();
    await waitFor(() => expect(scene.setLayout).toHaveBeenCalledTimes(1));
    data.current = { phase: 'today', latest, progress: 0.4 };
    rerender(view());
    expect(screen.getByText('Fetching history… 40%')).toBeInTheDocument();
    expect(scene.setLayout).toHaveBeenCalledTimes(1);
    expect(scene.startConstruction).toHaveBeenCalledTimes(1);
    expect(scene.setFrame).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'o/r' })).toBeInTheDocument();
    expect(screen.getByText(/^4 files · \d+ districts?$/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repolis' })).toHaveAttribute('href', '/');
  });

  it("keeps today's city and shows the busy message when history is rate limited", async () => {
    const latest = makeLatest();
    data.current = { phase: 'today', latest, progress: 0.5 };
    const { container, rerender } = render(view());
    const scene = await liveScene();
    await waitFor(() => expect(scene.setLayout).toHaveBeenCalledTimes(1));
    const canvas = container.querySelector('canvas');
    data.current = { phase: 'today-only', latest, historyError: new CityError('rate-limited', { retryAfterMinutes: 7 }) };
    rerender(view());
    expect(screen.getByText('GitHub is busy — try again in 7 minutes')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBe(canvas);
    expect(canvas).toBeInTheDocument();
    expect(scene.setLayout).toHaveBeenCalledTimes(1);
    expect(scene.dispose).not.toHaveBeenCalled();
  });

  it('shows the one-commit line and no slider for a one-commit repo', async () => {
    const { manifest, history } = makeHistory([[['a.ts', 100]]]);
    manifest.snapshots[0].date = '2024-03-12T10:00:00Z';
    data.current = { phase: 'history', latest: makeLatest(), manifest, history };
    render(view());
    await liveScene();
    expect(screen.getByText('Pushed all at once · 1 commit · 12 Mar 2024')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it("says the browser can't show 3D when WebGL is missing", async () => {
    FakeScene.failWith = new CityError('no-webgl');
    data.current = { phase: 'today', latest: makeLatest(), progress: 0 };
    render(view());
    expect(await screen.findByText("Your browser can't show 3D")).toBeInTheDocument();
  });
});

describe('canonical URL', () => {
  it('replaces a wrong-case URL with the canonical full name', async () => {
    data.current = { phase: 'today', latest: makeLatest({ fullName: 'facebook/react' }), progress: 0 };
    render(view('Facebook', 'React'));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/facebook/react'));
  });

  it('leaves a canonical URL alone and ignores malformed names', async () => {
    data.current = { phase: 'today', latest: makeLatest({ fullName: 'o/r' }), progress: 0 };
    const { rerender } = render(view());
    data.current = { phase: 'today', latest: makeLatest({ fullName: '/evil.example/x' }), progress: 0 };
    rerender(view());
    await liveScene();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe('replay', () => {
  it('plays the history from the first snapshot when it arrives directly', async () => {
    const { manifest, history } = makeHistory();
    data.current = { phase: 'history', latest: makeLatest(), manifest, history };
    render(view());
    const scene = await liveScene();
    const slider = await screen.findByRole('slider', { name: 'Snapshot' });
    expect(slider).toHaveValue('0');
    expect(scene.collapse).toHaveBeenCalledTimes(1);
    expect(scene.setLayout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Jan 2024 · commit 1 · 2 files');
    runFrames(41, 100);
    expect(slider).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '2' } });
    expect(screen.getByRole('status')).toHaveTextContent('Mar 2024 · commit 3 · 3 files');
  });

  it("collapses today's city before laying out the replay", async () => {
    const latest = makeLatest();
    data.current = { phase: 'today', latest, progress: 0.9 };
    const { rerender } = render(view());
    const scene = await liveScene();
    await waitFor(() => expect(scene.setLayout).toHaveBeenCalledTimes(1));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { manifest, history } = makeHistory();
    data.current = { phase: 'history', latest, manifest, history };
    rerender(view());
    expect(scene.collapse).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(899));
    expect(scene.setLayout).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(scene.setLayout).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('slider', { name: 'Snapshot' })).toBeInTheDocument();
  });
});

describe('scene overlays', () => {
  it('shows a tooltip for the hovered building', async () => {
    data.current = { phase: 'today', latest: makeLatest(), progress: 0 };
    render(view());
    const scene = await liveScene();
    await waitFor(() => expect(scene.setLayout).toHaveBeenCalledTimes(1));
    const id = buildTodayCity(makeLatest()).layout.paths.indexOf('src/a.ts');
    act(() => scene.hover?.(id, 40, 50));
    const tip = screen.getByRole('tooltip');
    expect(tip).toBeVisible();
    expect(tip).toHaveTextContent('src/a.ts');
    expect(tip).toHaveTextContent('4.2 KB · ≈123 lines');
    expect(tip).not.toHaveTextContent('changed in');
    expect(tip.style.transform).toBe('translate(56px, 66px)');
    act(() => scene.hover?.(id, 1000, 700)); // near jsdom's 1024×768 corner: opens up-left
    expect(tip.style.transform).toBe('translate(calc(984px - 100%), calc(684px - 100%))');
    act(() => scene.hover?.(null, 0, 0));
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });

  it('shows change history and author in the replay tooltip', async () => {
    const { manifest, history } = makeHistory();
    data.current = { phase: 'history', latest: makeLatest(), manifest, history };
    render(view());
    const scene = await liveScene();
    fireEvent.change(await screen.findByRole('slider', { name: 'Snapshot' }), { target: { value: '2' } });
    act(() => scene.hover?.(history.paths.indexOf('src/a.ts'), 40, 50));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('4.2 KB · ≈123 lines');
    expect(tip).toHaveTextContent('changed in 2 snapshots · last Mar 2024');
    expect(tip).toHaveTextContent('last touched by dev2');
  });

  it('positions district labels from the scene every frame', async () => {
    const latest = makeLatest();
    data.current = { phase: 'today', latest, progress: 0 };
    render(view());
    const scene = await liveScene();
    await waitFor(() => expect(scene.setLayout).toHaveBeenCalledTimes(1));
    const { layout } = buildTodayCity(latest);
    scene.labels = [
      ...layout.districts.map((_, index): LabelPosition => ({ kind: 'district', index, x: 100, y: 80, visible: true })),
      ...layout.blocks.map((_, index): LabelPosition => ({ kind: 'block', index, x: 0, y: 0, visible: false })),
    ];
    runFrames(1);
    const label = screen.getByText(layout.districts[0].name);
    expect(label).toBeVisible();
    expect(label.style.transform).toContain('translate3d(100px, 80px, 0)');
  });

  it('dives in and relabels the button when the camera is inside', async () => {
    data.current = { phase: 'today', latest: makeLatest(), progress: 0 };
    render(view());
    const scene = await liveScene();
    fireEvent.click(await screen.findByRole('button', { name: 'Dive in ↓' }));
    expect(scene.toggleDive).toHaveBeenCalledTimes(1);
    scene.inside = true;
    runFrames(2);
    expect(screen.getByRole('button', { name: 'Step out ↑' })).toBeInTheDocument();
  });
});

describe('scene lifecycle', () => {
  it('keeps exactly one live scene under Strict Mode and disposes it on unmount', async () => {
    const { unmount } = render(<StrictMode>{view()}</StrictMode>);
    const scene = await liveScene();
    expect(scene.dispose).not.toHaveBeenCalled();
    unmount();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(FakeScene.instances).toHaveLength(1);
  });
});
