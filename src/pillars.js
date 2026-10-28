/**
 * 立柱（工程级 · 实例化版）
 * ------------------------------------------------------------------
 * 性能要点：一根柱子 = 一套着色器程序这件事必须干掉。
 * TSL 会把 vec3(vivid.r, ...) / float(i) * 0.31 这类常量**烘焙进 WGSL**，
 * 于是每根柱子各自编译一份 program——实测 156 个 program / 160 个材质 / 165 次 draw call。
 *
 * 这里改成：几何统一成单位盒，颜色走 instanceColor，相位走 instanceIndex，
 * 尺寸/朝向走 instanceMatrix —— 5 个 InstancedMesh 覆盖「柱体 / 边缘光壳 / 顶球 / 地面光池 / 年份牌」，
 * draw call 从 ~124 降到 5，program 从 ~124 降到 5，年份牌纹理合并成 1 张图集。
 */
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, float, mix, smoothstep, pow, dot, abs, normalize, uniform,
  positionLocal, positionWorld, normalWorld, cameraPosition, uv, time,
  mx_fractal_noise_float, mx_noise_float, instanceIndex, instanceColor,
  floor, texture
} from 'three/tsl';
import { LAYOUT, YEARS, yearColor, yearHeight, pillarTransform } from './data.js';

// 单位几何：所有实例共用一份（尺寸走 instanceMatrix）
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 20, 14);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

const ORB_Y = 0.55;          // 顶球高于柱顶的距离
const LABEL_W = 4.6;         // 年份牌世界尺寸
const LABEL_H = 2.3;
const LABEL_TIER = 2.4;      // 奇偶错层高度

// 年份牌图集：格子尺寸固定，列数 / 行数按年份数量动态计算
const CELL_W = 512;
const CELL_H = 256;

