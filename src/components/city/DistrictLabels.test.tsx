// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutCity } from '@/lib/city/layout';
import type { LabelPosition } from '@/scene/city-scene';
import { DistrictLabels, type LabelsHandle } from './DistrictLabels';

// `src` holds under 35% of the files, so it stays one district with sub-folder blocks.
const layout = layoutCity([
  'src/ui/button.ts',
  'src/core/a.ts',
  ...['docs', 'lib', 'test', 'scripts'].flatMap((d) => [`${d}/1.ts`, `${d}/2.ts`]),
]);

function positions(visible: (p: LabelPosition) => boolean): LabelPosition[] {
  const all: LabelPosition[] = [
    ...layout.districts.map((_, index): LabelPosition => ({ kind: 'district', index, x: 10, y: 20, visible: false })),
    ...layout.blocks.map((_, index): LabelPosition => ({ kind: 'block', index, x: 30, y: 40, visible: false })),
  ];
  return all.map((p) => ({ ...p, visible: visible(p) }));
}

afterEach(cleanup);

describe('DistrictLabels', () => {
  it('renders district names and sub-folder names, hidden until positioned', () => {
    expect(layout.blocks.length).toBeGreaterThan(0);
    render(<DistrictLabels layout={layout} />);
    const block = layout.blocks[0].name;
    const blockLabel = screen.getByText(block.slice(block.lastIndexOf('/') + 1));
    expect(blockLabel).not.toBeVisible();
    expect(screen.getByText(layout.districts[0].name)).not.toBeVisible();
  });

  it('shows districts and only the blocks the scene marks visible', () => {
    const ref = createRef<LabelsHandle>();
    render(<DistrictLabels ref={ref} layout={layout} />);
    act(() => ref.current?.update(positions((p) => p.kind === 'district')));
    const district = screen.getByText(layout.districts[0].name);
    expect(district).toBeVisible();
    expect(district.style.transform).toBe('translate3d(10px, 20px, 0) translate(-50%, -100%)');
    const block = layout.blocks[0].name;
    const blockLabel = screen.getByText(block.slice(block.lastIndexOf('/') + 1));
    expect(blockLabel).not.toBeVisible();
    act(() => ref.current?.update(positions(() => true)));
    expect(blockLabel).toBeVisible();
  });

  it('ignores positions for a layout React has not rendered yet', () => {
    const ref = createRef<LabelsHandle>();
    render(<DistrictLabels ref={ref} layout={layout} />);
    act(() => ref.current?.update(positions(() => true).slice(1)));
    expect(screen.getByText(layout.districts[0].name)).not.toBeVisible();
  });
});
