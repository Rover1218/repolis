import { headers } from 'next/headers';
import { ImageResponse } from 'next/og';
import { getLatestCity } from '@/lib/data/city-data';
import { skylineBars } from '@/lib/city/skyline';
import { isValidOwner, isValidRepoName } from '@/lib/repo-ref';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// Next's `alt` export is static (it cannot see route params), so the alt is generic.
export const alt = 'A GitHub repo as a city on Repolis';

const BUCKETS = 48;
const SKYLINE_HEIGHT = 340;
const GROUND = '#010407';
const LIGHT = '#eaf0ff';

async function clientKey(): Promise<string> {
  const forwarded = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
  return `og:${forwarded || 'unknown'}`;
}

async function loadBars(params: { owner: string; repo: string }): Promise<{ name: string; bars: number[] } | null> {
  try {
    if (!isValidOwner(params.owner) || !isValidRepoName(params.repo)) return null;
    const latest = await getLatestCity(params, await clientKey());
    return { name: latest.fullName, bars: skylineBars(latest.files, BUCKETS) };
  } catch {
    return null;
  }
}

function Card({ name, bars }: { name: string | null; bars: number[] | null }) {
  const heights = bars ?? Array.from({ length: BUCKETS }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 0.7)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: GROUND, padding: 64 }}>
      <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#8f9bff', letterSpacing: 2 }}>Repolis</div>
      <div style={{ display: 'flex', fontSize: name && name.length > 28 ? 56 : 72, fontWeight: 700, color: LIGHT, marginTop: 16 }}>
        {name ?? 'Any GitHub repo, as a city'}
      </div>
      <div style={{ display: 'flex', flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', height: SKYLINE_HEIGHT, gap: 4, borderBottom: '2px solid #1a2140' }}>
        {heights.map((h, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flex: 1,
              height: `${Math.max(h, 0.03) * 100}%`,
              background: 'linear-gradient(to top, #5b6cff, #ff5ad6)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const result = await loadBars(await params);
  if (result) {
    try {
      return new ImageResponse(<Card name={result.name} bars={result.bars} />, { ...size });
    } catch (error) {
      console.error('og: skyline card failed, using generic card', error);
    }
  }
  return new ImageResponse(<Card name={null} bars={null} />, { ...size });
}
