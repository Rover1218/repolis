import { getManifest } from '@/lib/data/city-data';
import { CACHE_IMMUTABLE, clientKeyFrom, jsonError, jsonOk, parseHead, parseRef } from '@/lib/data/http';

export const maxDuration = 60;

export async function GET(request: Request, ctx: { params: Promise<{ owner: string; repo: string; head: string }> }): Promise<Response> {
  try {
    const { owner, repo, head } = await ctx.params;
    const manifest = await getManifest(parseRef(owner, repo), parseHead(head), clientKeyFrom(request));
    return jsonOk(manifest, CACHE_IMMUTABLE);
  } catch (err) {
    return jsonError(err, 'manifest');
  }
}
