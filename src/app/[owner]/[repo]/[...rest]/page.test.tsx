import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeepLink from './page';

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => nav);

const visit = (owner: string, repo: string, rest: string[]) => DeepLink({ params: Promise.resolve({ owner, repo, rest }) });

beforeEach(() => vi.clearAllMocks());

describe('GitHub deep links', () => {
  it('sends /owner/repo/tree/main/x to the repo city', async () => {
    await expect(visit('facebook', 'react', ['tree', 'main', 'packages', 'react'])).rejects.toThrow('NEXT_REDIRECT');
    expect(nav.redirect).toHaveBeenCalledWith('/facebook/react');
    expect(nav.notFound).not.toHaveBeenCalled();
  });

  it('keeps the casing it was given (the city page canonicalises)', async () => {
    await expect(visit('Facebook', 'React.js', ['pull', '1'])).rejects.toThrow('NEXT_REDIRECT');
    expect(nav.redirect).toHaveBeenCalledWith('/Facebook/React.js');
  });

  it.each([
    ['-bad', 'react'],
    ['facebook', '..'],
    ['face book', 'react'],
  ])('is not found for owner %j and repo %j', async (owner, repo) => {
    await expect(visit(owner, repo, ['tree', 'main'])).rejects.toThrow('NEXT_NOT_FOUND');
    expect(nav.redirect).not.toHaveBeenCalled();
  });
});
