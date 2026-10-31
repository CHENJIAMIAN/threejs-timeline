/**
 * 实心立柱（实例化版）。
 *
 * 几何尺寸、材质、发光强度、顶球、光池、接地阴影、年份牌图集与防重叠参数
 * 全部来自 config.js 的 pillars 区域。
 */
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, float, step, pow, dot, abs, normalize, uniform,
  positionLocal, positionWorld, normalWorld, cameraPosition, uv, time,
  mx_fractal_noise_float, mx_noise_float, instanceIndex, instanceColor,
  floor, texture
} from 'three/tsl';
import { TIMELINE_CONFIG } from './config.js';
import { LAYOUT, YEARS, yearColor, yearHeight, pillarTransform } from './data.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 20, 14);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

export function createPillars(scene, opts = {}) {
  const base = TIMELINE_CONFIG.pillars;
  const cfg = {
    ...base,
    ...opts,
    glass: {
      ...base.glass,
      ...opts.glass,
      material: { ...base.glass.material, ...opts.glass?.material },
      emissive: { ...base.glass.emissive, ...opts.glass?.emissive }
    },
    shell: { ...base.shell, ...opts.shell },
    orb: { ...base.orb, ...opts.orb },
    pool: { ...base.pool, ...opts.pool },
    contact: { ...base.contact, ...opts.contact },
    labels: {
      ...base.labels,
      ...opts.labels,
      atlas: { ...base.labels.atlas, ...opts.labels?.atlas },
      year: { ...base.labels.year, ...opts.labels?.year },
      line: { ...base.labels.line, ...opts.labels?.line },
      tag: { ...base.labels.tag, ...opts.labels?.tag }
    }
  };

  const glassRoughness = uniform(1.0);
  const n = YEARS.length;
  const w = LAYOUT.width;
  const atlasCols = Math.min(
    cfg.labels.atlas.maxCols,
    Math.max(cfg.labels.atlas.minCols, Math.ceil(n / cfg.labels.atlas.rowsPerCol))
  );
  const atlasRows = Math.max(1, Math.ceil(n / atlasCols));

  const group = new THREE.Group();
  group.name = 'pillars';
  scene.add(group);

  const layout = YEARS.map((entry, i) => {
    const { heat, year, tag } = entry;
    const { x, z, yaw } = pillarTransform(i, n);
    const h = yearHeight(heat);
    const { hsl } = yearColor(heat, i, n);
    const colorCfg = TIMELINE_CONFIG.timeline.colors;
    const tint = new THREE.Color().setHSL(
      hsl[0] / 360,
      colorCfg.tint.saturation,
      colorCfg.tint.lightness
    );
    const vivid = new THREE.Color().setHSL(
      hsl[0] / 360,
      colorCfg.vivid.saturation,
      colorCfg.vivid.lightness
    );
    const rim = new THREE.Color().setHSL(
      hsl[0] / 360,
      colorCfg.rim.saturation,
      colorCfg.rim.lightness
    );
    return { i, year, tag, heat, x, z, yaw, h, tint, vivid, rim, hsl };
  });

  // ---------- 1) 柱体 ----------
  const gm = cfg.glass.material;
  const glassMat = new THREE.MeshPhysicalNodeMaterial({
    color: gm.color,
    metalness: gm.metalness,
    roughness: gm.roughness,
    transmission: gm.transmission,
    thickness: w * gm.thicknessFactor,
    ior: gm.ior,
    dispersion: gm.dispersion,
    iridescence: gm.iridescence,
    iridescenceIOR: gm.iridescenceIOR,
    iridescenceThicknessRange: [
      gm.iridescenceThicknessMin,
      gm.iridescenceThicknessMax
    ],
    clearcoat: gm.clearcoat,
    clearcoatRoughness: gm.clearcoatRoughness,
    attenuationDistance: gm.attenuationDistance,
    specularIntensity: gm.specularIntensity,
    transparent: gm.transparent,
    side: THREE.FrontSide,
    envMapIntensity: gm.envMapIntensity
  });
  glassMat.colorNode = instanceColor;
  glassMat.attenuationColorNode = instanceColor;

  glassMat.roughnessNode = Fn(() => {
    const grain = mx_fractal_noise_float(
      positionLocal.mul(vec3(
        cfg.glass.grainScale.x,
        cfg.glass.grainScale.y,
        cfg.glass.grainScale.z
      )),
      cfg.glass.grainOctaves,
      cfg.glass.grainLacunarity,
      cfg.glass.grainGain
    );
    const speck = mx_noise_float(positionLocal.mul(cfg.glass.speckScale));
    return float(cfg.glass.roughnessBase)
      .add(grain.mul(cfg.glass.roughnessGrain))
      .add(speck.mul(cfg.glass.roughnessSpeck))
      .mul(glassRoughness)
      .clamp(cfg.glass.roughnessMin, cfg.glass.roughnessMax);
  })();

  // 固定厚度，柱体内部不做上下变化。
  glassMat.emissiveNode = Fn(() => {
    const em = cfg.glass.emissive;
    const yN = positionLocal.y.add(0.5);
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const ndv = abs(dot(normalWorld, viewDir));
    const fres = pow(float(1.0).sub(ndv), float(em.fresnelPower));
    const outline = pow(float(1.0).sub(ndv), float(em.outlinePower));
    const topBand = step(float(em.topBandLow), yN);
    const bottomGlow = step(yN, float(em.bottomBandHigh));
    const phase = float(instanceIndex).mul(em.phaseStep);
    const breathe = time.mul(em.breatheSpeed).add(phase).sin().mul(0.5).add(0.5);
    const amount = fres.mul(em.fresnel)
      .add(outline.mul(em.outline))
      .add(topBand.mul(em.top))
      .add(bottomGlow.mul(em.bottom))
      .add(em.body)
      .add(step(0.5, breathe).mul(em.breathe));
    return instanceColor.mul(amount);
  })();

  const pillarsMesh = new THREE.InstancedMesh(UNIT_BOX, glassMat, n);
  pillarsMesh.name = 'pillars-glass';
  pillarsMesh.frustumCulled = false;
  pillarsMesh.castShadow = false;
  pillarsMesh.renderOrder = 1;

  // ---------- 2) 边缘光壳 ----------
  const shellMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    fog: true
  });
  shellMat.colorNode = Fn(() => {
    const ndv = abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))));
    return instanceColor.mul(
      pow(float(1.0).sub(ndv), float(cfg.shell.power)).mul(cfg.shell.strength)
    );
  })();
  shellMat.opacityNode = Fn(() => {
    const ndv = abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))));
    return pow(float(1.0).sub(ndv), float(cfg.shell.power));
  })();

  const shellMesh = new THREE.InstancedMesh(UNIT_BOX, shellMat, n);
  shellMesh.name = 'pillars-shell';
  shellMesh.frustumCulled = false;
  shellMesh.userData.isShell = true;

  // ---------- 3) 顶部发光球 ----------
  const orbMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true
  });
  orbMat.colorNode = Fn(() => {
    const phase = float(instanceIndex).mul(cfg.orb.phaseStep);
    const pulse = time.mul(cfg.orb.pulseSpeed).add(phase).sin()
      .mul(cfg.orb.pulseAmount).add(1.0);
    return instanceColor.mul(pulse.mul(cfg.orb.intensity));
  })();

  const orbMesh = new THREE.InstancedMesh(UNIT_SPHERE, orbMat, n);
  orbMesh.name = 'pillars-orb';
  orbMesh.frustumCulled = false;
  orbMesh.userData.isOrb = true;

  // ---------- 4) 地面光池 ----------
  const poolUV = uv();
  const poolMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true
  });
  poolMat.colorNode = Fn(() => {
    const d = poolUV.sub(0.5).length().mul(2.0);
    return instanceColor.mul(step(d, float(cfg.pool.falloffEnd)).mul(cfg.pool.strength));
  })();

  // ---------- 4b) 接地阴影 ----------
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
    return step(d, float(cfg.contact.falloffEnd)).mul(cfg.contact.opacity);
  })();

  const contactMesh = new THREE.InstancedMesh(UNIT_PLANE, contactMat, n);
  contactMesh.name = 'pillars-contact';
  contactMesh.frustumCulled = false;
  contactMesh.userData.isContact = true;

  const poolMesh = new THREE.InstancedMesh(UNIT_PLANE, poolMat, n);
  poolMesh.name = 'pillars-pool';
  poolMesh.frustumCulled = false;
  poolMesh.userData.isPool = true;

  // 发光壳和地面光池默认关闭：实心柱体不需要叠半透明材质。
  shellMesh.visible = cfg.shell.enabled !== false;
  poolMesh.visible = cfg.pool.enabled !== false;
  contactMesh.visible = cfg.contact.enabled !== false;

  // ---------- 5) 年份牌 ----------
  const labelTex = new THREE.CanvasTexture(buildLabelAtlas(atlasCols, atlasRows, cfg.labels));
  labelTex.colorSpace = THREE.SRGBColorSpace;
  labelTex.anisotropy = cfg.labels.atlas.anisotropy;

  const atlasNode = texture(labelTex);
  const cellUV = Fn(() => {
    const id = float(instanceIndex);
    const col = id.mod(atlasCols);
    const row = floor(id.div(atlasCols));
    const u = col.add(uv().x).mul(1 / atlasCols);
    const v = float(1.0).sub(row.add(1.0).mul(1 / atlasRows))
      .add(uv().y.mul(1 / atlasRows));
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
  labelMesh.visible = cfg.labels.enabled;
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

    shellMesh.setMatrixAt(
      i,
      _m.compose(
        _p.set(L.x, midY, L.z),
        _q,
        _s.set(w * cfg.shell.scaleX, L.h * cfg.shell.scaleY, w * cfg.shell.scaleX)
      )
    );
    shellMesh.setColorAt(i, L.vivid);

    const orbR = (cfg.orb.minRadius + L.heat * (cfg.orb.maxRadius - cfg.orb.minRadius))
      * cfg.orb.sizeFactor;
    orbMesh.setMatrixAt(
      i,
      _m.compose(
        _p.set(L.x, LAYOUT.y + L.h + cfg.orb.offset, L.z),
        _q.identity(),
        _s.set(orbR, orbR, orbR)
      )
    );
    orbMesh.setColorAt(i, L.vivid);

    _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0));
    const pw = w * cfg.pool.sizeFactor;
    poolMesh.setMatrixAt(
      i,
      _m.compose(_p.set(L.x, LAYOUT.y + cfg.pool.y, L.z), _q, _s.set(pw, pw, 1))
    );
    poolMesh.setColorAt(i, L.vivid);

    const cw = w * cfg.contact.sizeFactor;
    contactMesh.setMatrixAt(
      i,
      _m.compose(_p.set(L.x, LAYOUT.y + cfg.contact.y, L.z), _q, _s.set(cw, cw, 1))
    );
    contactMesh.setColorAt(i, L.vivid);
  }
  for (const mesh of [pillarsMesh, shellMesh, orbMesh, poolMesh, contactMesh]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  group.add(pillarsMesh, shellMesh, orbMesh, poolMesh, contactMesh);

  // ---------- 底座导轨 ----------
  const railCfg = LAYOUT.rail;
  const railPts = [];
  for (let i = 0; i <= railCfg.segments; i++) {
    const p = pillarTransform((i / railCfg.segments) * (n - 1), n);
    railPts.push(new THREE.Vector3(p.x, LAYOUT.y + 0.02, p.z));
  }
  const rail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(railPts),
    new THREE.LineBasicMaterial({
      color: railCfg.color,
      transparent: true,
      opacity: railCfg.opacity
    })
  );
  rail.name = 'pillars-rail';
  rail.userData.isRail = true;
  group.add(rail);

  // ---------- 年份牌 billboard + 防重叠 LOD ----------
  const labelAnchor = layout.map(
    (L) => new THREE.Vector3(
      L.x,
      LAYOUT.y + L.h + cfg.labels.offset + (L.i % 2 === 0 ? 0 : cfg.labels.tier),
      L.z
    )
  );
  const _pv = new THREE.Vector3();
  const _viewPos = new THREE.Vector3();
  const _slots = layout.map((L) => ({ i: L.i, sx: 0, sy: 0, z: 0, inside: false }));

  function updateLabels(camera) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pxScale = (H * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);

    for (const s of _slots) {
      _pv.copy(labelAnchor[s.i]).project(camera);
      s.sx = (_pv.x * 0.5 + 0.5) * W;
      s.sy = (-_pv.y * 0.5 + 0.5) * H;
      s.z = _pv.z;
      s.inside = _pv.z > -1 && _pv.z < 1;

      _viewPos.copy(labelAnchor[s.i]).applyMatrix4(camera.matrixWorldInverse);
      const d = Math.max(0.001, -_viewPos.z);
      const k = pxScale / d;
      s.hw = cfg.labels.width * 0.5 * k;
      s.hh = cfg.labels.height * 0.5 * k;
    }

    const sorted = _slots.slice().sort((a, b) => a.z - b.z);
    const keep = [];
    for (const s of sorted) {
      let visible = s.inside;
      if (visible) {
        for (let k2 = 0; k2 < keep.length; k2 += 3) {
          const dx = Math.abs(keep[k2] - s.sx);
          const dy = Math.abs(keep[k2 + 1] - s.sy);
          if (
            dx < (keep[k2 + 2] + s.hw) * cfg.labels.overlapX
            && dy < (keep[k2 + 2] * 0.30 + s.hh) * cfg.labels.overlapY
          ) {
            visible = false;
            break;
          }
        }
      }
      if (visible) keep.push(s.sx, s.sy, s.hw);

      const sc = visible ? 1 : 0;
      labelMesh.setMatrixAt(
        s.i,
        _m.compose(
          _p.copy(labelAnchor[s.i]),
          camera.quaternion,
          _s.set(cfg.labels.width * sc, cfg.labels.height * sc, 1)
        )
      );
    }
    labelMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- 悬停高亮 ----------
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
    labelGroup: labelMesh,
    pickables: [pillarsMesh],
    meshes: {
      pillars: pillarsMesh,
      shell: shellMesh,
      orb: orbMesh,
      pool: poolMesh,
      contact: contactMesh,
      label: labelMesh,
      rail
    },
    entries: layout,
    entryAt: (i) => layout[i],
    setHover,
    updateLabels,
    setRoughnessScale: (v) => { glassRoughness.value = v; },
    setSublayerVisible(kind, on) {
      const map = {
        shell: shellMesh,
        orb: orbMesh,
        pool: poolMesh,
        contact: contactMesh,
        label: labelMesh,
        rail
      };
      if (map[kind]) map[kind].visible = on;
    }
  };
}

