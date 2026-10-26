export interface Quality {
  pixelRatio: number;
  shadowMapSize: 1024 | 2048;
  bloom: boolean;
  motes: number;
}

export interface DeviceHints {
  coarsePointer: boolean;
  /** `navigator.deviceMemory` in GB, when the browser reports it. */
  deviceMemory?: number;
  devicePixelRatio: number;
}

interface Tier {
  maxPixelRatio: number;
  shadowMapSize: 1024 | 2048;
  bloom: boolean;
  motes: number;
}

const DESKTOP: Tier = { maxPixelRatio: 1.75, shadowMapSize: 2048, bloom: true, motes: 420 };
const PHONE: Tier = { maxPixelRatio: 1.5, shadowMapSize: 1024, bloom: true, motes: 160 };
const LOW_MEMORY: Tier = { maxPixelRatio: 1, shadowMapSize: 1024, bloom: false, motes: 0 };

/** Devices reporting this much memory or less get the low preset. */
const LOW_MEMORY_GB = 2;

function tierFor(d: DeviceHints): Tier {
  if (d.deviceMemory !== undefined && d.deviceMemory <= LOW_MEMORY_GB) return LOW_MEMORY;
  return d.coarsePointer ? PHONE : DESKTOP;
}

export function pickQuality(d: DeviceHints): Quality {
  const tier = tierFor(d);
  const dpr = Number.isFinite(d.devicePixelRatio) && d.devicePixelRatio > 0 ? d.devicePixelRatio : 1;
  return {
    pixelRatio: Math.min(dpr, tier.maxPixelRatio),
    shadowMapSize: tier.shadowMapSize,
    bloom: tier.bloom,
    motes: tier.motes,
  };
}
