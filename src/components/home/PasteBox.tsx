'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { errorMessage } from '@/lib/errors';
import { parseRepoInput } from '@/lib/repo-ref';
import styles from './home.module.css';

export function PasteBox() {
  const router = useRouter();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [hasError, setHasError] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const ref = parseRepoInput(value);
    if (!ref) {
      setHasError(true);
      return;
    }
    router.push(`/${ref.owner}/${ref.repo}`);
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <input
          className={styles.input}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="GitHub repository link"
          placeholder="github.com/owner/repo"
          value={value}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setHasError(false);
          }}
        />
        <button className={styles.build} type="submit">
          Build
        </button>
      </div>
      {hasError && (
        <p id={errorId} role="alert" className={styles.error}>
          {errorMessage('invalid-link')}
        </p>
      )}
    </form>
  );
}
