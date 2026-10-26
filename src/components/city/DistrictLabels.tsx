import { memo, type Ref, useImperativeHandle, useRef } from 'react';
import type { CityLayout } from '@/lib/city/layout';
import type { LabelPosition } from '@/scene/city-scene';
import styles from './city.module.css';

export interface LabelsHandle {
  /** Positions in `CityScene.labelPositions()` order: districts, then blocks. */
  update(positions: readonly LabelPosition[]): void;
}

interface DistrictLabelsProps {
  layout: CityLayout | null;
  ref?: Ref<LabelsHandle>;
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Writes straight to the label nodes so the frame loop never renders React. */
function writeLabels(container: HTMLElement | null, positions: readonly LabelPosition[]): void {
  if (!container) return;
  const nodes = container.children;
  // A layout swap is in flight: the scene already has the new one, React not yet.
  if (nodes.length !== positions.length) return;
  for (let i = 0; i < positions.length; i += 1) {
    const el = nodes[i] as HTMLElement;
    const p = positions[i];
    if (el.hidden === p.visible) el.hidden = !p.visible;
    if (p.visible) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
  }
}

/**
 * District names float over every built district; sub-folder (block) names show
 * only while the scene marks them visible, i.e. when the camera is close.
 */
function DistrictLabelsView({ layout, ref }: DistrictLabelsProps) {
  const container = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ update: (positions) => writeLabels(container.current, positions) }), []);
  return (
    <div ref={container} className={styles.labels} aria-hidden="true">
      {layout?.districts.map((d) => (
        <span key={`d:${d.name}`} className={styles.label} hidden>
          {d.name}
        </span>
      ))}
      {layout?.blocks.map((b) => (
        <span key={`b:${b.name}`} className={`${styles.label} ${styles.blockLabel}`} hidden>
          {lastSegment(b.name)}
        </span>
      ))}
    </div>
  );
}

export const DistrictLabels = memo(DistrictLabelsView);
