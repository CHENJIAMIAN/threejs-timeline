/**
 * 立体时间轴默认配置。
 *
 * 三种覆盖方式（优先级从低到高）：
 *   1. 直接修改 DEFAULT_CONFIG
 *   2. 在 main.js 加载前设置 window.TIMELINE_CONFIG_OVERRIDES
 *   3. 页面右上角配置面板保存到 localStorage 的覆盖值
 */
import { isHexColor } from './color.js';

const DEFAULT_CONFIG = {
  meta: {
    lang: 'zh-CN',
    title: '立体时间轴',
    titleSuffix: 'Three.js TSL',
    description: '可配置年份范围的 Three.js TSL 立体时间轴，支持 WebGPU / WebGL2。',
    introHtml: 'Three.js <code>r186</code> · <code>WebGPURenderer</code> · 全部效果由 <code>TSL</code> 节点编写<br />实心立柱 + 纯色天幕 ｜ 拖拽旋转 · 滚轮缩放 · 悬停查看年份<br />全场景实例化（5 个 InstancedMesh）· 自适应分辨率 · 点击右上角“配置”调整场景',
    labels: {
      start: '起始',
      end: '结束',
      height: '高度',
      itemPrefix: '第',
      itemSuffix: '根',
      backend: '渲染后端',
      fps: '帧率',
      dpr: '渲染倍率',
      columns: '立柱 / 年份',
      gpu: 'GPU 帧时间',
      cpu: 'CPU 提交',
      drawCalls: 'Draw call',
      programs: '着色器程序',
      triangles: '三角面',
      loading: '正在初始化 WebGPU / TSL 渲染管线…',
      errorPrefix: '渲染初始化失败：',
      autoRotate: '自动旋转',
      cruise: '巡游',
      labels: '年份牌',
      reset: '重置视角',
      fog: '雾浓度',
      exposure: '曝光',
      roughness: '立柱表面粗糙度'
    }
  },

  timeline: {
    startYear: 1996,
    endYear: 2026,
    height: {
      min: 4.0,
      max: 15.0
    },
    colors: {
      hueStart: 206,
      hueEnd: 258,
      huePower: 0.92,
      saturationBase: 0.18,
      saturationBoost: 0.10,
      lightnessBase: 0.72,
      lightnessHeat: 0.10,
      tint: { saturation: 0.40, lightness: 0.56 },
      vivid: { saturation: 0.56, lightness: 0.60 },
      rim: { saturation: 0.80, lightness: 0.46 }
    },
    fallbackHeat: {
      min: 0.20,
      max: 1.56,
      power: 1
    },
    events: {
      1996: { tag: 'JavaScript 1.0 随 Netscape 2 发布', heat: 0.20 },
      1997: { tag: 'DHTML / IE4 —— 网页开始“动”', heat: 0.24 },
      1998: { tag: 'Google 成立，搜索改变世界', heat: 0.29 },
      1999: { tag: 'XMLHttpRequest 诞生', heat: 0.33 },
      2000: { tag: '互联网泡沫破裂', heat: 0.36 },
      2001: { tag: 'Wikipedia 上线', heat: 0.40 },
      2002: { tag: 'Web 标准运动（W3C）', heat: 0.44 },
      2003: { tag: 'WordPress 发布', heat: 0.48 },
      2004: { tag: 'Gmail 发布 / Web 2.0 大会', heat: 0.53 },
      2005: { tag: 'AJAX 命名 · jQuery 发布', heat: 0.60 },
      2006: { tag: 'AWS EC2 · Twitter 上线', heat: 0.66 },
      2007: { tag: 'iPhone 发布，移动端起点', heat: 0.74 },
      2008: { tag: 'Chrome 发布 · HTML5 草案', heat: 0.80 },
      2009: { tag: 'Node.js 发布', heat: 0.86 },
      2010: { tag: '响应式设计 · HTML5 Canvas 普及', heat: 0.90 },
      2011: { tag: 'WebGL 1.0 正式发布', heat: 0.95 },
      2012: { tag: 'TypeScript 发布', heat: 1.00 },
      2013: { tag: 'React 开源', heat: 1.06 },
      2014: { tag: 'Vue.js · HTML5 成为 W3C 推荐标准', heat: 1.10 },
      2015: { tag: 'ES2015（ES6）发布', heat: 1.14 },
      2016: { tag: 'Vue 2.0 · WebGL 2.0', heat: 1.18 },
      2017: { tag: 'WebAssembly 落地浏览器', heat: 1.22 },
      2018: { tag: 'Deno 首次公开', heat: 1.24 },
      2019: { tag: 'WebAssembly 成为 W3C 推荐标准', heat: 1.26 },
      2020: { tag: 'Vue 3 正式发布', heat: 1.29 },
      2021: { tag: 'WebGPU 进入 Chrome 试验', heat: 1.32 },
      2022: { tag: 'ChatGPT 发布', heat: 1.38 },
      2023: { tag: 'Chrome 113 稳定支持 WebGPU', heat: 1.42 },
      2024: { tag: 'Safari 18 支持 WebGPU', heat: 1.45 },
      2025: { tag: 'AI Agent / MCP 生态爆发', heat: 1.50 },
      2026: { tag: '现在 · 进行时', heat: 1.56 }
    }
  },

  layout: {
    span: 86,
    recurve: 22,
    drift: 3.2,
    driftPower: 2,
    jitter: 0.9,
    width: 2.3,
    y: 0,
    rail: {
      segments: 96,
      color: '#8e8e93',
      opacity: 0.18
    }
  },

  camera: {
    fov: 48,
    near: 0.5,
    far: 4000,
    start: { x: 0, y: 11, z: -48 },
    target: { x: 0, y: 12, z: 2 },
    orbit: {
      enableDamping: true,
      dampingFactor: 0.055,
      minDistance: 14,
      maxDistance: 420,
      maxPolarAngleFactor: 0.495
    },
    autoRotate: {
      enabled: true,
      azimuthAmplitude: 0.12,
      azimuthSpeed: 0.11,
      polarAmplitude: 0.05,
      polarSpeed: 0.16,
      minPolar: 0.35,
      maxPolarFactor: 0.49
    },
    cruise: {
      duration: 46,
      halfSpanFactor: 0.84,
      z: -62,
      zArc: 8,
      y: 15,
      yArc: 3.5,
      targetY: 9,
      targetArc: 2,
      targetXFactor: 0.92,
      targetZOffset: 62
    },
    focus: {
      distance: 26,
      duration: 1.1,
      heightFactor: 0.55,
      lift: 6,
      targetHeightFactor: 0.5
    }
  },

  scene: {
    fog: {
      color: '#f5f5f7',
      density: 0
    },
    toneMapping: 'ACESFilmic',
    exposure: 1.0,
    antialias: {
      maxDpr: 1.5
    },
    trackTimestamp: true,
    powerPreference: 'high-performance',
    lights: [
      { type: 'hemisphere', skyColor: '#ffffff', groundColor: '#e5e5ea', intensity: 1.0 },
      { type: 'ambient', color: '#ffffff', intensity: 0.55 },
      { type: 'directional', color: '#ffffff', intensity: 1.35, position: [-40, 90, 40] },
      { type: 'point', color: '#d6e4ff', intensity: 620, distance: 520, decay: 2, position: [-74, 44, -10] },
      { type: 'point', color: '#eae6ff', intensity: 620, distance: 520, decay: 2, position: [74, 44, -10] }
    ]
  },

  ground: {
    enabled: true,
    size: 1600,
    y: -0.015,
    cellSize: 8,
    lineWidth: 0.05,
    lineOpacity: 0.12,
    axisWidth: 1.6,
    axisOpacity: 0.22,
    fadeNear: 45,
    fadeFar: 300,
    material: {
      color: '#ebebef',
      metalness: 0.0,
      roughness: 0.92,
      envMapIntensity: 0.35
    },
    colors: {
      base: '#ebebef',
      grid: '#d7d7dc',
      axis: '#cdcdd2'
    }
  },

  sky: {
    enabled: true,
    radius: 900,
    intensity: 1.0,
    rotationSpeed: 0.006,
    auroraShiftSpeed: 0.05,
    auroraShiftAmount: 0.6,
    colors: {
      bottom: '#f5f5f7',
      mid: '#ececf1',
      top: '#e1e1e8',
      auroraA: '#dbe7ff',
      auroraB: '#e7e1ff',
      horizon: '#ffffff',
      zenithWarm: '#f2f2f4',
      star: '#ffffff'
    },
    shader: {
      midStop: 0.42,
      topStop: 0.56,
      auroraFlowSpeed: 0.028,
      auroraNoiseScale: 2.4,
      auroraNoiseYScale: 1.6,
      auroraNoiseFlow: 1.3,
      auroraOctaves: 4,
      auroraLacunarity: 2.1,
      auroraGain: 0.55,
      auroraBandLow: 0.30,
      auroraBandHigh: 0.66,
      auroraFadeHigh: 0.98,
      auroraFadeLow: 0.72,
    auroraStrength: 0.30,
      starScale: 240,
      starThresholdLow: 0.72,
      starThresholdHigh: 0.98,
      starStrength: 0.06,
      haloCenter: 0.47,
      haloFalloff: 9,
      haloStrength: 0.5,
      zenithPower: 6,
      zenithStrength: 0.04
    }
  },

  backdrop: {
    enabled: false,
    distance: 170,
    y: 46,
    sizeX: 760,
    sizeY: 340,
    flowSpeed: 0.02,
    colors: {
      left: '#e8eeff',
      middle: '#f0edff',
      right: '#f5f5f7',
      fog: '#f5f5f7'
    },
    shader: {
      noiseScaleX: 2.6,
      noiseScaleY: 1.9,
      octaves: 4,
      lacunarity: 2.0,
      gain: 0.55,
      cloudBias: 0.62,
      latticeMix: 0.45,
      latticeBias: 0.78,
      intensity: 0.20,
      edgeXStart: 0.26,
      edgeXEnd: 0.74,
      edgeYStart: 0.22,
      edgeYEnd: 0.78
    }
  },

  dust: {
    enabled: true,
    count: 700,
    speed: 1.0,
    size: 0.09,
    spreadX: 210,
    spreadY: 40,
    spreadZ: 130,
    zOffset: 12,
    driftX: 1.2,
    driftY: 1.7,
    driftSpeed: 0.22,
    fadeNear: 60,
    fadeFar: 230,
    opacity: 0.30,
    minOpacity: 0.03,
    tintMultiplier: 0.9,
    colors: {
      a: '#ffffff',
      b: '#8e8e93'
    }
  },

  pillars: {
    glass: {
      material: {
        color: '#ffffff',
        metalness: 0,
        roughness: 0.5,
        transmission: 0,
        thicknessFactor: 2.2,
        ior: 1.47,
        dispersion: 0,
        iridescence: 0,
        iridescenceIOR: 1.30,
        iridescenceThicknessMin: 140,
        iridescenceThicknessMax: 380,
        clearcoat: 0,
        clearcoatRoughness: 0.5,
        attenuationDistance: 2.4,
        specularIntensity: 0.35,
        transparent: false,
        envMapIntensity: 0.55
      },
      grainScale: { x: 20, y: 6, z: 20 },
      grainOctaves: 3,
      grainLacunarity: 2.0,
      grainGain: 0.6,
      speckScale: 100,
      roughnessBase: 0.30,
      roughnessGrain: 0.22,
      roughnessSpeck: 0.10,
      roughnessMin: 0.04,
      roughnessMax: 0.62,
      emissive: {
        fresnelPower: 1.6,
        outlinePower: 4.0,
        topBandLow: 0.78,
        bottomBandHigh: 0.14,
        fresnel: 0.06,
        outline: 0,
        top: 0,
        bottom: 0,
        body: 0,
        breathe: 0,
        phaseStep: 0.31,
        breatheSpeed: 0.7
      }
    },
    shell: {
      enabled: false,
      scaleX: 1.09,
      scaleY: 1.02,
      power: 2.2,
      strength: 0.55
    },
    orb: {
      offset: 0.55,
      minRadius: 0.42,
      maxRadius: 0.87,
      sizeFactor: 0.52,
      pulseSpeed: 1.1,
      pulseAmount: 0.18,
      intensity: 0.85,
      phaseStep: 0.37
    },
    pool: {
      enabled: false,
      sizeFactor: 3.4,
      falloffStart: 0.06,
      falloffEnd: 1.0,
      strength: 0.28,
      y: 0.012
    },
    contact: {
      enabled: true,
      sizeFactor: 2.6,
      falloffStart: 0.12,
      falloffEnd: 1.0,
      opacity: 0.10,
      y: 0.006
    },
    labels: {
      enabled: true,
      width: 4.6,
      height: 2.3,
      tier: 2.4,
      offset: 1.45,
      overlapX: 0.74,
      overlapY: 0.84,
      accentLightness: 44,
      atlas: {
        cellWidth: 512,
        cellHeight: 256,
        minCols: 4,
        maxCols: 12,
        rowsPerCol: 8,
        anisotropy: 2
      },
      year: {
        font: '700 124px "Segoe UI", system-ui, sans-serif',
        y: 78,
        color: '#1d1d1f',
        shadowBlur: 26
      },
      line: {
        y: 144,
        halfWidth: 78,
        width: 2,
        shadowBlur: 12
      },
      tag: {
        fontFamily: '"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
        weight: 500,
        maxFont: 50,
        minFont: 22,
        y: 204,
        widthPadding: 26
      }
    }
  },

  postfx: {
    bloom: {
      enabled: true,
      strength: 0.12,
      radius: 0.35,
      threshold: 1.0,
      resolutionScale: 0.25
    },
    rgbShift: {
      enabled: true,
      amount: 0.0002,
      angle: 0.0
    },
    vignette: {
      enabled: true,
      inner: 0.34,
      outer: 0.92,
      min: 0.78,
      strength: 0.22
    },
    grain: {
      enabled: true,
      scale: 1600,
      amount: 0.010,
      speed: 3.7
    },
    colorSplit: {
      enabled: true,
      shadow: [-0.004, -0.002, 0.006],
      highlight: [0.002, 0.004, 0.006],
      threshold: [0.7, 1.4]
    }
  },

  quality: {
    initialMode: 'auto',
    order: ['auto', 'ultra', 'eco'],
    dpr: {
      max: 2,
      min: 0.7,
      start: null,
      minDelta: 0.02
    },
    auto: {
      targetCostMs: 13.5,
      warmupFrames: 120,
      refreshMinMs: 6.9,
      refreshMaxMs: 34,
      refreshRisePerFrame: 0.02,
      frameEmaAlpha: 0.08,
      heavyRatio: 1.28,
      roomyRatio: 1.02,
      costRoomyRatio: 0.80,
      downscale: 0.88,
      upscale: 1.05,
      downscaleCooldown: 90,
      upscaleCooldown: 60,
      probeFrames: 600
    },
    modes: {
      auto: { label: '画质：自动', dpr: 'max', fpsCap: 0 },
      ultra: { label: '画质：极致', dpr: 'max', fpsCap: 0 },
      eco: { label: '画质：省电', dpr: 1, fpsCap: 30 }
    }
  },

  ui: {
    showTitle: true,
    showHud: true,
    showLegend: true,
    showFogControl: false,
    showExposureControl: true,
    showRoughnessControl: true,
    showQualityButton: true,
    showLabelsButton: true,
    fogControlValue: 100,
    exposureControlValue: 100,
    roughnessControlValue: 100
  },

  debug: {
    bench: false,
    forceWebGL: false
  }
};

