import { TIMELINE_CONFIG } from './config.js';

/**
 * 示例事件数据。key 是年份，heat 决定立柱高度与顶部光球大小，tag 是悬浮文案。
 * 换主题时只改 EVENT_DATA，或让未配置的年份自动使用平滑高度。
 */
export const EVENT_DATA = {
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
};

export const START_YEAR = TIMELINE_CONFIG.startYear;
export const END_YEAR = TIMELINE_CONFIG.endYear;
const YEARS_LENGTH = END_YEAR - START_YEAR + 1;

export const YEARS = Array.from(
  { length: YEARS_LENGTH },
  (_, i) => {
    const year = START_YEAR + i;
    const event = EVENT_DATA[year];
    const progress = YEARS_LENGTH <= 1 ? 0.5 : i / (YEARS_LENGTH - 1);
    return {
      year,
      tag: event?.tag ?? '',
      heat: event?.heat ?? 0.20 + progress * 1.36
    };
  }
);

/** 每根立柱的高度（世界单位） */
export const HEIGHT_MIN = 4.0;
export const HEIGHT_MAX = 15.0;

/**
 * 时间轴整体布局：立柱沿 X 轴排开，两端向远端（+Z）缓缓后退，
 * 于是「中间近、两端远」——雾会把首尾年份吞进紫色里。
 */
export const LAYOUT = {
  span: 86,           // 时间轴总跨度（世界单位）
  recurve: 22,        // 两端后退深度
  drift: 3.2,         // 侧向漂移幅度，避免死板的直线
  width: 2.3,         // 立柱截面边长
  y: 0,               // 立柱底部高度
  camStart: { x: 0, y: 11, z: -48 },
  camTarget: { x: 0, y: 12, z: 2 }
};

/** 年份配色：从 hueStart 到 hueEnd，走一条彩虹曲线 */
export function yearColor(heat, i, n) {
  const t = n <= 1 ? 0 : i / (n - 1);
  const hue = TIMELINE_CONFIG.hueStart
    + (TIMELINE_CONFIG.hueEnd - TIMELINE_CONFIG.hueStart) * Math.pow(t, 0.92);
  const sat = 0.72 + 0.22 * Math.sin(t * Math.PI);
  const light = 0.52 + 0.14 * heat;
  return { hsl: [hue, sat, light], t };
}

export function yearHeight(heat) {
  return HEIGHT_MIN + (HEIGHT_MAX - HEIGHT_MIN) * heat;
}

/** 计算第 i 根立柱的世界坐标与朝向 */
export function pillarTransform(i, n) {
  const t = n <= 1 ? 0 : i / (n - 1);
  const u = Math.abs(t - 0.5) * 2;                              // 0 = 正中, 1 = 两端
  // 相机在 -Z 侧朝 +Z 看：世界 +X 落在屏幕左边，所以让起始年份拿 +X。
  const x = (0.5 - t) * LAYOUT.span;

  const zAt = (tt) => Math.pow(Math.abs(tt - 0.5) * 2, 2) * LAYOUT.recurve
                    + Math.sin(tt * Math.PI * 1.7) * LAYOUT.drift;
  const z = zAt(t) + Math.sin(i * 2.399) * 0.9;

  // 朝向：顺着后退方向轻微偏转，形成自然的扇形
  const dt = 1 / Math.max(1, n - 1);
  const dz = zAt(Math.min(1, t + dt)) - zAt(Math.max(0, t - dt));
  const dx = -2 * dt * LAYOUT.span;          // x 已反向，dx 跟着反向
  const yaw = -Math.atan2(dz, dx) * 0.55;

  return { x, z, t, u, yaw };
}
