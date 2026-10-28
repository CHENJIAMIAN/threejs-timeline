/**
 * 时间轴外观与数据范围配置。
 *
 * 直接改这里即可复用到别的主题；也可以在 URL 上临时覆盖：
 *   ?start=2000&end=2024&title=我的时间轴
 */
const DEFAULT_CONFIG = {
  title: '立体时间轴',
  startYear: 1996,
  endYear: 2026,
  hueStart: 190,
  hueEnd: 325
};

function readNumber(params, name, fallback) {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

const params = typeof window === 'undefined'
  ? new URLSearchParams()
  : new URLSearchParams(window.location.search);

const startYear = readNumber(params, 'start', DEFAULT_CONFIG.startYear);
const endYear = readNumber(params, 'end', DEFAULT_CONFIG.endYear);
const hueStart = readNumber(params, 'hueStart', DEFAULT_CONFIG.hueStart);
const hueEnd = readNumber(params, 'hueEnd', DEFAULT_CONFIG.hueEnd);

export const TIMELINE_CONFIG = Object.freeze({
  title: params.get('title')?.trim() || DEFAULT_CONFIG.title,
  startYear: Math.min(startYear, endYear),
  endYear: Math.max(startYear, endYear),
  hueStart: Math.min(hueStart, hueEnd),
  hueEnd: Math.max(hueStart, hueEnd)
});
