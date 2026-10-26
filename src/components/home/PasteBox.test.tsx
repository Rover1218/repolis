// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasteBox } from './PasteBox';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockClear());
afterEach(cleanup);

const input = () => screen.getByLabelText('GitHub repository link');

describe('PasteBox', () => {
  it('navigates to the city for a valid link on Enter', async () => {
    render(<PasteBox />);
    await userEvent.type(input(), 'https://github.com/facebook/react.git{Enter}');
    expect(push).toHaveBeenCalledWith('/facebook/react');
  });

  it('navigates when the Build button is clicked', async () => {
    render(<PasteBox />);
    await userEvent.type(input(), 'vitejs/vite');
    await userEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect(push).toHaveBeenCalledWith('/vitejs/vite');
  });

  it('shows an accessible inline error for invalid input and does not navigate', async () => {
    render(<PasteBox />);
    await userEvent.type(input(), 'hello{Enter}');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Not a GitHub repo link');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input().getAttribute('aria-describedby')).toBe(alert.id);
    expect(push).not.toHaveBeenCalled();
  });

  it('clears the error when the user edits the input', async () => {
    render(<PasteBox />);
    await userEvent.type(input(), 'hello{Enter}');
    await userEvent.type(input(), '!');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input()).not.toHaveAttribute('aria-invalid', 'true');
  });
});
