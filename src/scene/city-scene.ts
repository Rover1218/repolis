import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { CityLayout } from '@/lib/city/layout';
import { CityError } from '@/lib/errors';
import { CameraRig } from './camera-rig';
import { CityMesh, EASE_RATE, HIDDEN_HEIGHT } from './city-mesh';
import { createBuildingMaterial, createHoloUniforms, type HoloUniforms } from './holo-material';
import { SceneInput } from './input';
import { createLights } from './lights';
import type { Quality } from './quality';
import { createDistrictOutlines, createStage, type SceneGroup } from './stage';
import { BACKGROUND, BLOOM_RADIUS, BLOOM_THRESHOLD, ENV_BLUR_SIGMA, EXPOSURE, SOLID_LIGHT } from './style';

export interface CitySceneOptions {
  quality: Quality;
  reducedMotion: boolean;
}

export interface LabelPosition {
  kind: 'district' | 'block';
  /** Index into `layout.districts` or `layout.blocks`. */
  index: number;
  /** Canvas CSS pixels. */
  x: number;
  y: number;
  visible: boolean;
}

export type HoverCallback = (id: number | null, clientX: number, clientY: number) => void;

const FOV = 50;
const NEAR = 0.05;
const FAR = 600;
/** Dust sits up to 7 radii out and the camera may orbit 5 radii away. */
const FAR_PER_RADIUS = 12;
const DAMPING = 0.08;
const MIN_DISTANCE = 0.4;
const MAX_DISTANCE_PER_RADIUS = 5;
/** Tiny repos still get a stage big enough for the projector base and a tall tower. */
const MIN_SCENE_RADIUS = 6;
const MAX_FRAME_DT = 0.1;
const MIN_TOP = 0.1;
const DISTRICT_LABEL_LIFT = 0.7;
const BLOCK_LABEL_LIFT = 0.5;
const BLOCK_LABEL_RANGE = 10;

