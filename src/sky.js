/**
 * 天幕：一圈巨大的内表面球体，整个「氛围色」由 TSL 现场算出来。
 *  - 三色垂直渐变（夜空 / 紫雾 / 深蓝）
 *  - 极光带：分形噪声驱动的缎带，随时间缓慢流动
 *  - 地平线辉光 + 顶部暖光：给毛玻璃立柱提供可折射 / 可反射的环境色
 */
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, vec2, float, color, mix, smoothstep, exp, normalize, time,
  positionLocal, uniform, mx_fractal_noise_vec3, mx_noise_float, pow, length, dot, abs, uv
} from 'three/tsl';

export function createSky(options = {}) {
  const {
    radius = 620,
    bottom = 0x0d0922,   // 近地暗紫
    mid = 0x2b1257,      // 中段紫
    top = 0x081c3f,      // 天顶深蓝
    auroraA = 0x1f6bff,  // 极光冷端
    auroraB = 0xff4fd8,  // 极光暖端
    horizon = 0x3fe6ff,  // 地平线辉光
    intensity = 1
  } = options;

  const auroraShift = uniform(0.0);   // 极光流动相位
  const skyIntensity = uniform(intensity);

  const material = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,          // 天幕本身不受雾影响（它自己就是雾的颜色来源）
    toneMapped: true
  });

  material.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    const h = dir.y.mul(0.5).add(0.5);            // 0 = 正下方, 1 = 正上方

    // --- 垂直渐变 ---
    let col = mix(color(bottom), color(mid), smoothstep(float(0.18), float(0.52), h));
    col = mix(col, color(top), smoothstep(float(0.52), float(1.0), h));

    // --- 极光缎带：噪声采样点绕 y 轴缓慢旋转 ---
    const flow = time.mul(0.028).add(auroraShift);
    const ang = flow;
    const ca = ang.cos();
    const sa = ang.sin();
    // 把方向绕 Y 轴旋转，制造“流动”错觉，比直接平移噪声更自然
    const rx = dir.x.mul(ca).sub(dir.z.mul(sa));
    const rz = dir.x.mul(sa).add(dir.z.mul(ca));
    const n = mx_fractal_noise_vec3(vec3(rx.mul(2.4), dir.y.mul(1.6).add(flow.mul(1.3)), rz.mul(2.4)), 4, 2.1, 0.55);
    const band = smoothstep(float(0.30), float(0.66), h).mul(smoothstep(float(0.98), float(0.72), h)); // 只在穹顶中上部
    const ribbon = smoothstep(float(0.10), float(0.72), n.x.mul(0.5).add(0.5)).mul(band);
    col = mix(col, mix(color(auroraA), color(auroraB), smoothstep(float(0.15), float(0.95), h)), ribbon.mul(0.62));

    // --- 碎星/微尘亮斑：细噪声闪一下 ---
    const star = mx_noise_float(dir.mul(240.0));
    const twinkle = smoothstep(float(0.72), float(0.98), star).mul(smoothstep(float(0.35), float(0.95), h));
    col = col.add(vec3(0.55, 0.7, 1.0).mul(twinkle.mul(0.42)));

    // --- 地平线辉光（相机高度附近最亮，让雾有“发光源”） ---
    const halo = exp(h.sub(0.47).abs().mul(-9.0));
    col = col.add(color(horizon).mul(halo).mul(0.78));

    // --- 天顶暖色，压出冷暖对撞 ---
    col = col.add(color(0xffb37a).mul(pow(h, 6.0).mul(0.14)));

    return vec4(col.mul(skyIntensity), 1.0);
  })();

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), material);
  mesh.frustumCulled = false;
  mesh.name = 'sky';

  return { mesh, auroraShift, skyIntensity, material };
}

/**
 * 用天幕本身烘一张环境贴图（PMREM），给毛玻璃立柱提供反射/折射的环境色。
 * 失败时返回 null，场景会退回纯灯光照明。
 */
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

/**
 * 背景色幕：立在时间轴后方的一大片渐变光幕。
 * 目的有二：
 *  1) 给毛玻璃立柱提供「看得见的内容」——透射+磨砂会把这层色幕糊成柔和的色块，
 *     毛玻璃的质感只有背后有东西时才看得出来；
 *  2) 用它替掉画面中段的大片空场，让立柱的剪影有对比。
 */
export function createBackdrop(options = {}) {
  const { distance = 170, y = 46, sizeX = 760, sizeY = 340 } = options;

  const mat = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
    fog: false,          // 自己按雾色收边，避免被雾整片吃掉
    toneMapped: true
  });

  mat.colorNode = Fn(() => {
    const p = uv();
    const flow = time.mul(0.02);

    // 横向：青蓝 → 紫 → 品红（与年份色带呼应）
    let col = mix(color(0x1b5cff), color(0x8b3cff), smoothstep(float(0.0), float(0.55), p.x));
    col = mix(col, color(0xff4fd8), smoothstep(float(0.45), float(1.0), p.x));

    // 纵向：中部最亮，上下收到暗紫（和雾色一致，边缘不会出现硬框）
    const vGlow = smoothstep(float(0.02), float(0.42), p.y).mul(smoothstep(float(1.0), float(0.58), p.y));

    // 噪声云絮：缓慢流动，避免死板的纯渐变
    const n = mx_fractal_noise_vec3(vec3(p.x.mul(2.6), p.y.mul(1.9), flow), 4, 2.0, 0.55);
    const cloud = n.x.mul(0.5).add(0.62);

    // 低频起伏：给磨砂留点「可被糊掉」的细节；绝不做规则条纹，否则看着像平铺伪影
    const lattice = n.y.mul(0.5).add(0.5);

    // 边缘按雾色收掉
    const edgeX = smoothstep(float(0.0), float(0.26), p.x).mul(smoothstep(float(1.0), float(0.74), p.x));
    const edgeY = smoothstep(float(0.0), float(0.22), p.y).mul(smoothstep(float(1.0), float(0.78), p.y));
    const edge = edgeX.mul(edgeY);

    const lit = col.mul(vGlow).mul(cloud.mul(lattice.mul(0.45).add(0.78))).mul(0.52);
    return vec4(mix(color(0x150d33), lit, edge), 1.0);
  })();

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeY), mat);
  mesh.position.set(0, y, distance);
  mesh.frustumCulled = false;
  mesh.name = 'backdrop';
  return mesh;
}
