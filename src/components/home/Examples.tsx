import Link from 'next/link';
import { EXAMPLES } from '@/lib/examples';
import styles from './home.module.css';

export function Examples() {
  return (
    <nav className={styles.examples} aria-label="Example repositories">
      <p className={styles.examplesLabel}>Or watch one grow</p>
      <ul className={styles.chips}>
        {EXAMPLES.map(({ owner, repo }) => (
          <li key={`${owner}/${repo}`}>
            <Link className={styles.chip} href={`/${owner}/${repo}`}>
              <span className={styles.chipOwner}>{owner}/</span>
              <span className={styles.chipRepo}>{repo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