export function createPillars(scene, opts = {}) {
  const glassRoughness = uniform(1.0);     // HUD 滑杆：全局磨砂强度
  const n = YEARS.length;
  const w = LAYOUT.width;
  const atlasCols = Math.min(12, Math.max(4, Math.ceil(n / 8)));
  const atlasRows = Math.ceil(n / atlasCols);

  const group = new THREE.Group();
  group.name = 'pillars';
  scene.add(group);

  // ---------- 预先算好每根柱子的静态数据 ----------
  const layout = YEARS.map((entry, i) => {
    const { heat, year, tag } = entry;
    const { x, z, yaw } = pillarTransform(i, n);
    const h = yearHeight(heat);
    const { hsl } = yearColor(heat, i, n);
    const tint = new THREE.Color().setHSL(hsl[0] / 360, 0.85, 0.52);   // 玻璃本体染色
    const vivid = new THREE.Color().setHSL(hsl[0] / 360, 0.95, 0.62);  // 发光用的高饱和版
    const rim = new THREE.Color().setHSL(hsl[0] / 360, 0.85, 0.80);    // 悬停高亮
    return { i, year, tag, heat, x, z, yaw, h, tint, vivid, rim, hsl };
  });

  // ---------- 1) 毛玻璃柱体（1 个 InstancedMesh） ----------
  const glassMat = new THREE.MeshPhysicalNodeMaterial({
    color: 0xffffff,               // 真实颜色来自 instanceColor
    metalness: 0.0,
    roughness: 0.30,
    transmission: 0.78,
    thickness: w * 2.2,
    ior: 1.47,
    dispersion: 0.55,
    iridescence: 0.35,
    iridescenceIOR: 1.30,
    iridescenceThicknessRange: [140, 380],
    clearcoat: 0.45,
    clearcoatRoughness: 0.18,
    attenuationDistance: 1.6,
    specularIntensity: 1.0,
    transparent: true,
    side: THREE.FrontSide,
    envMapIntensity: 1.7
  });
  glassMat.colorNode = instanceColor;    // 每根柱子自己的年份色
  glassMat.attenuationColorNode = instanceColor;   // 透过柱子的光同样被年份色染一遍（颜色不再被冲白）

  glassMat.roughnessNode = Fn(() => {
    // 单位盒空间，频率已按「世界 2.3 宽」换算，观感与逐材质版一致
    const grain = mx_fractal_noise_float(positionLocal.mul(vec3(20.0, 6.0, 20.0)), 3, 2.0, 0.6);
    const speck = mx_noise_float(positionLocal.mul(100.0));
    return float(0.30).add(grain.mul(0.22)).add(speck.mul(0.10)).mul(glassRoughness).clamp(0.04, 0.62);
  })();

  glassMat.thicknessNode = Fn(() => {
    const yN = positionLocal.y.add(0.5);          // 单位盒：-0.5..0.5 → 0..1
    return mix(float(2.35), float(0.7), yN);      // 下厚上薄
  })();

  glassMat.emissiveNode = Fn(() => {
    const yN = positionLocal.y.add(0.5);
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const ndv = abs(dot(normalWorld, viewDir));
    const fres = pow(float(1.0).sub(ndv), float(1.6));
    const outline = pow(float(1.0).sub(ndv), float(4.0));
    const topBand = smoothstep(float(0.78), float(1.0), yN);
    const bottomGlow = smoothstep(float(0.14), float(0.0), yN);
    const phase = float(instanceIndex).mul(0.31);
    const breathe = time.mul(0.7).add(phase).sin().mul(0.5).add(0.5);
    const body = smoothstep(float(0.02), float(0.9), yN).mul(0.20);
    const amount = fres.mul(0.72).add(outline.mul(0.42)).add(topBand.mul(0.95))
      .add(bottomGlow.mul(0.38)).add(body).add(breathe.mul(0.05));
    return instanceColor.mul(amount);
  })();

  const pillarsMesh = new THREE.InstancedMesh(UNIT_BOX, glassMat, n);
  pillarsMesh.name = 'pillars-glass';
  pillarsMesh.frustumCulled = false;

  // ---------- 2) 边缘光壳（1 个 InstancedMesh） ----------
  const shellMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    fog: true
  });
  // 注意：计算型节点不能跨 Fn 共享（会触发 WGSL 括号错位），所以两处各自成树
  shellMat.colorNode = Fn(() => {
    const ndv = abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))));
    return instanceColor.mul(pow(float(1.0).sub(ndv), float(2.2)).mul(1.25));
  })();
  shellMat.opacityNode = Fn(() => {
    const ndv = abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))));
    return pow(float(1.0).sub(ndv), float(2.2));
  })();

  const shellMesh = new THREE.InstancedMesh(UNIT_BOX, shellMat, n);
  shellMesh.name = 'pillars-shell';
  shellMesh.frustumCulled = false;
  shellMesh.userData.isShell = true;

  // ---------- 3) 顶部发光球（1 个 InstancedMesh） ----------
  const orbMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true
  });
  orbMat.colorNode = Fn(() => {
    const phase = float(instanceIndex).mul(0.37);
    const pulse = time.mul(1.1).add(phase).sin().mul(0.18).add(1.0);
    return instanceColor.mul(pulse.mul(1.05));
  })();

  const orbMesh = new THREE.InstancedMesh(UNIT_SPHERE, orbMat, n);
  orbMesh.name = 'pillars-orb';
  orbMesh.frustumCulled = false;
  orbMesh.userData.isOrb = true;

  // ---------- 4) 地面光池（1 个 InstancedMesh） ----------
  const poolUV = uv();
  const poolMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true
  });
  poolMat.colorNode = Fn(() => {
    const d = poolUV.sub(0.5).length().mul(2.0);
    const falloff = float(1.0).sub(smoothstep(float(0.06), float(1.0), d));
    return instanceColor.mul(falloff.mul(0.42));
  })();

  // ---------- 4b) 接地阴影（1 个 InstancedMesh）：给柱子「落地感」 ----------
  const contactUV = uv();
  const contactMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    toneMapped: false,
    color: 0x000000
  });
  contactMat.opacityNode = Fn(() => {
    const d = contactUV.sub(0.5).length().mul(2.0);
    return float(1.0).sub(smoothstep(float(0.12), float(1.0), d)).mul(0.85);
  })();

  const contactMesh = new THREE.InstancedMesh(UNIT_PLANE, contactMat, n);
  contactMesh.name = 'pillars-contact';
  contactMesh.frustumCulled = false;
  contactMesh.userData.isContact = true;

  const poolMesh = new THREE.InstancedMesh(UNIT_PLANE, poolMat, n);
  poolMesh.name = 'pillars-pool';
  poolMesh.frustumCulled = false;
  poolMesh.userData.isPool = true;

  // ---------- 5) 年份牌（1 张图集 + 1 个 InstancedMesh） ----------
  const labelTex = new THREE.CanvasTexture(buildLabelAtlas(atlasCols, atlasRows));
  labelTex.colorSpace = THREE.SRGBColorSpace;
  labelTex.anisotropy = 2;

  const atlasNode = texture(labelTex);
  const cellUV = Fn(() => {
    const id = float(instanceIndex);
    const col = id.mod(atlasCols);
    const row = floor(id.div(atlasCols));
    const u = col.add(uv().x).mul(1 / atlasCols);
    // canvas 第 0 行在顶部，而 UV 的 v 自下而上 → 行号翻过来
    const v = float(1.0).sub(row.add(1.0).mul(1 / atlasRows)).add(uv().y.mul(1 / atlasRows));
    return vec2(u, v);
  });
  const labelMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    toneMapped: false
  });
  labelMat.colorNode = atlasNode.sample(cellUV()).rgb;
  labelMat.opacityNode = atlasNode.sample(cellUV()).a;

  const labelMesh = new THREE.InstancedMesh(UNIT_PLANE, labelMat, n);
  labelMesh.name = 'pillars-labels';
  labelMesh.frustumCulled = false;
  labelMesh.userData.isLabel = true;
  scene.add(labelMesh);

  // ---------- 写实例矩阵 / 颜色 ----------
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();

  for (const L of layout) {
    const i = L.i;
    const midY = LAYOUT.y + L.h / 2;

    _q.setFromEuler(_e.set(0, L.yaw, 0));
    pillarsMesh.setMatrixAt(i, _m.compose(_p.set(L.x, midY, L.z), _q, _s.set(w, L.h, w)));
    pillarsMesh.setColorAt(i, L.tint);

    shellMesh.setMatrixAt(i, _m.compose(_p.set(L.x, midY, L.z), _q, _s.set(w * 1.09, L.h * 1.02, w * 1.09)));
    shellMesh.setColorAt(i, L.vivid);

    const orbR = (0.42 + L.heat * 0.45) * 0.52;
    orbMesh.setMatrixAt(i, _m.compose(_p.set(L.x, LAYOUT.y + L.h + ORB_Y, L.z), _q.identity(), _s.set(orbR, orbR, orbR)));
    orbMesh.setColorAt(i, L.vivid);

    _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0));
    const pw = w * 3.4;
    poolMesh.setMatrixAt(i, _m.compose(_p.set(L.x, LAYOUT.y + 0.012, L.z), _q, _s.set(pw, pw, 1)));
    poolMesh.setColorAt(i, L.vivid);

    // 接地阴影：比光池略小、压在光池下面
    const cw = w * 2.6;
    contactMesh.setMatrixAt(i, _m.compose(_p.set(L.x, LAYOUT.y + 0.006, L.z), _q, _s.set(cw, cw, 1)));
    contactMesh.setColorAt(i, L.vivid);
  }
  for (const mesh of [pillarsMesh, shellMesh, orbMesh, poolMesh, contactMesh]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  group.add(pillarsMesh, shellMesh, orbMesh, poolMesh, contactMesh);

  // ---------- 底座导轨（1 条线） ----------
  const railPts = [];
  for (let i = 0; i <= 96; i++) {
    const p = pillarTransform((i / 96) * (n - 1), n);
    railPts.push(new THREE.Vector3(p.x, LAYOUT.y + 0.02, p.z));
  }
  const rail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(railPts),
    new THREE.LineBasicMaterial({ color: 0x7fb0ff, transparent: true, opacity: 0.24 })
  );
  rail.name = 'pillars-rail';
  rail.userData.isRail = true;
  group.add(rail);

  // ---------- 年份牌：每帧 billboard + 屏幕空间防重叠 LOD ----------
  const labelAnchor = layout.map(
    (L) => new THREE.Vector3(L.x, LAYOUT.y + L.h + 1.45 + (L.i % 2 === 0 ? 0 : LABEL_TIER), L.z)
  );
  const _pv = new THREE.Vector3();
  const _slots = layout.map((L) => ({ i: L.i, sx: 0, sy: 0, z: 0, inside: false }));

  const _viewPos = new THREE.Vector3();
  function updateLabels(camera) {
    const W = window.innerWidth, H = window.innerHeight;
    const pxScale = (H * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);

    for (const s of _slots) {
      _pv.copy(labelAnchor[s.i]).project(camera);
      s.sx = (_pv.x * 0.5 + 0.5) * W;
      s.sy = (-_pv.y * 0.5 + 0.5) * H;
      s.z = _pv.z;
      s.inside = _pv.z > -1 && _pv.z < 1;

      // 该标签在屏幕上的半宽/半高：透视投影解析解，省掉额外投影
      _viewPos.copy(labelAnchor[s.i]).applyMatrix4(camera.matrixWorldInverse);
      const d = Math.max(0.001, -_viewPos.z);
      const k = pxScale / d;
      s.hw = LABEL_W * 0.5 * k;
      s.hh = LABEL_H * 0.5 * k;
    }

    // 近的优先保留；只有「真的会在屏幕上压住」才隐藏（远处的字本来就小，能排下更多）
    const sorted = _slots.slice().sort((a, b) => a.z - b.z);
    const keep = [];
    for (const s of sorted) {
      let visible = s.inside;
      if (visible) {
        for (let k2 = 0; k2 < keep.length; k2 += 3) {
          const dx = Math.abs(keep[k2] - s.sx);
          const dy = Math.abs(keep[k2 + 1] - s.sy);
          // 贴图里文字只占约 7 成宽、上下还有留白，所以按文字实际尺寸判重叠（能多留 30% 的年份牌）
          if (dx < (keep[k2 + 2] + s.hw) * 0.74 && dy < (keep[k2 + 2] * 0.30 + s.hh) * 0.84) { visible = false; break; }
        }
      }
      if (visible) keep.push(s.sx, s.sy, s.hw);

      const sc = visible ? 1 : 0;
      labelMesh.setMatrixAt(s.i, _m.compose(_p.copy(labelAnchor[s.i]), camera.quaternion, _s.set(LABEL_W * sc, LABEL_H * sc, 1)));
    }
    labelMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- 悬停高亮：直接改 instanceColor，不需要额外网格 ----------
  let hovered = -1;
  function setHover(idx) {
    if (idx === hovered) return;
    if (hovered >= 0) pillarsMesh.setColorAt(hovered, layout[hovered].tint);
    hovered = idx;
    if (idx >= 0) pillarsMesh.setColorAt(idx, layout[idx].rim);
    pillarsMesh.instanceColor.needsUpdate = true;
  }

  return {
    group,
    labelMesh,
    labelGroup: labelMesh,          // 兼容旧接口（.visible 开关）
    pickables: [pillarsMesh],       // 射线只打这一个 InstancedMesh
    meshes: { pillars: pillarsMesh, shell: shellMesh, orb: orbMesh, pool: poolMesh, label: labelMesh, rail },
    entries: layout,
    entryAt: (i) => layout[i],
    setHover,
    updateLabels,
    setRoughnessScale: (v) => { glassRoughness.value = v; },
    setSublayerVisible(kind, on) {
      const map = { shell: shellMesh, orb: orbMesh, pool: poolMesh, rail };
      if (map[kind]) map[kind].visible = on;
    }
  };
}

/** 把全部年份牌一次画进一张动态尺寸图集，每个格子 512×256 */
function buildLabelAtlas(cols, rows) {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * cols;
  canvas.height = CELL_H * rows;
  const ctx = canvas.getContext('2d');

  YEARS.forEach((entry, i) => {
    const { hsl } = yearColor(entry.heat, i, YEARS.length);
    const accent = `hsl(${hsl[0]} ${Math.round(hsl[1] * 100)}% 66%)`;

    ctx.save();
    ctx.translate((i % cols) * CELL_W, Math.floor(i / cols) * CELL_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '700 124px "Segoe UI", system-ui, sans-serif';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#f2f6ff';
    ctx.fillText(String(entry.year), CELL_W / 2, 78);

    ctx.shadowBlur = 12;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CELL_W / 2 - 78, 144);
    ctx.lineTo(CELL_W / 2 + 78, 144);
    ctx.stroke();

    let font = 50;
    const text = entry.tag ?? '';
    do {
      ctx.font = `500 ${font}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
      font -= 2;
    } while (ctx.measureText(text).width > CELL_W - 26 && font > 22);
    ctx.fillStyle = accent;
    ctx.fillText(text, CELL_W / 2, 204);
    ctx.restore();
  });

  return canvas;
}
