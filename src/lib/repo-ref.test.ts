import { describe, expect, it } from 'vitest';
import { parseRepoInput } from './repo-ref';

describe('parseRepoInput', () => {
  it.each([
    ['https://github.com/facebook/react', 'facebook', 'react'],
    ['github.com/vercel/next.js', 'vercel', 'next.js'],
    ['facebook/react', 'facebook', 'react'],
    ['https://www.github.com/facebook/react.git', 'facebook', 'react'],
    ['https://github.com/facebook/react/tree/main/packages', 'facebook', 'react'],
    ['  facebook/react/  ', 'facebook', 'react'],
    ['http://github.com/Facebook/React', 'Facebook', 'React'],
    ['git@github.com:facebook/react.git', 'facebook', 'react'],
    ['https://github.com/facebook/react?tab=readme-ov-file', 'facebook', 'react'],
    ['https://github.com/facebook/react#readme', 'facebook', 'react'],
    ['github.com/facebook/react.git?x=1', 'facebook', 'react'],
    ['https://github.com/facebook/react/tree/main?x=1', 'facebook', 'react'],
  ])('parses %s', (input, owner, repo) => expect(parseRepoInput(input)).toEqual({ owner, repo }));

  it.each(['', 'react', 'https://gitlab.com/a/b', 'bad name/x', '-abc/x', 'a/..', 'https://github.com/facebook'])(
    'rejects %s',
    (input) => expect(parseRepoInput(input)).toBeNull(),
  );
});
