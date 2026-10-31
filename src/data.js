import { TIMELINE_CONFIG } from './config.js';

const timeline = TIMELINE_CONFIG.timeline;

/** 示例事件数据。换主题时改 config.js 的 timeline.events，或从外部覆盖。 */
export const EVENT_DATA = timeline.events;

export const START_YEAR = timeline.startYear;
export const END_YEAR = timeline.endYear;
const YEARS_LENGTH = END_YEAR - START_YEAR + 1;

export const YEARS = Array.from(
  { length: YEARS_LENGTH },
  (_, i) => {
    const year = START_YEAR + i;
    const event = EVENT_DATA[year];
    const progress = YEARS_LENGTH <= 1 ? 0.5 : i / (YEARS_LENGTH - 1);
    const fallback = timeline.fallbackHeat;
    const fallbackHeat = fallback.min
      + (fallback.max - fallback.min) * Math.pow(progress, fallback.power);
    return {
      year,
      tag: event?.tag ?? '',
      heat: Number.isFinite(Number(event?.heat)) ? Number(event.heat) : fallbackHeat
    };
  }
);

/** 每根立柱的高度（世界单位） */
export const HEIGHT_MIN = timeline.height.min;
export const HEIGHT_MAX = timeline.height.max;

/** 时间轴整体布局。相机、布局、标签尺寸均来自 config.js。 */
export const LAYOUT = {
  ...TIMELINE_CONFIG.layout,
  camStart: TIMELINE_CONFIG.camera.start,
  camTarget: TIMELINE_CONFIG.camera.target
};

/** 年份配色：从 hueStart 到 hueEnd，走一条彩虹曲线 */
export function yearColor(heat, i, n) {
  const colors = timeline.colors;
  const t = n <= 1 ? 0 : i / (n - 1);
  const hue = colors.hueStart
    + (colors.hueEnd - colors.hueStart) * Math.pow(t, colors.huePower);
  const sat = colors.saturationBase
    + colors.saturationBoost * Math.sin(t * Math.PI);
  const light = colors.lightnessBase + colors.lightnessHeat * heat;
  return { hsl: [hue, sat, light], t };
}

export function yearHeight(heat) {
  return HEIGHT_MIN + (HEIGHT_MAX - HEIGHT_MIN) * heat;
}

/** 计算第 i 根立柱的世界坐标与朝向 */
export function pillarTransform(i, n) {
  const t = n <= 1 ? 0 : i / (n - 1);
  const u = Math.abs(t - 0.5) * 2;
  const x = (0.5 - t) * LAYOUT.span;

  const zAt = (tt) => Math.pow(Math.abs(tt - 0.5) * 2, LAYOUT.driftPower) * LAYOUT.recurve
                    + Math.sin(tt * Math.PI * 1.7) * LAYOUT.drift;
  const z = zAt(t) + Math.sin(i * 2.399) * LAYOUT.jitter;

  const dt = 1 / Math.max(1, n - 1);
  const dz = zAt(Math.min(1, t + dt)) - zAt(Math.max(0, t - dt));
  const dx = -2 * dt * LAYOUT.span;
  const yaw = -Math.atan2(dz, dx) * 0.55;

  return { x, z, t, u, yaw };
}
