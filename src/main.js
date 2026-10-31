/**
 * 立体时间轴 · 装配层（工程级性能版）
 * ------------------------------------------------------------------
 * 渲染：WebGPURenderer（不支持时自动退回 WebGL2 后端，代码不用改）
 * 效果：天幕 / 背景色幕 / 实心立柱 / 浮尘 / RenderPipeline 后期，全部 TSL 节点手写
 *
 * 性能设计（实测数字见 README「性能」一节）：
 *   · 全场景实例化：柱体 / 光壳 / 顶球 / 光池 / 年份牌 = 5 个 InstancedMesh
 *     → draw call 从 ~124 降到 5，program 从 156 降到个位数
 *   · 颜色走 instanceColor、相位走 instanceIndex、尺寸走 instanceMatrix，
 *     消灭「每根柱子一套着色器程序」的常量烘焙问题
 *   · 年份牌纹理合并成 1 张动态图集
 *   · 每帧零堆分配（临时向量 / 矩阵 / 球坐标全部预分配复用）
 *   · 自适应分辨率 + 画质档位（自动 / 极致 / 省电）+ 页签隐藏即停渲染
 *   · 配置面板的“调试 / 性能读数”开启 GPU 时间戳与性能读数
 */
import * as THREE from 'three/webgpu';
import {
  Fn, float, color, step, min, positionWorld, cameraPosition
} from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { TIMELINE_CONFIG } from './config.js';
import { YEARS, START_YEAR, END_YEAR, LAYOUT } from './data.js';
import { createSky, createBackdrop, bakeEnvironment } from './sky.js';
import { createPillars } from './pillars.js';
import { createDust } from './dust.js';
import { createRenderPipeline } from './postfx.js';
import { initSettingsUI } from './settings-ui.js';
import { toColor, toLinearRGB } from './color.js';

const bootEl = document.getElementById('boot');
const bootMsg = document.getElementById('boot-msg');
const $ = (id) => document.getElementById(id);

const CONFIG = TIMELINE_CONFIG;
const BENCH = Boolean(CONFIG.debug.bench);
const FORCE_GL = Boolean(CONFIG.debug.forceWebGL);
const UI = CONFIG.ui;
const LABELS = CONFIG.meta.labels;

initSettingsUI();

const state = {
  autoRotate: CONFIG.camera.autoRotate.enabled,
  cruise: false,
  showLabels: CONFIG.pillars.labels.enabled,
  cruiseU: 0,
  baseAz: 0,
  basePol: 1.35,
  hovered: -1,
  focus: null
};

// 画质档位：自动 = 从最高分辨率起步，撑不住才降，稳定后缓慢试探回升
const dprMax = Math.min(
  window.devicePixelRatio || 1,
  CONFIG.quality.dpr.max
);
const configuredDprStart = Number(CONFIG.quality.dpr.start);
const dprStart = CONFIG.quality.dpr.start === null || !Number.isFinite(configuredDprStart)
  ? dprMax
  : THREE.MathUtils.clamp(configuredDprStart, CONFIG.quality.dpr.min, dprMax);
