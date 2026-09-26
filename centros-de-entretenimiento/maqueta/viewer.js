/* Faro 33 — Maqueta 3D: visor compartido (renderer, ambiente, cámara isométrica, post-proceso, encuadre).
   Lo usan la página de la maqueta (main.js) y el teaser de la portada (teaser.js). */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildScene } from './scene.js';

export const AZ = THREE.MathUtils.degToRad(32);
export const EL = THREE.MathUtils.degToRad(30);
const R = 20;

/* Devuelve null si no hay WebGL. `low`: sin oclusión ambiental ni MSAA, sombras más chicas, DPR ≤ 1.5. */
export function createViewer(canvas, design, { low = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;

  const built = buildScene(design);
  const { scene, bounds, room } = built;
  scene.traverse((o) => { if (o.isDirectionalLight) o.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048); });

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const target = new THREE.Vector3(room.W / 2, 0.9, room.D / 2);
  function setAngles(az, el) {
    camera.position.set(
      target.x + Math.sin(az) * Math.cos(el) * R,
      target.y + Math.sin(el) * R,
      target.z + Math.cos(az) * Math.cos(el) * R
    );
    camera.lookAt(target);
  }
  function getAngles() {
    const o = camera.position.clone().sub(target);
    return [Math.atan2(o.x, o.z), Math.asin(o.y / o.length())];
  }
  setAngles(AZ, EL);

  // post-proceso: render → oclusión ambiental → bloom → tone mapping / sRGB
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: low ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (!low) {
    const gtao = new GTAOPass(scene, camera, 512, 512);
    gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.05, 0.35, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* Aplica los canales a la escena; el bloom crece con la noche. */
  function apply(v) {
    built.apply(v);
    bloom.strength = 0.03 + 0.4 * v.noche;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  }

  /* Encuadra la maqueta completa dentro del rectángulo libre (insets en px) de un lienzo w × h. */
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const v = new THREE.Vector3();
  function fit(w, h, ins, margin = 1.02) {
    camera.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      v.copy(c).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const aw = Math.max(120, w - ins.left - ins.right), ah = Math.max(120, h - ins.top - ins.bottom);
    const s = Math.max((maxX - minX) / aw, (maxY - minY) / ah) * margin;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const ax = ins.left + aw / 2, ay = ins.top + ah / 2;
    camera.left = cx - ax * s; camera.right = camera.left + w * s;
    camera.top = cy + ay * s; camera.bottom = camera.top - h * s;
    camera.updateProjectionMatrix();
  }

  return { ...built, renderer, camera, composer, bloom, target, apply, setAngles, getAngles, resize, fit, render: () => composer.render() };
}
