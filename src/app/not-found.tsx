import Link from 'next/link';
import styles from '@/components/home/home.module.css';

/** Any URL that can't be a GitHub repo (bad owner/repo, or a path with no repo in it). */
export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.floor} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <section className={styles.hero}>
        <p className={styles.wordmark} aria-hidden="true">
          Repolis
        </p>
        <h1 className={styles.tagline}>Not a GitHub repo link</h1>
        <div className={styles.examples}>
          <Link href="/" className={`${styles.chip} ${styles.homeLink}`}>
            Try another repo
          </Link>
        </div>
      </section>
    </main>
  );
}
