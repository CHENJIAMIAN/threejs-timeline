/**
 * 天幕与背景色幕。颜色、噪声频率、流动速度、明暗强度都来自 config.js。
 */
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, color, step, normalize, time,
  positionLocal, uniform, mx_fractal_noise_vec3, uv
} from 'three/tsl';
import { TIMELINE_CONFIG } from './config.js';
import { toLinearRGB } from './color.js';

/**
 * 生成天幕颜色节点。
 *
 * 三种颜色走 uniform 而不是编译期常量：配置面板改色时只需改 uniform 的值，
 * 不必重建材质、不必重编译 shader（重建节点在 WebGL2 后端上不可靠，实测不生效）。
 */
export function buildSkyColorNode(cfg, base, skyIntensity, colorUniforms) {
  const { shader } = cfg;
  return Fn(() => {
    const dir = normalize(positionLocal);
    const h = dir.y.mul(0.5).add(0.5);

    // 三段硬切换：每段权重只有一个为 1，用乘加拼接，不依赖 mix。
    const bottom = step(h, float(shader.midStop));
    const middle = step(float(shader.midStop), h)
      .mul(step(h, float(shader.topStop)));
    const top = step(float(shader.topStop), h);

    const col = colorUniforms.bottom.mul(bottom)
      .add(colorUniforms.mid.mul(middle))
      .add(colorUniforms.top.mul(top));

    return vec4(col.mul(skyIntensity), 1.0);
  })();
}

export function createSky(options = {}) {
  const base = TIMELINE_CONFIG.sky;
  const cfg = {
    ...base,
    ...options,
    colors: { ...base.colors, ...options.colors },
    shader: { ...base.shader, ...options.shader }
  };
  const { radius, intensity } = cfg;

  const skyIntensity = uniform(intensity);
  const colorUniforms = {
    bottom: uniform(new THREE.Vector3(...toLinearRGB(cfg.colors.bottom))),
    mid: uniform(new THREE.Vector3(...toLinearRGB(cfg.colors.mid))),
    top: uniform(new THREE.Vector3(...toLinearRGB(cfg.colors.top)))
  };

  const material = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true
  });

  material.colorNode = buildSkyColorNode(cfg, base, skyIntensity, colorUniforms);

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), material);
  mesh.frustumCulled = false;
  mesh.name = 'sky';

  return { mesh, skyIntensity, colorUniforms, material, cfg, base };
}

/** 用天幕本身烘一张 PMREM 环境贴图，失败时退回纯灯光照明。 */
export async function bakeEnvironment(renderer, skyMesh) {
  try {
    const tmpScene = new THREE.Scene();
    const clone = skyMesh.clone();
    clone.material = skyMesh.material;
    tmpScene.add(clone);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(tmpScene, 0.02, 1, 2000);
    pmrem.dispose();
    return rt.texture;
  } catch (err) {
    console.warn('[timeline] PMREM 环境贴图生成失败，退回纯灯光照明：', err);
    return null;
  }
}

/** 背景色幕：给毛玻璃提供可见内容，同时填住时间轴后方的大片空场。 */
export function createBackdrop(options = {}) {
  const base = TIMELINE_CONFIG.backdrop;
  const cfg = {
    ...base,
    ...options,
    colors: { ...base.colors, ...options.colors },
    shader: { ...base.shader, ...options.shader }
  };
  const { distance, y, sizeX, sizeY, colors, shader } = cfg;

  const mat = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: true
  });

  mat.colorNode = Fn(() => {
    const p = uv();
    const flow = time.mul(cfg.flowSpeed);

    let col = color(colors.left);
    col = col.mix(color(colors.middle), step(0.34, p.x));
    col = col.mix(color(colors.right), step(0.66, p.x));

    const vGlow = step(0.18, p.y).mul(step(p.y, 0.82));

    const n = mx_fractal_noise_vec3(
      vec3(
        p.x.mul(shader.noiseScaleX),
        p.y.mul(shader.noiseScaleY),
        flow
      ),
      shader.octaves,
      shader.lacunarity,
      shader.gain
    );
    const cloud = n.x.mul(0.5).add(shader.cloudBias);
    const lattice = n.y.mul(0.5).add(0.5);

    const edgeX = step(float(shader.edgeXStart), p.x)
      .mul(step(p.x, float(shader.edgeXEnd)));
    const edgeY = step(float(shader.edgeYStart), p.y)
      .mul(step(p.y, float(shader.edgeYEnd)));
    const edge = edgeX.mul(edgeY);

    const lit = col.mul(vGlow)
      .mul(cloud.mul(lattice.mul(shader.latticeMix).add(shader.latticeBias)))
      .mul(shader.intensity);
    return vec4(color(colors.fog).mix(lit, edge), 1.0);
  })();

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeY), mat);
  mesh.position.set(0, y, distance);
  mesh.frustumCulled = false;
  mesh.name = 'backdrop';
  return mesh;
}
