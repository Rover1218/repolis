import * as THREE from 'three';
import type { Quality } from './quality';
import type { SceneGroup } from './stage';
import { SOLID_LIGHT } from './style';

const SHADOW_MARGIN = 4;

/** Key light (casts shadows), sky/ground fill and accent rim from behind — proto L387–401. */
export function createLights(radius: number, q: Quality): SceneGroup {
  const fill = new THREE.HemisphereLight('#9fd8ff', '#0a0f14', 1.1);

  const key = new THREE.DirectionalLight('#e8f8ff', 3.0);
  key.position.set(radius * 0.9, radius * 1.6, radius * 0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  const cam = key.shadow.camera;
  cam.left = -radius - SHADOW_MARGIN;
  cam.right = radius + SHADOW_MARGIN;
  cam.top = radius + SHADOW_MARGIN;
  cam.bottom = -radius - SHADOW_MARGIN;
  cam.near = 1;
  cam.far = radius * 5;
  cam.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;

  // The prototype creates the rim white and applyStyle() then tints it with the look's accent.
  const rim = new THREE.DirectionalLight(SOLID_LIGHT.a, 1.6);
  rim.position.set(-radius * 1.2, radius * 0.5, -radius * 1.1);

  const group = new THREE.Group();
  group.add(fill, key, rim);
  return {
    group,
    dispose: () => {
      group.removeFromParent();
      fill.dispose();
      key.dispose();
      rim.dispose();
    },
  };
}
