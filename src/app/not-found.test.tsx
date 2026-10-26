// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NotFound from './not-found';

afterEach(cleanup);

describe('not-found page', () => {
  it('says the link is not a GitHub repo and links back home', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'Not a GitHub repo link' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try another repo' })).toHaveAttribute('href', '/');
  });
});
