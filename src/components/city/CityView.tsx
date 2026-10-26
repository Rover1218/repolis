'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type CityDataState, useCityData } from '@/hooks/useCityData';
import { formatReadout, type TooltipInfo } from '@/lib/city/format';
import { errorMessage } from '@/lib/errors';
import { isValidOwner, isValidRepoName } from '@/lib/repo-ref';
import { replayBuildingInfo, todayBuildingInfo } from './building-info';
import styles from './city.module.css';
import type { CityDirector, DirectorUi, ReplayCity } from './director';
import { DistrictLabels, type LabelsHandle } from './DistrictLabels';
import { ErrorPanel } from './ErrorPanel';
import { Hud } from './Hud';
import { ShareButtons } from './ShareButtons';
import { Timeline, type TimelineProps } from './Timeline';
import { moveTooltip, Tooltip } from './Tooltip';
import { useCityScene, useFrameLoop } from './useCityScene';
import { type CitySync, useCitySync } from './useCitySync';

interface CityViewProps {
  owner: string;
  repo: string;
}

const INITIAL_UI: DirectorUi = { index: 0, playing: false, inside: false };

/** "/owner/repo" for a well-formed GitHub full name, else null (never an open redirect). */
function canonicalPath(fullName: string): string | null {
  const parts = fullName.split('/');
  if (parts.length !== 2 || !isValidOwner(parts[0]) || !isValidRepoName(parts[1])) return null;
  return `/${fullName}`;
}

function timelineProps(
  data: CityDataState,
  replay: ReplayCity | null,
  ui: DirectorUi,
  readout: string,
  director: CityDirector | null,
): TimelineProps | null {
  switch (data.phase) {
    case 'today':
      return { progress: data.progress };
    case 'today-only':
      return { message: errorMessage(data.historyError.code, data.historyError.retryAfterMinutes) };
    case 'history': {
      const { snapshots, activity } = data.history;
      if (snapshots.length === 1) return { oneCommit: snapshots[0].date };
      if (!replay) return { progress: 1 };
      return {
        index: ui.index,
        count: snapshots.length,
        playing: ui.playing,
        readout,
        activity,
        onSeek: (i) => director?.seek(i),
        onTogglePlay: () => director?.togglePlay(),
      };
    }
    default:
      return null;
  }
}

function useHoverInfo(hoverId: number | null, sync: CitySync, data: CityDataState, index: number): TooltipInfo | null {
  const manifest = data.phase === 'history' ? data.manifest : null;
  const { replay, today } = sync;
  return useMemo(() => {
    if (hoverId === null) return null;
    if (replay && manifest) return replayBuildingInfo(replay, manifest, hoverId, index);
    return today ? todayBuildingInfo(today, hoverId) : null;
  }, [hoverId, replay, today, manifest, index]);
}

/** The `/owner/repo` page: today's city first, then the replay, with the HUD around it. */
export function CityView({ owner, repo }: CityViewProps) {
  const data = useCityData({ owner, repo });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<LabelsHandle>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const { director, error: sceneError } = useCityScene(canvasRef);
  const sync = useCitySync(director, data);
  const [ui, setUi] = useState<DirectorUi>(INITIAL_UI);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const error = data.phase === 'error' ? data.error : sceneError;
  useFrameLoop(director, error === null);

  useEffect(() => {
    if (!director) return;
    let hovered: number | null = null;
    return director.listen({
      onUi: setUi,
      onLabels: (positions) => labelsRef.current?.update(positions),
      // Pointer moves only move the tooltip; React renders when the building changes.
      onHover: (id, x, y) => {
        if (id !== null) moveTooltip(tipRef.current, x, y);
        if (id === hovered) return;
        hovered = id;
        setHoverId(id);
      },
    });
  }, [director]);

  const latest = data.phase === 'loading' || data.phase === 'error' ? null : data.latest;
  const fullName = latest?.fullName ?? null;
  useEffect(() => {
    if (fullName === null || fullName === `${owner}/${repo}`) return;
    const path = canonicalPath(fullName);
    if (path === null) return;
    const { location, history } = window;
    if (location.pathname === path) return;
    // In place (Ruling R22): Next syncs native history calls, so the scene and data stay mounted.
    history.replaceState(null, '', `${path}${location.search}${location.hash}`);
  }, [fullName, owner, repo]);

  const history = sync.replay?.history ?? null;
  const readout = useMemo(() => {
    if (!history) return '';
    const i = Math.min(ui.index, history.snapshots.length - 1);
    return formatReadout(history.snapshots[i], history.filesAliveAt(i));
  }, [history, ui.index]);
  const info = useHoverInfo(hoverId, sync, data, ui.index);
  const timeline = timelineProps(data, sync.replay, ui, readout, director);

  const name = fullName ?? `${owner}/${repo}`;
  const stats = latest && sync.layout ? { files: latest.files.length, districts: sync.layout.districts.length } : null;
  const dive =
    director && !error && sync.layout ? { inside: ui.inside, onToggle: () => director.toggleDive() } : null;

  return (
    <main className={styles.city}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label={`3D city of ${name}`} />
      </div>
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <DistrictLabels ref={labelsRef} layout={sync.shownLayout} />
      <Hud name={name} stats={stats} dive={dive} />
      {error ? (
        <ErrorPanel code={error.code} retryAfterMinutes={error.retryAfterMinutes} />
      ) : (
        <>
          {data.phase === 'loading' && (
            <p className={styles.loading} role="status">
              Building {owner}/{repo}…
            </p>
          )}
          {timeline && <Timeline {...timeline} />}
          {director && <ShareButtons fullName={name} onSaveImage={() => director.screenshot()} />}
        </>
      )}
      <Tooltip ref={tipRef} info={error ? null : info} />
    </main>
  );
}
