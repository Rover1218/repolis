import Link from 'next/link';
import { type CityErrorCode, errorMessage } from '@/lib/errors';
import styles from './city.module.css';

interface ErrorPanelProps {
  code: CityErrorCode;
  retryAfterMinutes?: number;
}

export function ErrorPanel({ code, retryAfterMinutes }: ErrorPanelProps) {
  return (
    <section className={`${styles.panel} ${styles.error}`} role="alert">
      <p className={styles.errorText}>{errorMessage(code, retryAfterMinutes)}</p>
      <Link href="/" className={styles.linkButton}>
        Try another repo
      </Link>
    </section>
  );
}