const quality = {
  mode: CONFIG.quality.initialMode,
  dprMax,
  dpr: dprStart,
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
  document.documentElement.lang = CONFIG.meta.lang;
  document.title = `${CONFIG.meta.title} · ${CONFIG.meta.titleSuffix}`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', CONFIG.meta.description);
  $('app-title').textContent = CONFIG.meta.title;
  $('app-intro').innerHTML = CONFIG.meta.introHtml;
  $('legend-start').textContent = `${START_YEAR} · ${LABELS.start}`;
  $('legend-mid').textContent = Math.round((START_YEAR + END_YEAR) / 2);
  $('legend-end').textContent = `${END_YEAR} · ${LABELS.end}`;
  bootMsg.textContent = LABELS.loading;
  $('b-rot').textContent = LABELS.autoRotate;
  $('b-cruise').textContent = LABELS.cruise;
  $('b-labels').textContent = LABELS.labels;
  $('b-reset').textContent = LABELS.reset;
  document.querySelectorAll('[data-ui-label]').forEach((node) => {
    const label = LABELS[node.dataset.uiLabel];
    if (label) node.textContent = label;
  });
  $('p-fog').closest('.row').querySelector('.k').textContent = LABELS.fog;
  $('p-exp').closest('.row').querySelector('.k').textContent = LABELS.exposure;
  $('p-rough').closest('.row').querySelector('.k').textContent = LABELS.roughness;
  document.body.classList.toggle('bench', BENCH);
  document.body.classList.toggle('no-title', !UI.showTitle);
  document.body.classList.toggle('no-hud', !UI.showHud);
  document.body.classList.toggle('no-legend', !UI.showLegend);
  $('p-fog').closest('.row').hidden = !UI.showFogControl;
  $('p-exp').closest('.row').hidden = !UI.showExposureControl;
  $('p-rough').closest('.row').hidden = !UI.showRoughnessControl;
  $('b-quality').hidden = !UI.showQualityButton;
  $('b-labels').hidden = !UI.showLabelsButton;
  $('p-fog').value = UI.fogControlValue;
  $('p-exp').value = UI.exposureControlValue;
  $('p-rough').value = UI.roughnessControlValue;

  // ---------------- 渲染器 ----------------
  const renderer = new THREE.WebGPURenderer({
    antialias: (window.devicePixelRatio || 1) < CONFIG.scene.antialias.maxDpr,
    trackTimestamp: CONFIG.scene.trackTimestamp,
    powerPreference: CONFIG.scene.powerPreference,
    forceWebGL: FORCE_GL
  });
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = resolveToneMapping(CONFIG.scene.toneMapping);
  renderer.toneMappingExposure = CONFIG.scene.exposure;
  await renderer.init();
  $('app').appendChild(renderer.domElement);

  const isWGPU = !!(renderer.backend && renderer.backend.isWebGPUBackend);
  const tag = $('s-backend');
  tag.textContent = isWGPU ? 'WebGPU' : 'WebGL2';
  if (!isWGPU) tag.classList.add('warn');
  $('s-count').textContent = YEARS.length;

  // ---------------- 场景 ----------------
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CONFIG.scene.fog.color, CONFIG.scene.fog.density);
  // 天幕关掉时也不能露出画布的黑底，用天空最底色兜底。
  scene.background = toColor(CONFIG.sky.colors.bottom);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
  camera.position.set(CONFIG.camera.start.x, CONFIG.camera.start.y, CONFIG.camera.start.z);

  const sky = CONFIG.sky.enabled ? createSky(CONFIG.sky) : null;
  if (sky) scene.add(sky.mesh);

  if (sky) {
    const env = await bakeEnvironment(renderer, sky.mesh);
    if (env) scene.environment = env;
  }

  if (CONFIG.backdrop.enabled) scene.add(createBackdrop(CONFIG.backdrop));
  if (CONFIG.ground.enabled) scene.add(createGround(CONFIG.ground));

  for (const lightConfig of CONFIG.scene.lights) {
    const light = createConfiguredLight(lightConfig);
    if (light) scene.add(light);
  }

  const pillars = createPillars(scene, CONFIG.pillars);
  const dust = CONFIG.dust.enabled
    ? createDust(scene, CONFIG.dust.count, CONFIG.dust)
    : { mesh: null, speed: { value: 0 } };

  // ---------------- 后期 ----------------
  const postfx = createRenderPipeline(renderer, scene, camera, CONFIG.postfx);
  const renderPipeline = postfx.renderPipeline;

  // ---------------- 控制 ----------------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(CONFIG.camera.target.x, CONFIG.camera.target.y, CONFIG.camera.target.z);
  controls.enableDamping = CONFIG.camera.orbit.enableDamping;
  controls.dampingFactor = CONFIG.camera.orbit.dampingFactor;
  controls.minDistance = CONFIG.camera.orbit.minDistance;
  controls.maxDistance = CONFIG.camera.orbit.maxDistance;
  controls.maxPolarAngle = Math.PI * CONFIG.camera.orbit.maxPolarAngleFactor;
  controls.update();
  state.baseAz = controls.getAzimuthalAngle();
  state.basePol = controls.getPolarAngle();
  controls.addEventListener('start', () => setAutoRotate(false));

  // ---------------- HUD ----------------
  $('p-fog').addEventListener('input', (e) => {
    scene.fog.density = CONFIG.scene.fog.density * (e.target.value / 100);
  });
  $('p-exp').addEventListener('input', (e) => {
    renderer.toneMappingExposure = CONFIG.scene.exposure * (e.target.value / 100);
  });
  $('p-rough').addEventListener('input', (e) => { pillars.setRoughnessScale(e.target.value / 100); });
  $('b-rot').addEventListener('click', () => setAutoRotate(!state.autoRotate));
  $('b-cruise').addEventListener('click', () => setCruise(!state.cruise));
  $('b-labels').addEventListener('click', (e) => {
    state.showLabels = !state.showLabels;
    pillars.labelMesh.visible = state.showLabels;
    e.target.classList.toggle('on', state.showLabels);
  });
  $('b-reset').addEventListener('click', () => resetView(true));
  $('b-quality').addEventListener('click', () => {
    const order = CONFIG.quality.order;
    const next = order[(order.indexOf(quality.mode) + 1) % order.length];
    applyQuality(next);
  });

  function applyQuality(mode, options = {}) {
    const modeConfig = CONFIG.quality.modes[mode];
    if (!modeConfig) return;

    quality.mode = mode;
    const keepConfiguredStart = options.initial && CONFIG.quality.dpr.start !== null;
    const modeDpr = Number(modeConfig.dpr);
    quality.dpr = keepConfiguredStart
      ? dprStart
      : modeConfig.dpr === 'max'
        ? quality.dprMax
        : Number.isFinite(modeDpr)
          ? THREE.MathUtils.clamp(modeDpr, CONFIG.quality.dpr.min, quality.dprMax)
          : quality.dprMax;
    quality.fpsCap = Math.max(0, Number(modeConfig.fpsCap) || 0);
    quality.cooldown = CONFIG.quality.auto.upscaleCooldown;
    quality.probeWait = 0;
    const btn = $('b-quality');
    btn.textContent = modeConfig.label;
    btn.classList.toggle('on', mode !== 'auto');
    applyResolution();
  }

  function applyResolution() {
    if (Math.abs(renderer.getPixelRatio() - quality.dpr) < CONFIG.quality.dpr.minDelta) return;
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
      controls.target.set(CONFIG.camera.target.x, CONFIG.camera.target.y, CONFIG.camera.target.z);
      controls.update();
    }
  }

  function resetView(moveCamera) {
    setCruise(false);
    setAutoRotate(true);
    if (moveCamera) {
      camera.position.set(CONFIG.camera.start.x, CONFIG.camera.start.y, CONFIG.camera.start.z);
      controls.target.set(CONFIG.camera.target.x, CONFIG.camera.target.y, CONFIG.camera.target.z);
      controls.update();
      state.baseAz = controls.getAzimuthalAngle();
      state.basePol = controls.getPolarAngle();
    }
  }

  applyQuality(quality.mode, { initial: true });
  setAutoRotate(state.autoRotate);
  $('b-labels').classList.toggle('on', state.showLabels);
  pillars.labelMesh.visible = state.showLabels;

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
    const focus = CONFIG.camera.focus;
    _dir.set(0, 0, -1).applyAxisAngle(_up, L.yaw).multiplyScalar(focus.distance);
    state.focus = {
      from: camera.position.clone(),
      to: _v2.set(
        L.x + _dir.x,
        LAYOUT.y + L.h * focus.heightFactor + focus.lift,
        L.z + _dir.z
      ).clone(),
      targetFrom: controls.target.clone(),
      targetTo: _v3.set(L.x, LAYOUT.y + L.h * focus.targetHeightFactor, L.z).clone(),
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
  quality.targetCostMs = CONFIG.quality.auto.targetCostMs;
  quality.warmup = CONFIG.quality.auto.warmupFrames;

  const loop = (timestamp) => {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.1);
    const t = timer.getElapsed();

    if (sky) {
      sky.mesh.rotation.y = t * CONFIG.sky.rotationSpeed;
    }

    if (state.showLabels) pillars.updateLabels(camera);   // billboard + 防重叠 LOD（一次性写完整批矩阵）

    if (state.focus) {
      const f = state.focus;
      f.t = Math.min(1, f.t + dt / CONFIG.camera.focus.duration);
      const e = easeInOut(f.t);
      camera.position.lerpVectors(f.from, f.to, e);
      controls.target.lerpVectors(f.targetFrom, f.targetTo, e);
      if (f.t >= 1) state.focus = null;
      controls.update();
    } else if (state.cruise) {
      const cruise = CONFIG.camera.cruise;
      state.cruiseU = (state.cruiseU + dt / cruise.duration) % 1;
      const u = state.cruiseU;
      const halfSpan = LAYOUT.span * cruise.halfSpanFactor;
      const x = THREE.MathUtils.lerp(-halfSpan, halfSpan, easeInOut(u));
      const z = cruise.z + Math.sin(u * Math.PI) * cruise.zArc;
      camera.position.set(
        x,
        cruise.y + Math.sin(u * Math.PI * 2) * cruise.yArc,
        z
      );
      controls.target.set(
        x * cruise.targetXFactor,
        cruise.targetY + Math.sin(u * Math.PI) * cruise.targetArc,
        z + cruise.targetZOffset
      );
      camera.lookAt(controls.target);
    } else if (state.autoRotate) {
      // 呼吸镜头：直接动相机位置（OrbitControls 每帧会从实际位置反推球坐标，安全）
      const auto = CONFIG.camera.autoRotate;
      _off.copy(camera.position).sub(controls.target);
      _sph.setFromVector3(_off);
      _sph.theta = state.baseAz + Math.sin(t * auto.azimuthSpeed) * auto.azimuthAmplitude;
      _sph.phi = THREE.MathUtils.clamp(
        state.basePol + Math.sin(t * auto.polarSpeed) * auto.polarAmplitude,
        auto.minPolar,
        Math.PI * auto.maxPolarFactor
      );
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
        $('tip-meta').textContent = `${LABELS.height} ${L.h.toFixed(1)} · `
          + `${LABELS.itemPrefix} ${L.i + 1} / ${YEARS.length} ${LABELS.itemSuffix}`;
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
    const autoQuality = CONFIG.quality.auto;
    if (frameMs < quality.refreshMs) {
      quality.refreshMs = Math.max(autoQuality.refreshMinMs, frameMs);
    } else {
      quality.refreshMs = Math.min(
        autoQuality.refreshMaxMs,
        quality.refreshMs + autoQuality.refreshRisePerFrame
      );
    }

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
    quality.frameEma += (frameMs - quality.frameEma) * autoQuality.frameEmaAlpha;
    // 启动预热期：前 120 帧在编译着色器 / 建管线，不参与调档决策
    if (quality.warmup > 0) quality.warmup--;
    if (quality.mode === 'auto' && quality.warmup === 0) {
      const cost = gpuSample > 0 ? (cpuSubmit + gpuSample) : 0;
      const tooHeavy = cost > 0
        ? cost > quality.targetCostMs
        : quality.frameEma > quality.refreshMs * autoQuality.heavyRatio;
      const roomy = cost > 0
        ? cost < quality.targetCostMs * autoQuality.costRoomyRatio
        : quality.frameEma < quality.refreshMs * autoQuality.roomyRatio;

      if (quality.cooldown > 0) quality.cooldown--;
      else if (tooHeavy && quality.dpr > CONFIG.quality.dpr.min) {
        quality.dpr = Math.max(CONFIG.quality.dpr.min, quality.dpr * autoQuality.downscale);
        applyResolution();
        quality.cooldown = autoQuality.downscaleCooldown;
        quality.probeWait = autoQuality.probeFrames;
      } else if (quality.probeWait > 0) {
        quality.probeWait--;
      } else if (roomy && quality.dpr < quality.dprMax - CONFIG.quality.dpr.minDelta) {
        quality.dpr = Math.min(quality.dprMax, quality.dpr * autoQuality.upscale);
        applyResolution();
        quality.cooldown = autoQuality.upscaleCooldown;
        quality.probeWait = autoQuality.probeFrames;
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
    state, quality, timer, applyQuality,
    /**
     * 配置面板的实时预览通道：能在当前场景里直接改的参数就立刻生效，
     * 改不了的返回 false，由面板提示「应用并重载」。
     * 只处理「改属性/换节点」这类便宜操作，不重建几何。
     */
    live(path, value) {
      if (typeof path !== 'string') return false;

      if (path === 'scene.exposure') {
        renderer.toneMappingExposure = Number(value);
        return true;
      }
      if (path === 'scene.fog.density') {
        scene.fog.density = Number(value);
        return true;
      }
      if (path === 'scene.fog.color') {
        scene.fog.color.copy(toColor(String(value)));
        return true;
      }
      if (path === 'camera.fov') {
        camera.fov = Number(value);
        camera.updateProjectionMatrix();
        return true;
      }
      if (path === 'camera.autoRotate.enabled') {
        setAutoRotate(Boolean(value));
        return true;
      }
      if (path === 'sky.intensity' && sky) {
        sky.skyIntensity.value = Number(value);
        return true;
      }
      if (path.startsWith('sky.colors.') && sky) {
        const key = path.slice('sky.colors.'.length);
        const target = sky.colorUniforms?.[key];
        if (!target) return false;
        const [r, g, b] = toLinearRGB(String(value), sky.base.colors[key]);
        target.value.set(r, g, b);
        sky.cfg = { ...sky.cfg, colors: { ...sky.cfg.colors, [key]: String(value) } };
        // 天幕底色同时决定兜底背景色，避免关掉天幕时两处不一致。
        if (key === 'bottom') scene.background = toColor(String(value));
        return true;
      }
      return false;
    }
  };
}

function easeInOut(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function resolveToneMapping(name) {
  const mappings = {
    none: THREE.NoToneMapping,
    linear: THREE.LinearToneMapping,
    reinhard: THREE.ReinhardToneMapping,
    cineon: THREE.CineonToneMapping,
    aces: THREE.ACESFilmicToneMapping,
    acesfilmic: THREE.ACESFilmicToneMapping,
    agx: THREE.AgXToneMapping,
    neutral: THREE.NeutralToneMapping
  };
  return mappings[String(name).toLowerCase()] ?? THREE.ACESFilmicToneMapping;
}

function createConfiguredLight(def) {
  const color = def.color;
  const intensity = def.intensity;
  let light = null;

  if (def.type === 'hemisphere') {
    light = new THREE.HemisphereLight(def.skyColor, def.groundColor, intensity);
  } else if (def.type === 'ambient') {
    light = new THREE.AmbientLight(color, intensity);
  } else if (def.type === 'directional') {
    light = new THREE.DirectionalLight(color, intensity);
  } else if (def.type === 'point') {
    light = new THREE.PointLight(color, intensity, def.distance, def.decay);
  }

  if (light && Array.isArray(def.position)) {
    light.position.fromArray(def.position);
  }
  return light;
}

/** 地面：TSL 网格 + 距离淡出，远处交给雾 */
function createGround(cfg) {
  const geo = new THREE.PlaneGeometry(cfg.size, cfg.size);
  const mat = new THREE.MeshStandardNodeMaterial({
    color: cfg.material.color,
    metalness: cfg.material.metalness,
    roughness: cfg.material.roughness,
    envMapIntensity: cfg.material.envMapIntensity
  });

  mat.colorNode = Fn(() => {
    const p = positionWorld.xz;
    const cell = p.div(cfg.cellSize);
    const g = cell.fract().sub(0.5).abs();
    const lineMask = float(1.0).sub(
      step(float(cfg.lineWidth), min(g.x, g.y))
    );

    const dist = positionWorld.sub(cameraPosition).length();
    const fade = step(dist, float(cfg.fadeFar));
    const axis = float(1.0).sub(step(float(cfg.axisWidth), p.y.abs()));

    const base = color(cfg.colors.base).mix(
      color(cfg.colors.grid),
      lineMask.mul(fade)
    );
    return base.add(color(cfg.colors.axis).mul(axis.mul(fade).mul(cfg.axisOpacity)));
  })();

  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = cfg.y;
  ground.name = 'ground';
  return ground;
}