export const CONFIG_STORAGE_KEY = 'threejs-timeline-config-v1';
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clone(child)])
    );
  }
  return value;
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) return clone(base);
  const out = clone(base);
  for (const [key, value] of Object.entries(override)) {
    if (BLOCKED_KEYS.has(key)) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key])
      ? deepMerge(out[key], value)
      : clone(value);
  }
  return out;
}

/**
 * 颜色字段兜底：凡是默认值是 `#...` 的字符串键，都必须是合法 hex。
 * 面板输入、localStorage 里的旧值、手写覆盖都可能带进脏颜色，
 * 在配置边界拦一次，比让非法字符串流进 shader 常量层便宜得多。
 */
function normalizeColors(node, defaults) {
  if (!isPlainObject(node) || !isPlainObject(defaults)) return;
  for (const key of Object.keys(node)) {
    const value = node[key];
    const fallback = defaults[key];
    if (typeof value === 'string' && typeof fallback === 'string' && fallback.startsWith('#')) {
      if (!isHexColor(value)) node[key] = fallback;
    } else if (isPlainObject(value) && isPlainObject(fallback)) {
      normalizeColors(value, fallback);
    }
  }
}

function normalize(config) {
  const startRaw = Number(config.timeline.startYear);
  const endRaw = Number(config.timeline.endYear);
  const startYear = Number.isFinite(startRaw)
    ? Math.trunc(startRaw)
    : DEFAULT_CONFIG.timeline.startYear;
  const endYear = Number.isFinite(endRaw)
    ? Math.trunc(endRaw)
    : DEFAULT_CONFIG.timeline.endYear;
  config.timeline.startYear = Math.min(startYear, endYear);
  config.timeline.endYear = Math.max(startYear, endYear);

  const hueStart = Number(config.timeline.colors.hueStart);
  const hueEnd = Number(config.timeline.colors.hueEnd);
  const safeHueStart = Number.isFinite(hueStart)
    ? hueStart
    : DEFAULT_CONFIG.timeline.colors.hueStart;
  const safeHueEnd = Number.isFinite(hueEnd)
    ? hueEnd
    : DEFAULT_CONFIG.timeline.colors.hueEnd;
  config.timeline.colors.hueStart = Math.min(safeHueStart, safeHueEnd);
  config.timeline.colors.hueEnd = Math.max(safeHueStart, safeHueEnd);

  const heightMin = Number(config.timeline.height.min);
  const heightMax = Number(config.timeline.height.max);
  config.timeline.height.min = Number.isFinite(heightMin)
    ? Math.max(0.01, heightMin)
    : DEFAULT_CONFIG.timeline.height.min;
  config.timeline.height.max = Math.max(
    config.timeline.height.min,
    Number.isFinite(heightMax) ? heightMax : DEFAULT_CONFIG.timeline.height.max
  );
  const dprMin = Number(config.quality.dpr.min);
  const dprMax = Number(config.quality.dpr.max);
  config.quality.dpr.min = Number.isFinite(dprMin)
    ? Math.max(0.1, dprMin)
    : DEFAULT_CONFIG.quality.dpr.min;
  config.quality.dpr.max = Math.max(
    config.quality.dpr.min,
    Number.isFinite(dprMax) ? dprMax : DEFAULT_CONFIG.quality.dpr.max
  );
  config.quality.order = (Array.isArray(config.quality.order)
    ? config.quality.order
    : Object.keys(config.quality.modes)
  ).filter((mode) => Boolean(config.quality.modes[mode]));
  if (config.quality.order.length === 0) {
    config.quality.order = Object.keys(config.quality.modes);
  }
  if (!config.quality.modes[config.quality.initialMode]) {
    config.quality.initialMode = config.quality.order[0];
  }
  normalizeColors(config, DEFAULT_CONFIG);
  return config;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function readGlobalOverrides() {
  if (typeof window === 'undefined') return {};
  return isPlainObject(window.TIMELINE_CONFIG_OVERRIDES)
    ? window.TIMELINE_CONFIG_OVERRIDES
    : {};
}

function readStoredOverrides() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage?.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveConfig() {
  const withGlobal = deepMerge(DEFAULT_CONFIG, readGlobalOverrides());
  const withStored = deepMerge(withGlobal, readStoredOverrides());
  return normalize(withStored);
}

export const DEFAULT_TIMELINE_CONFIG = deepFreeze(clone(DEFAULT_CONFIG));
export const TIMELINE_CONFIG = deepFreeze(resolveConfig());
