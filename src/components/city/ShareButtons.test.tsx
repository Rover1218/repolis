// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareButtons } from './ShareButtons';

const blob = new Blob(['png'], { type: 'image/png' });
let writeText: ReturnType<typeof vi.fn>;
let click: ReturnType<typeof vi.spyOn>;
let download: string | null;
let attachedOnClick: boolean | null;

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  download = null;
  attachedOnClick = null;
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    download = this.download;
    attachedOnClick = document.body.contains(this);
  });
});

afterEach(() => {
  cleanup();
  click.mockRestore();
  vi.useRealTimers();
});

describe('ShareButtons copy link', () => {
  it('writes location.href, says Copied, then reverts after 2 s', async () => {
    render(<ShareButtons fullName="facebook/react" onSaveImage={() => Promise.resolve(blob)} />);
    await press('Copy link');
    expect(writeText).toHaveBeenCalledWith(location.href);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });

  it("says Couldn't copy when the clipboard rejects", async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<ShareButtons fullName="facebook/react" onSaveImage={() => Promise.resolve(blob)} />);
    await press('Copy link');
    expect(screen.getByRole('button', { name: "Couldn't copy" })).toBeTruthy();
  });

  it("says Couldn't copy when navigator.clipboard is missing", async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<ShareButtons fullName="facebook/react" onSaveImage={() => Promise.resolve(blob)} />);
    await press('Copy link');
    expect(screen.getByRole('button', { name: "Couldn't copy" })).toBeTruthy();
  });
});

describe('ShareButtons save image', () => {
  it('downloads {owner}-{repo}-repolis.png via an object URL, Safari-safe', async () => {
    const onSaveImage = vi.fn(() => Promise.resolve(blob));
    render(<ShareButtons fullName="facebook/react" onSaveImage={onSaveImage} />);
    await press('Save image');
    expect(onSaveImage).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(download).toBe('facebook-react-repolis.png');
    // Safari needs the anchor in the document, and the URL alive until the click has been handled.
    expect(attachedOnClick).toBe(true);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it("says Couldn't save for 2 s when the screenshot fails", async () => {
    render(<ShareButtons fullName="facebook/react" onSaveImage={() => Promise.reject(new Error('x'))} />);
    await press('Save image');
    expect(screen.getByRole('button', { name: "Couldn't save" })).toBeTruthy();
    expect(click).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Save image' })).toBeTruthy();
  });

  it('disables Save image when no screenshot is available', () => {
    render(<ShareButtons fullName="facebook/react" onSaveImage={null} />);
    expect((screen.getByRole('button', { name: 'Save image' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
