import { notFound, redirect } from 'next/navigation';
import { isValidOwner, isValidRepoName } from '@/lib/repo-ref';

interface DeepLinkProps {
  params: Promise<{ owner: string; repo: string; rest: string[] }>;
}

/**
 * A GitHub deep link pasted after the domain (/owner/repo/tree/main/src, /owner/repo/pull/1, …)
 * opens the repo's city. Only well-formed names are redirected, so this is never an open redirect.
 */
export default async function DeepLink({ params }: DeepLinkProps): Promise<never> {
  const { owner, repo } = await params;
  if (!isValidOwner(owner) || !isValidRepoName(repo)) notFound();
  redirect(`/${owner}/${repo}`);
}