function assertWebGL2(doc: Document): void {
  if (typeof WebGL2RenderingContext === 'undefined') throw new CityError('no-webgl');
  let gl: WebGL2RenderingContext | null;
  try {
    gl = doc.createElement('canvas').getContext('webgl2');
  } catch (cause) {
    throw new CityError('no-webgl', { cause });
  }
  if (!gl) throw new CityError('no-webgl');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

function createRenderer(canvas: HTMLCanvasElement, q: Quality): THREE.WebGLRenderer {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (cause) {
    throw new CityError('no-webgl', { cause });
  }
  renderer.setPixelRatio(q.pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = true;
  // r186 removed PCFSoftShadowMap (it warns and falls back to this).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

function createEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  try {
    return pmrem.fromScene(room, ENV_BLUR_SIGMA);
  } finally {
    room.dispose();
    pmrem.dispose();
  }
}

/** The three.js city: renderer, stage, buildings, camera rig and input. Driven by `frame(dt)`. */
export class CityScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly quality: Quality;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);
  private readonly controls: OrbitControls;
  private readonly rig: CameraRig;
  private readonly uniforms: HoloUniforms = createHoloUniforms();
  private readonly buildingMaterial: THREE.MeshStandardMaterial;
  private readonly envTarget: THREE.WebGLRenderTarget;
  private readonly composer: EffectComposer;
  private readonly passes: Pass[] = [];
  private readonly input: SceneInput;
  private readonly listeners = new AbortController();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly probe = new THREE.Vector3();
  private readonly ground = new THREE.Vector3();
  private readonly lastPickCamera = new THREE.Matrix4();
  private resizeObserver: ResizeObserver | null = null;
  private layout: CityLayout | null = null;
  private city: CityMesh | null = null;
  private stage: SceneGroup | null = null;
  private outlines: SceneGroup | null = null;
  private lights: SceneGroup | null = null;
  private labels: LabelPosition[] = [];
  private labelCentres = new Float32Array(0);
  private hoverCb: HoverCallback | null = null;
  private hoverId: number | null = null;
  private width = 0;
  private height = 0;
  private introduced = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, opts: CitySceneOptions) {
    assertWebGL2(canvas.ownerDocument);
    this.canvas = canvas;
    this.quality = opts.quality;
    this.renderer = createRenderer(canvas, opts.quality);
    this.scene.background = new THREE.Color(BACKGROUND);
    this.envTarget = createEnvironment(this.renderer);
    this.scene.environment = this.envTarget.texture;
    this.buildingMaterial = createBuildingMaterial(this.uniforms);

    this.input = new SceneInput(canvas, {
      onPointerDown: () => this.rig.cancel(),
      onPick: (x, y) => this.flyToPicked(x, y),
      onEscape: () => this.rig.stepOut(),
    });
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = DAMPING;
    this.controls.minDistance = MIN_DISTANCE;
    this.rig = new CameraRig(this.camera, this.controls, { reducedMotion: opts.reducedMotion });

    this.composer = new EffectComposer(this.renderer);
    this.passes.push(new RenderPass(this.scene, this.camera));
    if (opts.quality.bloom) {
      const size = this.renderer.getSize(new THREE.Vector2());
      this.passes.push(new UnrealBloomPass(size, SOLID_LIGHT.bloom, BLOOM_RADIUS, BLOOM_THRESHOLD));
    }
    this.passes.push(new OutputPass());
    for (const pass of this.passes) this.composer.addPass(pass);
    this.observeSize();
  }

  /** Builds a fresh city at height 0; the first call also starts the intro flight. */
  setLayout(layout: CityLayout): void {
    if (this.disposed) return;
    const radius = Math.max(layout.radius, MIN_SCENE_RADIUS);
    this.city?.dispose();
    this.city = new CityMesh(layout, this.buildingMaterial);
    this.stage = this.swap(this.stage, createStage(radius, this.quality, this.uniforms));
    this.outlines = this.swap(this.outlines, createDistrictOutlines(layout.districts));
    this.lights = this.swap(this.lights, createLights(radius, this.quality));
    this.scene.add(this.city.mesh);

    this.controls.maxDistance = radius * MAX_DISTANCE_PER_RADIUS;
    this.camera.far = Math.max(FAR, radius * FAR_PER_RADIUS);
    this.camera.updateProjectionMatrix();
    this.rig.setBounds({ radius, halfWidth: layout.halfWidth, streetZ: layout.streetZ });

    this.layout = layout;
    this.buildLabels(layout);
    this.lastPickCamera.makeScale(0, 0, 0);
    if (this.hoverId !== null) {
      this.hoverId = null;
      this.hoverCb?.(null, this.input.pointer.clientX, this.input.pointer.clientY);
    }
    if (!this.introduced) {
      this.introduced = true;
      this.rig.intro();
    }
  }

  setFrame(heights: Float32Array, heat: Float32Array): void {
    this.requireCity().setTargets(heights, heat);
  }

  startConstruction(delays: Float32Array): void {
    this.requireCity().startConstruction(delays);
  }

  /** All targets → 0. */
  collapse(): void {
    this.city?.collapse();
  }

  onHover(cb: HoverCallback): void {
    this.hoverCb = cb;
  }

  toggleDive(): void {
    if (this.rig.isInside()) this.rig.stepOut();
    else this.rig.diveIn();
  }

  isInside(): boolean {
    return this.rig.isInside();
  }

  /** Advances time, camera, walking and building easing, resolves hover, then renders. */
  frame(dt: number): void {
    if (this.disposed) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_FRAME_DT) : 0;
    this.uniforms.uTime.value += step;
    this.rig.walk(this.input.keys, step);
    this.rig.update(step);
    this.camera.updateMatrixWorld();
    const city = this.city;
    if (city) {
      city.update(step);
      const k = 1 - Math.exp(-step * EASE_RATE);
      const top = Math.max(MIN_TOP, city.maxHeight());
      this.uniforms.uTop.value += (top - this.uniforms.uTop.value) * k;
    }
    this.resolveHover();
    this.composer.render(step);
  }

  /**
   * One entry per district, then per sub-folder block, in canvas CSS pixels.
   * The array and its entries are reused between calls.
   */
  labelPositions(): LabelPosition[] {
    const city = this.city;
    if (!city) return this.labels;
    const districtTop = city.maxHeightPerDistrict();
    const blockTop = city.maxHeightPerBlock();
    for (let i = 0; i < this.labels.length; i += 1) {
      const label = this.labels[i];
      const isBlock = label.kind === 'block';
      const top = isBlock ? blockTop[label.index] : districtTop[label.index];
      const cx = this.labelCentres[2 * i];
      const cz = this.labelCentres[2 * i + 1];
      const p = this.probe.set(cx, top + (isBlock ? BLOCK_LABEL_LIFT : DISTRICT_LABEL_LIFT), cz).project(this.camera);
      label.x = (p.x * 0.5 + 0.5) * this.width;
      label.y = (-p.y * 0.5 + 0.5) * this.height;
      let visible = top > HIDDEN_HEIGHT && p.z <= 1;
      if (visible && isBlock) {
        visible = this.camera.position.distanceTo(this.ground.set(cx, 0, cz)) < BLOCK_LABEL_RANGE;
      }
      label.visible = visible;
    }
    return this.labels;
  }

  /** Renders once, then encodes the canvas as PNG. */
  screenshot(): Promise<Blob> {
    if (this.disposed) return Promise.reject(new CityError('upstream'));
    this.composer.render(0);
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new CityError('upstream'))), 'image/png');
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.input.dispose();
    this.listeners.abort();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.controls.dispose();
    this.city?.dispose();
    this.stage?.dispose();
    this.outlines?.dispose();
    this.lights?.dispose();
    this.city = null;
    this.stage = null;
    this.outlines = null;
    this.lights = null;
    this.buildingMaterial.dispose();
    for (const pass of this.passes) pass.dispose();
    this.composer.dispose();
    this.scene.environment = null;
    this.envTarget.dispose();
    this.renderer.dispose();
    this.hoverCb = null;
  }

  private requireCity(): CityMesh {
    if (!this.city) throw new Error('CityScene: call setLayout() first');
    return this.city;
  }

  private swap(previous: SceneGroup | null, next: SceneGroup): SceneGroup {
    previous?.dispose();
    this.scene.add(next.group);
    return next;
  }

  private buildLabels(layout: CityLayout): void {
    const boxes = [...layout.districts, ...layout.blocks];
    const districtCount = layout.districts.length;
    this.labels = boxes.map((_, i) =>
      i < districtCount
        ? { kind: 'district', index: i, x: 0, y: 0, visible: false }
        : { kind: 'block', index: i - districtCount, x: 0, y: 0, visible: false },
    );
    this.labelCentres = new Float32Array(boxes.length * 2);
    boxes.forEach((b, i) => {
      this.labelCentres[2 * i] = b.x0 + b.w / 2;
      this.labelCentres[2 * i + 1] = b.z0 + b.d / 2;
    });
  }

  private observeSize(): void {
    const parent = this.canvas.parentElement;
    if (parent && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(parent);
    } else {
      this.canvas.ownerDocument.defaultView?.addEventListener('resize', () => this.resize(), {
        signal: this.listeners.signal,
      });
    }
    this.resize();
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    const win = this.canvas.ownerDocument.defaultView;
    const w = Math.floor(parent?.clientWidth ?? win?.innerWidth ?? 0);
    const h = Math.floor(parent?.clientHeight ?? win?.innerHeight ?? 0);
    if (w <= 0 || h <= 0 || (w === this.width && h === this.height)) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Raycasts at most once per frame, only when the pointer, camera or city changed. */
  private resolveHover(): void {
    const p = this.input.pointer;
    const moved = this.input.consumeMoved();
    const city = this.city;
    if (!city || !p.inside || p.dragging) {
      this.setHover(null, false);
      return;
    }
    const cameraMoved = !this.lastPickCamera.equals(this.camera.matrixWorld);
    if (!moved && !cameraMoved && city.isSettled()) return;
    this.lastPickCamera.copy(this.camera.matrixWorld);
    this.setHover(this.pickAt(p.offsetX, p.offsetY), moved);
  }

  private setHover(id: number | null, moved: boolean): void {
    if (id === this.hoverId && !(moved && id !== null)) return;
    this.hoverId = id;
    this.hoverCb?.(id, this.input.pointer.clientX, this.input.pointer.clientY);
  }

  private pickAt(offsetX: number, offsetY: number): number | null {
    if (!this.city || this.width === 0 || this.height === 0) return null;
    this.ndc.set((offsetX / this.width) * 2 - 1, -(offsetY / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.city.pick(this.raycaster);
  }

  private flyToPicked(offsetX: number, offsetY: number): void {
    const id = this.pickAt(offsetX, offsetY);
    if (id === null || !this.layout || !this.city) return;
    const x = this.layout.positions[2 * id];
    const z = this.layout.positions[2 * id + 1];
    this.rig.flyToBuilding(x, z, this.city.heightOf(id));
  }
}
