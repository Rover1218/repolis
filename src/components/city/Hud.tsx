import Link from 'next/link';
import { formatCount } from '@/lib/city/format';
import styles from './city.module.css';

interface HudProps {
  name: string;
  stats: { files: number; districts: number } | null;
  /** The Dive button shows only while there is a city to dive into. */
  dive: { inside: boolean; onToggle: () => void } | null;
}

export function Hud({ name, stats, dive }: HudProps) {
  return (
    <>
      <header className={`${styles.panel} ${styles.brand}`}>
        <Link href="/" className={styles.wordmark}>
          Repolis
        </Link>
        <h1 className={styles.repoName}>{name}</h1>
        {stats && (
          <p className={styles.meta}>
            {formatCount(stats.files, 'file')} · {formatCount(stats.districts, 'district')}
          </p>
        )}
      </header>
      {dive && (
        <>
          <nav className={`${styles.panel} ${styles.nav}`} aria-label="Camera">
            <button type="button" onClick={dive.onToggle}>
              {dive.inside ? 'Step out ↑' : 'Dive in ↓'}
            </button>
          </nav>
          <p className={styles.hint}>
            drag: orbit · scroll: zoom · double-click a building: fly to it · WASD: walk · Q/E: down/up · Esc: step out
          </p>
        </>
      )}
    </>
  );
}
