import { beforeEach, describe, expect, it, vi } from 'vitest';
import Image, { alt, contentType, size } from './opengraph-image';

const getLatestCity = vi.hoisted(() => vi.fn());
vi.mock('@/lib/data/city-data', () => ({ getLatestCity }));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })),
}));

const og = vi.hoisted(() => ({ failNext: false }));
vi.mock('next/og', async () => {
  const actual = await vi.importActual<typeof import('next/og')>('next/og');
  class FlakyImageResponse extends actual.ImageResponse {
    constructor(...args: ConstructorParameters<typeof actual.ImageResponse>) {
      if (og.failNext) {
        og.failNext = false;
        throw new Error('satori failed');
      }
      super(...args);
    }
  }
  return { ...actual, ImageResponse: FlakyImageResponse };
});

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

async function render(owner: string, repo: string) {
  const res = await Image({ params: Promise.resolve({ owner, repo }) });
  const body = new Uint8Array(await res.arrayBuffer());
  return { res, body };
}

function expectPng({ res, body }: Awaited<ReturnType<typeof render>>) {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/png');
  expect(body.length).toBeGreaterThan(100);
  expect(Array.from(body.slice(0, 4))).toEqual(PNG_MAGIC);
}

beforeEach(() => {
  getLatestCity.mockReset();
  og.failNext = false;
});

describe('opengraph-image', () => {
  it('exports the 1200x630 png metadata', () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
    expect(alt).toBeTruthy();
  });

  it('renders the skyline card and rate-limits under og:<first forwarded ip>', async () => {
    getLatestCity.mockResolvedValue({
      fullName: 'facebook/react',
      files: [
        ['src/a.ts', 1200],
        ['src/b.ts', 90000],
        ['lib/c.ts', 400],
      ],
    });
    expectPng(await render('facebook', 'react'));
    expect(getLatestCity).toHaveBeenCalledWith({ owner: 'facebook', repo: 'react' }, 'og:1.2.3.4');
  });

  it('falls back to the generic card when the lookup rejects', async () => {
    getLatestCity.mockRejectedValue(new Error('rate limited'));
    expectPng(await render('facebook', 'react'));
  });

  it('falls back to the generic card for invalid params without calling GitHub', async () => {
    expectPng(await render('-bad', 'react'));
    expect(getLatestCity).not.toHaveBeenCalled();
  });

  it('falls back to the generic card when the skyline data is malformed', async () => {
    getLatestCity.mockResolvedValue({ fullName: 'facebook/react', files: null });
    expectPng(await render('facebook', 'react'));
  });

  it('falls back to the generic card when rendering the skyline card throws', async () => {
    getLatestCity.mockResolvedValue({ fullName: 'facebook/react', files: [['a.ts', 10]] });
    og.failNext = true;
    expectPng(await render('facebook', 'react'));
    expect(og.failNext).toBe(false);
  });
});
