// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CityErrorCode } from '@/lib/errors';
import { ErrorPanel } from './ErrorPanel';

const CASES: Array<[CityErrorCode, number | undefined, string]> = [
  ['invalid-link', undefined, 'Not a GitHub repo link'],
  ['not-found', undefined, 'Repo not found or private'],
  ['empty', undefined, 'This repo is empty'],
  ['rate-limited', 7, 'GitHub is busy — try again in 7 minutes'],
  ['upstream', undefined, "Couldn't reach GitHub — try again"],
  ['no-webgl', undefined, "Your browser can't show 3D"],
];

afterEach(cleanup);

describe('ErrorPanel', () => {
  it.each(CASES)('shows the exact copy for %s', (code, minutes, text) => {
    render(<ErrorPanel code={code} retryAfterMinutes={minutes} />);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('link', { name: 'Try another repo' })).toHaveAttribute('href', '/');
  });
});
