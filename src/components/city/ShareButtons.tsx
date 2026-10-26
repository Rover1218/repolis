'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './city.module.css';

interface ShareButtonsProps {
  /** "owner/repo", used for the download filename. */
  fullName: string;
  /** Null until the scene exists, which disables Save image. */
  onSaveImage: (() => Promise<Blob>) | null;
}

type Flash = 'copied' | 'copy-failed' | 'save-failed' | null;

const FLASH_MS = 2000;

/** Safari ignores a detached anchor and can cancel a download whose URL is revoked synchronously. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function ShareButtons({ fullName, onSaveImage }: ShareButtonsProps) {
  const [flash, setFlash] = useState<Flash>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((next: Exclude<Flash, null>) => {
    if (timer.current) clearTimeout(timer.current);
    setFlash(next);
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      show('copied');
    } catch {
      show('copy-failed');
    }
  };

  const save = async () => {
    if (!onSaveImage) return;
    try {
      const blob = await onSaveImage();
      downloadBlob(blob, `${fullName.split('/').join('-')}-repolis.png`);
    } catch {
      show('save-failed');
    }
  };

  const copyLabel = flash === 'copied' ? 'Copied' : flash === 'copy-failed' ? "Couldn't copy" : 'Copy link';
  const saveLabel = flash === 'save-failed' ? "Couldn't save" : 'Save image';

  return (
    <nav className={`${styles.panel} ${styles.share}`} aria-label="Share">
      <button type="button" onClick={copy}>
        {copyLabel}
      </button>
      <button type="button" onClick={save} disabled={!onSaveImage}>
        {saveLabel}
      </button>
    </nav>
  );
}
