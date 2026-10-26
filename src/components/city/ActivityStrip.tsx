import { useMemo } from 'react';
import styles from './city.module.css';

interface ActivityStripProps {
  /** Bytes changed per snapshot. */
  activity: Float32Array;
  /** The snapshot on screen; bars after it are dimmed. */
  index: number;
}

/** Bar height in % of the busiest snapshot, on a square-root scale so small edits stay visible. */
function barHeights(activity: Float32Array): number[] {
  const max = activity.reduce((m, v) => Math.max(m, v), 0);
  return Array.from(activity, (v) => (max > 0 && v > 0 ? Math.sqrt(v / max) * 100 : 0));
}

export function ActivityStrip({ activity, index }: ActivityStripProps) {
  // The bar elements are reused across index changes, so React skips them.
  const bars = useMemo(
    () =>
      barHeights(activity).map((h, i) => (
        <span key={i} className={styles.bar} style={{ height: `${h}%` }} data-bar="" />
      )),
    [activity],
  );
  const played = activity.length > 0 ? ((index + 1) / activity.length) * 100 : 0;
  return (
    <div className={styles.strip} role="img" aria-label="Changes per snapshot">
      {bars}
      {played < 100 && <span className={styles.future} style={{ left: `${played}%` }} />}
    </div>
  );
}
