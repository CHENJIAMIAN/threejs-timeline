/**
 * 后期：全部用 TSL 节点串起来，跑在 RenderPipeline 上。
 *
 *   scenePass ──▶ bloom（高光溢出）──▶ 原图 + bloom ──▶ 色差 ──▶ 暗角 ──▶ 胶片颗粒 ──▶ 输出
 *
 * 输出节点的色彩管理交给 RenderPipeline（outputColorTransform = true），
 * 所以这里所有运算都在线性空间里做，最后统一 tone mapping + sRGB。
 */
import * as THREE from 'three/webgpu';
import {
  pass, Fn, vec4, vec3, vec2, float, mix, smoothstep, screenUV, frameId, time,
  mx_noise_float, uniform, luminance
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';

export function createRenderPipeline(renderer, scene, camera) {
  const scenePass = pass(scene, camera);
  const colorNode = scenePass.getTextureNode('output');

  // --- Bloom：阈值调高一点，只让顶部光球 / 立柱亮带发光，不长毛边 ---
  const bloomNode = bloom(colorNode, 0.36, 0.45, 1.0);
  bloomNode.setResolutionScale(0.25);   // bloom 只在 1/4 分辨率上跑：视觉几乎无损，mip 链采样开销砍一半以上

  let out = colorNode.add(bloomNode);

  // --- 镜头色差：越靠边缘越明显 ---
  out = rgbShift(out, 0.0010, 0.0);

  // --- 暗角：把视线压到画面中央的立柱上 ---
  const radial = screenUV.sub(0.5).length();
  const vignette = float(1.0).sub(smoothstep(float(0.34), float(0.92), radial)).mul(0.52).add(0.48);
  out = out.mul(vignette);

  // --- 胶片颗粒：每帧换一张噪声，静态画面也有呼吸感 ---
  const grainSeed = frameId.mul(3.7);
  const grain = mx_noise_float(vec3(screenUV.mul(1600.0), grainSeed)).mul(0.028);
  out = out.add(vec3(grain));

  // --- 极轻的冷暖分离：阴影偏紫，高光偏青 ---
  const lum = luminance(out.rgb);
  out = out.add(vec3(-0.012, -0.004, 0.02).mul(float(1.0).sub(lum)));
  out = out.add(vec3(0.006, 0.014, 0.02).mul(smoothstep(float(0.7), float(1.4), lum)));

  const renderPipeline = new THREE.RenderPipeline(renderer);
  renderPipeline.outputNode = out;

  // 对外暴露各段句柄：方便调试与做「关掉某段」的性能消融
  return {
    renderPipeline,
    bloomNode,
    colorNode,
    finalNode: out,
    withoutBloom: colorNode
  };
}
