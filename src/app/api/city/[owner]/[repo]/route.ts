import { getLatestCity } from '@/lib/data/city-data';
import { CACHE_LATEST, jsonError, jsonOk, parseRef } from '@/lib/data/http';

export const maxDuration = 60;

export async function GET(_request: Request, ctx: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> {
  try {
    const { owner, repo } = await ctx.params;
    return jsonOk(await getLatestCity(parseRef(owner, repo)), CACHE_LATEST);
  } catch (err) {
    return jsonError(err, 'latest');
  }
}
