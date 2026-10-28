/**
 * 空气里的浮尘 / 光点：一次 InstancedMesh 画 900 颗，
 * 位置与颜色完全在 TSL 里用 instanceIndex 派生（不需要逐实例属性，也不需要每帧改 CPU 数据）。
 */
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, mix, color, time, positionLocal, instanceIndex, hash,
  sin, cos, smoothstep, uniform, dot, normalize, cameraPosition, positionWorld
} from 'three/tsl';

export function createDust(scene, count = 900, opts = {}) {
  const {
    spreadX = 190,
    spreadY = 34,
    spreadZ = 90,
    zOffset = -30,
    size = 0.075
  } = opts;

  const geo = new THREE.OctahedronGeometry(size, 0);
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    toneMapped: false
  });

  const speed = uniform(1.0);
  const tintA = color(0x6fe8ff);
  const tintB = color(0xff6ad9);

  // 每颗粒子的稳定随机数：hash(instanceIndex + k)
  mat.colorNode = Fn(() => {
    const r = hash(instanceIndex.add(11.7));
    return mix(tintA, tintB, r).mul(1.9);
  })();

  mat.positionNode = Fn(() => {
    const r1 = hash(instanceIndex.add(0.3));
    const r2 = hash(instanceIndex.add(5.1));
    const r3 = hash(instanceIndex.add(9.7));
    const ph = hash(instanceIndex.add(17.3)).mul(6.283);

    // 静态分布
    const baseX = r1.sub(0.5).mul(spreadX);
    const baseY = r2.mul(spreadY).add(1.0);
    const baseZ = r3.sub(0.5).mul(spreadZ).add(zOffset);

    // 缓慢漂浮
    const t = time.mul(0.22).mul(speed);
    const dy = sin(t.add(ph)).mul(1.7);
    const dx = cos(t.mul(0.7).add(ph)).mul(1.2);

    return vec3(baseX.add(dx), baseY.add(dy), baseZ);
  })();

  // 越远越淡（配合雾，光点在纵深里层层叠叠）
  mat.opacityNode = Fn(() => {
    const dist = positionWorld.sub(cameraPosition).length();
    const near = float(1.0).sub(smoothstep(float(60.0), float(230.0), dist));
    return near.mul(0.55).add(0.06);
  })();

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.name = 'dust';
  scene.add(mesh);

  return { mesh, speed };
}
