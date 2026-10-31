/**
 * 后期链路。每一段都可以在 config.js 里单独开关和调参。
 *
 *   scenePass -> bloom -> rgbShift -> vignette -> grain -> colorSplit -> output
 */
import * as THREE from 'three/webgpu';
import {
  pass, vec3, float, step, screenUV, frameId,
  mx_noise_float, luminance
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';
import { TIMELINE_CONFIG } from './config.js';

export function createRenderPipeline(renderer, scene, camera, options = {}) {
  const base = TIMELINE_CONFIG.postfx;
  const cfg = {
    ...base,
    ...options,
    bloom: { ...base.bloom, ...options.bloom },
    rgbShift: { ...base.rgbShift, ...options.rgbShift },
    vignette: { ...base.vignette, ...options.vignette },
    grain: { ...base.grain, ...options.grain },
    colorSplit: { ...base.colorSplit, ...options.colorSplit }
  };

  const scenePass = pass(scene, camera);
  const colorNode = scenePass.getTextureNode('output');

  // 调试：window.__TIMELINE_FX_OFF = 'bloom,bloom0,colorSplit,rgbShift,vignette,grain,all'
  // 用于逐段排查画面异常；生产环境不设置即可。
  const fxOff = new Set(
    String((typeof window !== 'undefined' && window.__TIMELINE_FX_OFF) || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const on = (name) => !fxOff.has(name) && !fxOff.has('all');
  cfg.bloom.enabled = cfg.bloom.enabled && on('bloom0');
  cfg.colorSplit.enabled = cfg.colorSplit.enabled && on('colorSplit');
  cfg.rgbShift.enabled = cfg.rgbShift.enabled && on('rgbShift');
  cfg.vignette.enabled = cfg.vignette.enabled && on('vignette');
  cfg.grain.enabled = cfg.grain.enabled && on('grain');

  let out = colorNode;
  let bloomNode = null;

  if (cfg.bloom.enabled) {
    bloomNode = bloom(colorNode, cfg.bloom.strength, cfg.bloom.radius, cfg.bloom.threshold);
    bloomNode.setResolutionScale(cfg.bloom.resolutionScale);
    if (on('bloom')) out = out.add(bloomNode);
  }

  if (cfg.rgbShift.enabled) {
    out = rgbShift(out, cfg.rgbShift.amount, cfg.rgbShift.angle);
  }

  if (cfg.vignette.enabled) {
    const radial = screenUV.sub(0.5).length();
    const vignette = float(1.0)
      .sub(step(float(cfg.vignette.outer), radial).mul(cfg.vignette.strength))
      .add(cfg.vignette.min);
    out = out.mul(vignette);
  }

  if (cfg.grain.enabled) {
    const grainSeed = frameId.mul(cfg.grain.speed);
    const grain = mx_noise_float(vec3(screenUV.mul(cfg.grain.scale), grainSeed))
      .mul(cfg.grain.amount);
    out = out.add(vec3(grain));
  }

  if (cfg.colorSplit.enabled) {
    const lum = luminance(out.rgb);
    const [sr, sg, sb] = cfg.colorSplit.shadow;
    const [hr, hg, hb] = cfg.colorSplit.highlight;
    const [lo] = cfg.colorSplit.threshold;
    // 拆色相加后必须夹在 0..1。原来的 add 在浅色画面上会把颜色推过 1，
    // 超出范围的数值会让后续 tone mapping 反色，出现黑色块。
    out = out.add(vec3(sr, sg, sb).mul(float(1.0).sub(lum)));
    out = out.add(vec3(hr, hg, hb).mul(step(float(lo), lum)));
    out = out.clamp(0.0, 1.0);
  }

  const renderPipeline = new THREE.RenderPipeline(renderer);
  renderPipeline.outputNode = out;

  return {
    renderPipeline,
    bloomNode,
    colorNode,
    finalNode: out,
    withoutBloom: colorNode
  };
}
