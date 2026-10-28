/**
 * 立体时间轴 · 装配层（工程级性能版）
 * ------------------------------------------------------------------
 * 渲染：WebGPURenderer（不支持时自动退回 WebGL2 后端，代码不用改）
 * 效果：天幕 / 背景色幕 / 毛玻璃立柱 / 浮尘 / RenderPipeline 后期，全部 TSL 节点手写
 *
 * 性能设计（实测数字见 README「性能」一节）：
 *   · 全场景实例化：柱体 / 光壳 / 顶球 / 光池 / 年份牌 = 5 个 InstancedMesh
 *     → draw call 从 ~124 降到 5，program 从 156 降到个位数
 *   · 颜色走 instanceColor、相位走 instanceIndex、尺寸走 instanceMatrix，
 *     消灭「每根柱子一套着色器程序」的常量烘焙问题
 *   · 年份牌纹理合并成 1 张动态图集
 *   · 每帧零堆分配（临时向量 / 矩阵 / 球坐标全部预分配复用）
 *   · 自适应分辨率 + 画质档位（自动 / 极致 / 省电）+ 页签隐藏即停渲染
 *   · ?bench=1 开启 GPU 时间戳与性能读数（真实 GPU 毫秒）
 */
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, color, mix, smoothstep, min, positionWorld, cameraPosition
} from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { TIMELINE_CONFIG } from './config.js';
import { YEARS, START_YEAR, END_YEAR, LAYOUT, yearColor, yearHeight } from './data.js';
import { createSky, createBackdrop, bakeEnvironment } from './sky.js';
import { createPillars } from './pillars.js';
import { createDust } from './dust.js';
import { createRenderPipeline } from './postfx.js';

const bootEl = document.getElementById('boot');
const bootMsg = document.getElementById('boot-msg');
const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const BENCH = params.has('bench');        // 性能面板 + GPU 时间戳
const FORCE_GL = params.has('webgl');     // 强制 WebGL2 后端（对比用）

const state = {
  autoRotate: true,
  cruise: false,
  showLabels: true,
  cruiseU: 0,
  baseAz: 0,
  basePol: 1.35,
  hovered: -1,
  focus: null
};

// 画质档位：自动 = 从最高分辨率起步，撑不住才降，稳定后缓慢试探回升
const quality = {
  mode: 'auto',
  dprMax: Math.min(window.devicePixelRatio || 1, 2),
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  frameEma: 16.7,
  cooldown: 0,
  probeWait: 0,
  fpsCap: 0,
  capLast: 0
};

// 预分配的临时对象（循环里零分配）
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _sph = new THREE.Spherical(), _off = new THREE.Vector3(), _camOffset = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);

init().catch((err) => {
  console.error(err);
  bootEl.classList.add('err');
  bootMsg.textContent = '渲染初始化失败：' + (err && err.message ? err.message : String(err));
});