function buildLabelAtlas(cols, rows, labels) {
  const { cellWidth, cellHeight } = labels.atlas;
  const canvas = document.createElement('canvas');
  canvas.width = cellWidth * cols;
  canvas.height = cellHeight * rows;
  const ctx = canvas.getContext('2d');

  YEARS.forEach((entry, i) => {
    const { hsl } = yearColor(entry.heat, i, YEARS.length);
    const accent = `hsl(${hsl[0]} ${Math.round(hsl[1] * 100)}% ${labels.accentLightness}%)`;

    ctx.save();
    ctx.translate((i % cols) * cellWidth, Math.floor(i / cols) * cellHeight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = labels.year.font;
    ctx.shadowColor = accent;
    ctx.shadowBlur = labels.year.shadowBlur;
    ctx.fillStyle = labels.year.color;
    ctx.fillText(String(entry.year), cellWidth / 2, labels.year.y);

    ctx.shadowBlur = labels.line.shadowBlur;
    ctx.strokeStyle = accent;
    ctx.lineWidth = labels.line.width;
    ctx.beginPath();
    ctx.moveTo(cellWidth / 2 - labels.line.halfWidth, labels.line.y);
    ctx.lineTo(cellWidth / 2 + labels.line.halfWidth, labels.line.y);
    ctx.stroke();

    let font = labels.tag.maxFont;
    const text = entry.tag ?? '';
    do {
      ctx.font = `${labels.tag.weight} ${font}px ${labels.tag.fontFamily}`;
      font -= 2;
    } while (
      ctx.measureText(text).width > cellWidth - labels.tag.widthPadding
      && font > labels.tag.minFont
    );
    ctx.fillStyle = accent;
    ctx.fillText(text, cellWidth / 2, labels.tag.y);
    ctx.restore();
  });

  return canvas;
}
