import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CityView } from '@/components/city/CityView';
import { isValidOwner, isValidRepoName, type RepoRef } from '@/lib/repo-ref';

interface CityPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

/** The route's owner/repo, or a 404 for anything that can't be a GitHub repo. */
async function repoFrom(params: CityPageProps['params']): Promise<RepoRef> {
  const { owner, repo } = await params;
  if (!isValidOwner(owner) || !isValidRepoName(repo)) notFound();
  return { owner, repo };
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { owner, repo } = await repoFrom(params);
  return {
    title: `${owner}/${repo} · Repolis`,
    description: `Watch ${owner}/${repo} grow from its first commit to today as a 3D city.`,
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const { owner, repo } = await repoFrom(params);
  return <CityView owner={owner} repo={repo} />;
}
