import * as THREE from 'three';
import type { DistrictBox } from '@/lib/city/layout';
import type { HoloUniforms } from './holo-material';
import type { Quality } from './quality';
import { mulberry32 } from './random';
import { SOLID_LIGHT } from './style';

// Shader strings ported verbatim from the look prototype (L299–360).
const WORLD_VS = /* glsl */ `
  varying vec3 vPos;
  varying vec2 vUv;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPos = world.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const FLOOR_FS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColA;
  uniform float uRadius;
  varying vec3 vPos;
  float gridLine(vec2 p) {
    vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main() {
    float r = length(vPos.xz) / uRadius;
    float fade = 1.0 - smoothstep(0.75, 1.0, r);
    float grid = gridLine(vPos.xz) * 0.08 + gridLine(vPos.xz * 0.2) * 0.18;
    float ring = smoothstep(0.012, 0.0, abs(r - 1.0)) * 0.7 + smoothstep(0.008, 0.0, abs(r - 0.985)) * 0.3;
    float pulse = smoothstep(0.04, 0.0, abs(r - fract(uTime * 0.12))) * 0.2;
    gl_FragColor = vec4(uColA, (grid + pulse) * fade + ring);
  }`;

const BEAM_FS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColA;
  varying vec2 vUv;
  void main() {
    float streak = 0.6 + 0.4 * sin(vUv.x * 160.0 + uTime * 0.5) * sin(vUv.x * 37.0 - uTime * 0.3);
    gl_FragColor = vec4(uColA, pow(1.0 - vUv.y, 1.8) * 0.09 * streak);
  }`;

const MOTES_VS = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uBeamH;
  uniform float uTopR;
  uniform float uBaseR;
  uniform float uPixel;
  varying float vAlpha;
  void main() {
    float s = fract(position.z + uTime * (0.04 + aSeed * 0.05));
    float r = mix(uBaseR, uTopR, s) * position.y;
    vec3 p = vec3(cos(position.x) * r, -uBeamH + s * uBeamH, sin(position.x) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPixel * (0.6 + aSeed) * (24.0 / -mv.z);
    vAlpha = sin(s * 3.14159) * 0.45;
  }`;

const MOTES_FS = /* glsl */ `
  uniform vec3 uColA;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(uColA, smoothstep(0.5, 0.0, d) * vAlpha);
  }`;

export interface SceneGroup {
  group: THREE.Group;
  dispose(): void;
}

const DISC_MARGIN = 2;
const BEAM_PER_RADIUS = 0.55;
const BEAM_BASE_RADIUS = 1.4;
const SEGMENTS = 128;
const DUST_COUNT = 900;
const STAGE_SEED = 11;
const OUTLINE_PAD = 0.3;
const OUTLINE_Y = 0.01;
const BASE_RINGS: ReadonlyArray<readonly [number, number]> = [
  [1.15, 1.55],
  [2.95, 3.1],
];

const additive = () => ({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

/** Removes the group from its parent and frees every geometry and material in it. */
export function disposeGroup(group: THREE.Object3D): void {
  group.removeFromParent();
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line)) return;
    o.geometry.dispose();
    const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materials) m.dispose();
  });
}

/** Dark glass that catches shadows, with the glowing grid on top. */
function createFloor(discRadius: number, u: HoloUniforms): THREE.Object3D[] {
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(discRadius, SEGMENTS).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: '#0a141b',
      roughness: 0.35,
      metalness: 0.4,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
  );
  glass.receiveShadow = true;
  glass.renderOrder = 0;
  const grid = new THREE.Mesh(
    new THREE.CircleGeometry(discRadius, SEGMENTS).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uColA: u.uColA, uRadius: { value: discRadius } },
      vertexShader: WORLD_VS,
      fragmentShader: FLOOR_FS,
      ...additive(),
    }),
  );
  grid.position.y = 0.003;
  grid.renderOrder = 1;
  return [glass, grid];
}

/** Projector beam, its base and the two glowing rings on the base. */
function createProjector(discRadius: number, beamHeight: number, u: HoloUniforms): THREE.Object3D[] {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(discRadius * 0.97, BEAM_BASE_RADIUS, beamHeight, 96, 1, true),
    new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uColA: u.uColA },
      vertexShader: WORLD_VS,
      fragmentShader: BEAM_FS,
      ...additive(),
    }),
  );
  beam.position.y = -beamHeight / 2;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.9, 0.9, 64),
    new THREE.MeshStandardMaterial({ color: '#0d1820', roughness: 0.35, metalness: 0.6 }),
  );
  base.position.y = -beamHeight - 0.45;
  const rings = BASE_RINGS.map(([inner, outer]) => {
    const material = new THREE.MeshBasicMaterial({ ...additive(), opacity: 0.8, color: SOLID_LIGHT.a });
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64).rotateX(-Math.PI / 2), material);
    ring.position.y = -beamHeight + 0.01;
    return ring;
  });
  return [beam, base, ...rings];
}

/** Motes rising through the beam. */
function createMotes(count: number, discRadius: number, beamHeight: number, q: Quality, u: HoloUniforms, rand: () => number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = rand() * Math.PI * 2;
    positions[i * 3 + 1] = Math.sqrt(rand());
    positions[i * 3 + 2] = rand();
    seeds[i] = rand();
  }
  const geometry = new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(positions, 3))
    .setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const motes = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: u.uTime,
        uColA: u.uColA,
        uBeamH: { value: beamHeight },
        uTopR: { value: discRadius * 0.95 },
        uBaseR: { value: BEAM_BASE_RADIUS },
        uPixel: { value: q.pixelRatio },
      },
      vertexShader: MOTES_VS,
      fragmentShader: MOTES_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  motes.frustumCulled = false;
  return motes;
}

/** Distant dust on a shell 4–7 radii out. */
function createDust(radius: number, rand: () => number): THREE.Points {
  const positions = new Float32Array(DUST_COUNT * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < DUST_COUNT; i += 1) {
    v.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(radius * (4 + rand() * 3));
    v.toArray(positions, i * 3);
  }
  return new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
    new THREE.PointsMaterial({
      color: '#5f8a94',
      size: 1.3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
}

/** Glass floor, grid, projector beam with base, motes and dust, sized to the city radius. */
export function createStage(radius: number, q: Quality, u: HoloUniforms): SceneGroup {
  const discRadius = radius + DISC_MARGIN;
  const beamHeight = radius * BEAM_PER_RADIUS;
  const rand = mulberry32(STAGE_SEED);
  const group = new THREE.Group();
  group.add(...createFloor(discRadius, u), ...createProjector(discRadius, beamHeight, u));
  if (q.motes > 0) group.add(createMotes(q.motes, discRadius, beamHeight, q, u, rand));
  group.add(createDust(radius, rand));
  return { group, dispose: () => disposeGroup(group) };
}

/** Glowing outline around each district, just above the floor. */
export function createDistrictOutlines(districts: readonly DistrictBox[]): SceneGroup {
  const points = new Float32Array(districts.length * 8 * 3);
  const y = OUTLINE_Y;
  districts.forEach((d, i) => {
    const x0 = d.x0 - OUTLINE_PAD;
    const z0 = d.z0 - OUTLINE_PAD;
    const x1 = d.x0 + d.w + OUTLINE_PAD;
    const z1 = d.z0 + d.d + OUTLINE_PAD;
    points.set([x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0], i * 24);
  });
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(points, 3)),
    new THREE.LineBasicMaterial({
      color: SOLID_LIGHT.a,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  lines.renderOrder = 2;
  const group = new THREE.Group();
  group.add(lines);
  return { group, dispose: () => disposeGroup(group) };
}