async function init() {
  document.title = `${TIMELINE_CONFIG.title} · Three.js TSL`;
  $('app-title').textContent = TIMELINE_CONFIG.title;
  $('legend-start').textContent = `${START_YEAR} · 起始`;
  $('legend-mid').textContent = Math.round((START_YEAR + END_YEAR) / 2);
  $('legend-end').textContent = `${END_YEAR} · 结束`;

  // ---------------- 渲染器 ----------------
  const renderer = new THREE.WebGPURenderer({
    antialias: (window.devicePixelRatio || 1) < 1.5,   // 高 DPR 下 MSAA 收益低、resolve 开销大
    trackTimestamp: true,          // 仅供需要时异步取样，几乎零开销
    powerPreference: 'high-performance',
    forceWebGL: FORCE_GL
  });
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  await renderer.init();
  $('app').appendChild(renderer.domElement);

  const isWGPU = !!(renderer.backend && renderer.backend.isWebGPUBackend);
  const tag = $('s-backend');
  tag.textContent = isWGPU ? 'WebGPU' : 'WebGL2';
  if (!isWGPU) tag.classList.add('warn');
  $('s-count').textContent = YEARS.length;

  // ---------------- 场景 ----------------
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x150d33, 0.0070);

  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 4000);
  camera.position.set(LAYOUT.camStart.x, LAYOUT.camStart.y, LAYOUT.camStart.z);

  const sky = createSky({ radius: 900, intensity: 1.0 });
  scene.add(sky.mesh);

  const env = await bakeEnvironment(renderer, sky.mesh);
  if (env) scene.environment = env;

  scene.add(createBackdrop());
  scene.add(createGround());

  scene.add(new THREE.HemisphereLight(0x9dbcff, 0x270b3d, 0.55));
  scene.add(new THREE.AmbientLight(0x27305c, 0.9));
  const keyLight = new THREE.DirectionalLight(0xcfe0ff, 1.15);
  keyLight.position.set(-40, 90, 40);
  scene.add(keyLight);
  const rimA = new THREE.PointLight(0x46d8ff, 2000, 520, 2);
  rimA.position.set(-74, 44, -10);
  scene.add(rimA);
  const rimB = new THREE.PointLight(0xff54c8, 2000, 520, 2);
  rimB.position.set(74, 44, -10);
  scene.add(rimB);
  const backA = new THREE.PointLight(0x5f7bff, 1400, 420, 2);
  backA.position.set(-60, 40, 46);
  scene.add(backA);
  const backB = new THREE.PointLight(0xff5ec8, 1400, 420, 2);
  backB.position.set(60, 40, 46);
  scene.add(backB);

  const pillars = createPillars(scene);
  const dust = createDust(scene, 1400, { zOffset: 12, spreadZ: 130, spreadX: 210, spreadY: 40, size: 0.09 });

  // ---------------- 后期 ----------------
  const postfx = createRenderPipeline(renderer, scene, camera);
  const renderPipeline = postfx.renderPipeline;

  // ---------------- 控制 ----------------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(LAYOUT.camTarget.x, LAYOUT.camTarget.y, LAYOUT.camTarget.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 14;
  controls.maxDistance = 420;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.update();
  state.baseAz = controls.getAzimuthalAngle();
  state.basePol = controls.getPolarAngle();
  controls.addEventListener('start', () => setAutoRotate(false));

  // ---------------- HUD ----------------
  $('p-fog').addEventListener('input', (e) => { scene.fog.density = 0.0070 * (e.target.value / 100); });
  $('p-exp').addEventListener('input', (e) => { renderer.toneMappingExposure = 0.86 * (e.target.value / 100); });
  $('p-rough').addEventListener('input', (e) => { pillars.setRoughnessScale(e.target.value / 100); });
  $('b-rot').addEventListener('click', () => setAutoRotate(!state.autoRotate));
  $('b-cruise').addEventListener('click', () => setCruise(!state.cruise));
  $('b-labels').addEventListener('click', (e) => {
    state.showLabels = !state.showLabels;
    pillars.labelMesh.visible = state.showLabels;
    e.target.classList.toggle('on', state.showLabels);
  });
  $('b-reset').addEventListener('click', () => resetView(true));
  $('b-quality').addEventListener('click', (e) => {
    const order = ['auto', 'ultra', 'eco'];
    const next = order[(order.indexOf(quality.mode) + 1) % order.length];
    applyQuality(next);
  });

  const QUALITY_LABEL = { auto: '画质：自动', ultra: '画质：极致', eco: '画质：省电' };

  function applyQuality(mode) {
    quality.mode = mode;
    if (mode === 'ultra') {
      quality.dpr = quality.dprMax;
      quality.fpsCap = 0;
    } else if (mode === 'eco') {
      quality.dpr = Math.min(1, quality.dprMax);
      quality.fpsCap = 30;                       // 省电：限制 30fps
    } else {
      quality.fpsCap = 0;
      quality.dpr = quality.dprMax;              // 自动：先给满，撑不住再降
    }
    quality.cooldown = 60;
    quality.probeWait = 0;
    const btn = $('b-quality');
    btn.textContent = QUALITY_LABEL[mode];
    btn.classList.toggle('on', mode === 'ultra');
    applyResolution();
  }

  function applyResolution() {
    if (Math.abs(renderer.getPixelRatio() - quality.dpr) < 0.02) return;
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function setAutoRotate(on) {
    state.autoRotate = on;
    $('b-rot').classList.toggle('on', on);
    if (on) {
      state.baseAz = controls.getAzimuthalAngle();
      state.basePol = controls.getPolarAngle();
    }
  }

  function setCruise(on) {
    state.cruise = on;
    controls.enabled = !on;
    $('b-cruise').classList.toggle('on', on);
    if (!on) {
      controls.target.set(LAYOUT.camTarget.x, LAYOUT.camTarget.y, LAYOUT.camTarget.z);
      controls.update();
    }
  }

  function resetView(moveCamera) {
    setCruise(false);
    setAutoRotate(true);
    if (moveCamera) {
      camera.position.set(LAYOUT.camStart.x, LAYOUT.camStart.y, LAYOUT.camStart.z);
      controls.target.set(LAYOUT.camTarget.x, LAYOUT.camTarget.y, LAYOUT.camTarget.z);
      controls.update();
      state.baseAz = controls.getAzimuthalAngle();
      state.basePol = controls.getPolarAngle();
    }
  }

  // ---------------- 拾取：只打 1 个 InstancedMesh；悬停直接改 instanceColor ----------------
  const tip = $('tip');
  const el = renderer.domElement;

  el.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    tip.style.transform = `translate(-50%, -118%) translate(${e.clientX}px, ${e.clientY}px)`;
  }, { passive: true });
  el.addEventListener('pointerdown', () => { if (state.hovered >= 0) focusOn(state.hovered); });

  function focusOn(index) {
    const L = pillars.entryAt(index);
    if (!L) return;
    _dir.set(0, 0, -1).applyAxisAngle(_up, L.yaw).multiplyScalar(26);
    state.focus = {
      from: camera.position.clone(),
      to: _v2.set(L.x + _dir.x, LAYOUT.y + L.h * 0.55 + 6, L.z + _dir.z).clone(),
      targetFrom: controls.target.clone(),
      targetTo: _v3.set(L.x, LAYOUT.y + L.h * 0.5, L.z).clone(),
      t: 0
    };
    setCruise(false);
    setAutoRotate(false);
  }

  // ---------------- 循环 ----------------
  const timer = new THREE.Timer();
  timer.connect(document);

  let fpsAcc = 0, fpsFrames = 0, hudAcc = 0;
  let cpuSubmit = 0, gpuMs = 0, lastDrawCalls = 0, lastTris = 0;
  let gpuSample = 0, lastGpuProbe = 0, gpuProbePending = false;
  // 显示刷新节拍（滚动最小值）：无头 / 低刷屏上 33ms 的帧不该被当成「性能不足」
  quality.refreshMs = 16.7;
  quality.targetCostMs = 13.5;
  quality.warmup = 120;      // 预热期帧数

  const loop = (timestamp) => {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.1);
    const t = timer.getElapsed();

    sky.mesh.rotation.y = t * 0.006;
    sky.auroraShift.value = Math.sin(t * 0.05) * 0.6;

    if (state.showLabels) pillars.updateLabels(camera);   // billboard + 防重叠 LOD（一次性写完整批矩阵）

    if (state.focus) {
      const f = state.focus;
      f.t = Math.min(1, f.t + dt / 1.1);
      const e = easeInOut(f.t);
      camera.position.lerpVectors(f.from, f.to, e);
      controls.target.lerpVectors(f.targetFrom, f.targetTo, e);
      if (f.t >= 1) state.focus = null;
      controls.update();
    } else if (state.cruise) {
      state.cruiseU = (state.cruiseU + dt / 46) % 1;
      const u = state.cruiseU;
      const halfSpan = LAYOUT.span * 0.84;
      const x = THREE.MathUtils.lerp(-halfSpan, halfSpan, easeInOut(u));
      const z = -62 + Math.sin(u * Math.PI) * 8;
      camera.position.set(x, 15 + Math.sin(u * Math.PI * 2) * 3.5, z);
      controls.target.set(x * 0.92, 9 + Math.sin(u * Math.PI) * 2, z + 62);
      camera.lookAt(controls.target);
    } else if (state.autoRotate) {
      // 呼吸镜头：直接动相机位置（OrbitControls 每帧会从实际位置反推球坐标，安全）
      _off.copy(camera.position).sub(controls.target);
      _sph.setFromVector3(_off);
      _sph.theta = state.baseAz + Math.sin(t * 0.11) * 0.12;
      _sph.phi = THREE.MathUtils.clamp(state.basePol + Math.sin(t * 0.16) * 0.05, 0.35, Math.PI * 0.49);
      camera.position.copy(controls.target).add(_camOffset.setFromSpherical(_sph));
      controls.update();
    } else {
      controls.update();
    }

    // 悬停拾取
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pillars.pickables, false);
    const hitId = hits.length ? hits[0].instanceId : -1;
    if (hitId !== state.hovered) {
      state.hovered = hitId;
      pillars.setHover(hitId);
      el.style.cursor = hitId >= 0 ? 'pointer' : 'default';
      if (hitId >= 0) {
        const L = pillars.entryAt(hitId);
        tip.style.opacity = '1';
        $('tip-year').textContent = L.year;
        $('tip-tag').textContent = L.tag;
        $('tip-meta').textContent = `高度 ${L.h.toFixed(1)} · 第 ${L.i + 1} / ${YEARS.length} 根`;
        const dot = tip.querySelector('.dot');
        dot.style.background = `hsl(${L.hsl[0]} 95% 66%)`;
        dot.style.boxShadow = `0 0 12px hsl(${L.hsl[0]} 95% 66%)`;
      } else {
        tip.style.opacity = '0';
      }
    }

    // 省电档限帧：跳过渲染，保留交互更新
    const now = timestamp || 0;
    if (quality.fpsCap > 0) {
      const interval = 1000 / quality.fpsCap;
      if (now - quality.capLast < interval - 1.5) return;
      quality.capLast = now;
    }

    const t0 = performance.now();
    renderPipeline.render();
    cpuSubmit += ((performance.now() - t0) - cpuSubmit) * 0.1;

    if (BENCH) {
      const ts = renderer.info.render.timestamp || 0;
      if (ts > 0) gpuMs += ((ts > 1000 ? ts / 1e6 : ts) - gpuMs) * 0.1;   // 兼容 ns / ms 两种量纲
      lastDrawCalls = renderer.info.render.drawCalls;
      lastTris = renderer.info.render.triangles;
    }

    // ---- 显示节拍估计（滚动最小值，缓慢回升以适应刷新率变化） ----
    const frameMs = dt * 1000;
    if (frameMs < quality.refreshMs) quality.refreshMs = Math.max(6.9, frameMs);
    else quality.refreshMs = Math.min(34, quality.refreshMs + 0.02);

    // ---- 每 2 秒异步采一次真实 GPU 耗时（不阻塞渲染） ----
    if (!gpuProbePending && now - lastGpuProbe > 2000) {
      lastGpuProbe = now;
      gpuProbePending = true;
      renderer.resolveTimestampsAsync('render')
        .then(() => {
          const ts = renderer.info.render.timestamp || 0;
          if (ts > 0) gpuSample += ((ts > 1000 ? ts / 1e6 : ts) - gpuSample) * 0.5;
        })
        .catch(() => {})
        .finally(() => { gpuProbePending = false; });
    }

    // ---- 自适应分辨率：以真实 GPU+CPU 成本为主，显示节拍为辅 ----
    quality.frameEma += (frameMs - quality.frameEma) * 0.08;
    // 启动预热期：前 120 帧在编译着色器 / 建管线，不参与调档决策
    if (quality.warmup > 0) quality.warmup--;
    if (quality.mode === 'auto' && quality.warmup === 0) {
      const cost = gpuSample > 0 ? (cpuSubmit + gpuSample) : 0;
      const tooHeavy = cost > 0 ? cost > quality.targetCostMs : quality.frameEma > quality.refreshMs * 1.28;
      const roomy = cost > 0 ? cost < quality.targetCostMs * 0.80 : quality.frameEma < quality.refreshMs * 1.02;

      if (quality.cooldown > 0) quality.cooldown--;
      else if (tooHeavy && quality.dpr > 0.7) {
        quality.dpr = Math.max(0.7, quality.dpr * 0.88);
        applyResolution();
        quality.cooldown = 90; quality.probeWait = 600;
      } else if (quality.probeWait > 0) {
        quality.probeWait--;
      } else if (roomy && quality.dpr < quality.dprMax - 0.02) {
        quality.dpr = Math.min(quality.dprMax, quality.dpr * 1.05);
        applyResolution();
        quality.cooldown = 60; quality.probeWait = 600;
      }
    }

    // HUD（每 0.5s 一次，避免频繁写 DOM）
    fpsAcc += dt; fpsFrames++; hudAcc += dt;
    if (hudAcc >= 0.5) {
      $('s-fps').textContent = (fpsFrames / fpsAcc).toFixed(0) + ' fps';
      $('s-dpr').textContent = quality.dpr.toFixed(2) + '×';
      if (BENCH) {
        $('s-gpu').textContent = gpuMs.toFixed(2) + ' ms';
        $('s-cpu').textContent = cpuSubmit.toFixed(2) + ' ms';
        $('s-calls').textContent = lastDrawCalls;
        $('s-progs').textContent = renderer.info.memory.programs;
        $('s-tris').textContent = (lastTris / 1000).toFixed(1) + 'k';
      }
      fpsAcc = 0; fpsFrames = 0; hudAcc = 0;
    }
  };

  renderer.setAnimationLoop(loop);

  // 页签隐藏即停渲染（后台不空转）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      timer.reset();
      renderer.setAnimationLoop(loop);
    }
  });

  // resize：rAF 内统一处理，避免连续触发时重复分配 render target
  let resizePending = false;
  window.addEventListener('resize', () => {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }, { passive: true });

  if (BENCH) {
    window.timelineBench = () => ({
      gpuMs: +gpuMs.toFixed(2), cpuMs: +cpuSubmit.toFixed(2),
      drawCalls: lastDrawCalls, triangles: lastTris,
      programs: renderer.info.memory.programs, dpr: quality.dpr,
      frameEma: +quality.frameEma.toFixed(2)
    });
  }

  requestAnimationFrame(() => {
    setTimeout(() => {
      bootEl.classList.add('hide');
      setTimeout(() => (bootEl.style.display = 'none'), 800);
    }, 200);
  });

  // 调试入口
  window.timeline = {
    config: TIMELINE_CONFIG,
    renderer, scene, camera, controls, sky, pillars, dust, postfx, renderPipeline,
    state, quality, timer, applyQuality
  };
}

function easeInOut(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** 地面：TSL 网格 + 距离淡出，远处交给雾 */
function createGround() {
  const geo = new THREE.PlaneGeometry(1600, 1600);
  const mat = new THREE.MeshStandardNodeMaterial({
    color: 0x0c0c22,
    metalness: 0.92,
    roughness: 0.26,
    envMapIntensity: 0.85
  });

  mat.colorNode = Fn(() => {
    const p = positionWorld.xz;
    const cell = p.div(8.0);
    const g = cell.fract().sub(0.5).abs();
    const lineMask = float(1.0).sub(smoothstep(float(0.0), float(0.05), min(g.x, g.y)));

    const dist = positionWorld.sub(cameraPosition).length();
    const fade = float(1.0).sub(smoothstep(float(45.0), float(300.0), dist));
    const axis = float(1.0).sub(smoothstep(float(0.0), float(1.6), p.y.abs()));

    const base = mix(color(0x0a0a1c), color(0x2b4f96), lineMask.mul(0.30).mul(fade));
    return base.add(color(0x4a6bdc).mul(axis.mul(fade).mul(0.22)));
  })();

  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.015;
  ground.name = 'ground';
  return ground;
}
