import { getBatch } from '@/lib/data/city-data';
import { CACHE_IMMUTABLE, clientKeyFrom, jsonError, jsonOk, parseBatchIndex, parseHead, parseRef } from '@/lib/data/http';

export const maxDuration = 60;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ owner: string; repo: string; head: string; k: string }> },
): Promise<Response> {
  try {
    const { owner, repo, head, k } = await ctx.params;
    const batch = await getBatch(parseRef(owner, repo), parseHead(head), parseBatchIndex(k), clientKeyFrom(request));
    return jsonOk(batch, CACHE_IMMUTABLE);
  } catch (err) {
    return jsonError(err, 'batch');
  }
}
