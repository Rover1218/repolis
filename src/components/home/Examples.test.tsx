// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Examples } from './Examples';

afterEach(cleanup);

describe('Examples', () => {
  it('renders four links to city pages', () => {
    render(<Examples />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(screen.getByRole('link', { name: /vitejs\/vite/ })).toHaveAttribute('href', '/vitejs/vite');
  });
});
