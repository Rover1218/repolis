// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityStrip } from './ActivityStrip';

function barHeights(): number[] {
  const strip = screen.getByRole('img', { name: 'Changes per snapshot' });
  return Array.from(strip.querySelectorAll<HTMLElement>('[data-bar]'), (b) => parseFloat(b.style.height));
}

afterEach(cleanup);

describe('ActivityStrip', () => {
  it('renders one bar per snapshot with the tallest at the max value', () => {
    render(<ActivityStrip activity={new Float32Array([5, 0, 120, 40, 7])} index={1} />);
    const heights = barHeights();
    expect(heights).toHaveLength(5);
    expect(heights.indexOf(Math.max(...heights))).toBe(2);
    expect(heights[2]).toBe(100);
    expect(heights[1]).toBe(0);
    expect(heights[3]).toBeGreaterThan(heights[0]);
  });

  it('draws flat bars when nothing changed', () => {
    render(<ActivityStrip activity={new Float32Array([0, 0, 0])} index={0} />);
    expect(barHeights()).toEqual([0, 0, 0]);
  });
});
