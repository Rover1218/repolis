import type { Metadata } from 'next';
import { Examples } from '@/components/home/Examples';
import { PasteBox } from '@/components/home/PasteBox';
import styles from '@/components/home/home.module.css';

export const metadata: Metadata = {
  title: 'Repolis',
  description: 'Watch any GitHub repo grow into a city.',
};

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.floor} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <section className={styles.hero}>
        <h1 className={styles.wordmark}>Repolis</h1>
        <p className={styles.tagline}>Watch any GitHub repo grow into a city.</p>
        <PasteBox />
        <Examples />
      </section>
    </main>
  );
}
