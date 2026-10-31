/**
 * 空气里的浮尘 / 光点。数量、分布、颜色、漂移速度、远近淡出都可配置。
 */
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, color, time, instanceIndex, hash,
  sin, cos, step, uniform, cameraPosition, positionWorld
} from 'three/tsl';
import { TIMELINE_CONFIG } from './config.js';

export function createDust(scene, count, opts = {}) {
  const base = TIMELINE_CONFIG.dust;
  const cfg = {
    ...base,
    ...opts,
    colors: { ...base.colors, ...opts.colors }
  };
  const particleCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : cfg.count;
  if (particleCount === 0) return { mesh: null, speed: uniform(cfg.speed) };

  const geo = new THREE.OctahedronGeometry(cfg.size, 0);
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    toneMapped: false
  });

  const speed = uniform(cfg.speed);

  // 粉尘按随机值分成两色，不做颜色混合。
  mat.colorNode = Fn(() => {
    const r = hash(instanceIndex.add(11.7));
    return color(cfg.colors.a)
      .mix(color(cfg.colors.b), step(0.5, r))
      .mul(cfg.tintMultiplier);
  })();

  mat.positionNode = Fn(() => {
    const r1 = hash(instanceIndex.add(0.3));
    const r2 = hash(instanceIndex.add(5.1));
    const r3 = hash(instanceIndex.add(9.7));
    const ph = hash(instanceIndex.add(17.3)).mul(6.283);

    const baseX = r1.sub(0.5).mul(cfg.spreadX);
    const baseY = r2.mul(cfg.spreadY).add(1.0);
    const baseZ = r3.sub(0.5).mul(cfg.spreadZ).add(cfg.zOffset);

    const t = time.mul(cfg.driftSpeed).mul(speed);
    const dy = sin(t.add(ph)).mul(cfg.driftY);
    const dx = cos(t.mul(0.7).add(ph)).mul(cfg.driftX);

    return vec3(baseX.add(dx), baseY.add(dy), baseZ);
  })();

  mat.opacityNode = Fn(() => {
    const dist = positionWorld.sub(cameraPosition).length();
    const near = step(dist, float(cfg.fadeFar));
    return near.mul(cfg.opacity).add(cfg.minOpacity);
  })();

  const mesh = new THREE.InstancedMesh(geo, mat, particleCount);
  mesh.frustumCulled = false;
  mesh.name = 'dust';
  scene.add(mesh);

  return { mesh, speed };
}
