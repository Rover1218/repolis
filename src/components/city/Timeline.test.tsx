// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type PlayerProps, Timeline } from './Timeline';

const READOUT = 'Mar 2019 · commit 1,204 · 224 files';

function player(overrides: Partial<PlayerProps> = {}): PlayerProps {
  return {
    index: 3,
    count: 10,
    playing: true,
    readout: READOUT,
    activity: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    onSeek: vi.fn(),
    onTogglePlay: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe('Timeline player', () => {
  it('has a snapshot slider, a pause button and the readout', () => {
    render(<Timeline {...player()} />);
    const slider = screen.getByRole('slider', { name: 'Snapshot' });
    expect(slider).toHaveValue('3');
    expect(slider).toHaveAttribute('max', '9');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(READOUT);
    expect(screen.getByRole('img', { name: 'Changes per snapshot' })).toBeInTheDocument();
  });

  it('shows Play while paused and toggles on click', () => {
    const props = player({ playing: false });
    render(<Timeline {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(props.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('seeks when the slider moves', () => {
    const props = player();
    render(<Timeline {...props} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Snapshot' }), { target: { value: '7' } });
    expect(props.onSeek).toHaveBeenCalledWith(7);
  });
});

describe('Timeline status lines', () => {
  it('renders only the one-commit line for a one-commit repo', () => {
    render(<Timeline oneCommit="2024-03-12T10:00:00Z" />);
    expect(screen.getByText('Pushed all at once · 1 commit · 12 Mar 2024')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows history progress as a whole percentage', () => {
    render(<Timeline progress={0.63} />);
    expect(screen.getByText('Fetching history… 63%')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('shows a history error message', () => {
    render(<Timeline message="GitHub is busy — try again in 7 minutes" />);
    expect(screen.getByText('GitHub is busy — try again in 7 minutes')).toBeInTheDocument();
  });
});
