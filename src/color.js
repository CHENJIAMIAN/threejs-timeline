/**
 * 颜色解析的唯一入口。
 *
 * 背景：配置里的颜色是 `#rrggbb` 字符串，此前天幕用 `parseFloat` 手工切分十六进制，
 * 遇到含字母的通道（如 `f5`）会得到 NaN，进而让整块材质 shader 编译失败。
 * 这里把「字符串 → 颜色」收敛成一个契约：
 *   - 只接受 `#rgb` / `#rrggbb`（大小写、缺省 # 都容忍）；
 *   - 解析结果是线性工作色彩空间（three 的 ColorManagement 约定），
 *     不要再手工 `/255` 后直接喂给 TSL 常量，否则会把 sRGB 当线性用、整体偏亮；
 *   - 非法输入回退到调用方给的默认值，绝不产生 NaN。
 */
import * as THREE from 'three/webgpu';

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value) {
  return typeof value === 'string' && HEX_PATTERN.test(value.trim());
}

/** 解析成 0–1 的 sRGB 分量；非法返回 null（不抛错、不产生 NaN）。 */
export function parseHexColor(value) {
  if (!isHexColor(value)) return null;
  let body = value.trim().replace(/^#/, '');
  if (body.length === 3) {
    body = body.split('').map((ch) => ch + ch).join('');
  }
  const num = Number.parseInt(body, 16);
  if (!Number.isFinite(num)) return null;
  return {
    r: ((num >> 16) & 0xff) / 255,
    g: ((num >> 8) & 0xff) / 255,
    b: (num & 0xff) / 255
  };
}

/** 转成 THREE.Color（线性工作空间）。非法值回退到 fallback，再不行回退白色。 */
export function toColor(value, fallback = '#ffffff') {
  const rgb = parseHexColor(value) ?? parseHexColor(fallback) ?? { r: 1, g: 1, b: 1 };
  return new THREE.Color().setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
}

/** 转成线性分量的三元组，给 TSL 的 vec3/float 常量用。 */
export function toLinearRGB(value, fallback = '#ffffff') {
  const color = toColor(value, fallback);
  return [color.r, color.g, color.b];
}
