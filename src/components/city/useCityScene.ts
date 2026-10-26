import { type RefObject, useEffect, useState } from 'react';
import { CityError } from '@/lib/errors';
import type { DeviceHints } from '@/scene/quality';
import { CityDirector } from './director';

export interface CitySceneState {
  director: CityDirector | null;
  error: CityError | null;
}

const NO_SCENE: CitySceneState = { director: null, error: null };

function deviceHints(): DeviceHints {
  const memory = (navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;
  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    deviceMemory: typeof memory === 'number' ? memory : undefined,
    devicePixelRatio: window.devicePixelRatio,
  };
}

interface SceneModules {
  CityScene: typeof import('@/scene/city-scene').CityScene;
  pickQuality: typeof import('@/scene/quality').pickQuality;
}

let sceneModules: Promise<SceneModules> | null = null;

/**
 * three.js loads only in the browser, in its own chunk. Mounts share one load
 * (Strict Mode mounts twice); a failed load is forgotten so a later mount retries.
 */
function loadScene(): Promise<SceneModules> {
  sceneModules ??= Promise.all([import('@/scene/city-scene'), import('@/scene/quality')]).then(
    ([scene, quality]) => ({ CityScene: scene.CityScene, pickQuality: quality.pickQuality }),
    (cause: unknown) => {
      sceneModules = null;
      throw new CityError('upstream', { cause });
    },
  );
  return sceneModules;
}

/**
 * Creates one CityScene (wrapped in a CityDirector) on the canvas and disposes it on
 * unmount. Strict Mode's first mount is cancelled before the import resolves, so
 * exactly one scene stays live.
 */
export function useCityScene(canvasRef: RefObject<HTMLCanvasElement | null>): CitySceneState {
  const [state, setState] = useState<CitySceneState>(NO_SCENE);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let director: CityDirector | null = null;

    const start = async () => {
      try {
        const { CityScene, pickQuality } = await loadScene();
        if (cancelled) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const scene = new CityScene(canvas, { quality: pickQuality(deviceHints()), reducedMotion });
        director = new CityDirector(scene, reducedMotion);
        setState({ director, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({ director: null, error: e instanceof CityError ? e : new CityError('no-webgl', { cause: e }) });
      }
    };
    void start();

    return () => {
      cancelled = true;
      director?.dispose();
    };
  }, [canvasRef]);

  return state;
}

/** The page's single requestAnimationFrame loop. */
export function useFrameLoop(director: CityDirector | null, running: boolean): void {
  useEffect(() => {
    if (!director || !running) return;
    let handle = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      director.tick(dt);
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [director, running]);
}
