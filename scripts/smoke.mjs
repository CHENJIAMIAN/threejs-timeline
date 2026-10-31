#!/usr/bin/env node
/**
 * 渲染冒烟检查（无第三方依赖，走 Chrome DevTools Protocol）。
 *
 * 目的：把「页面能打开、没报错、画出了东西」变成一条可重复执行的命令，
 * 而不是靠肉眼看截图。此前天空材质的 shader 编译失败只打 console.error，
 * 画面退化成一片白，人眼很容易当成「设计如此」——这条检查就是为了堵住那个缺口。
 *
 * 用法：
 *   node scripts/smoke.mjs                          # 连 127.0.0.1:9223 上的 Chrome
 *   node scripts/smoke.mjs --url http://localhost:8123/index.html
 *   node scripts/smoke.mjs --out docs/screenshot.png --reset-view
 *   CDP_PORT=9222 node scripts/smoke.mjs
 *
 * 常用参数：--wait 毫秒（截图前等待）、--reset-view（停自动旋转并复位视角）、
 *           --min-bytes（空白画面阈值）、--timeout。
 * 退出码：0 通过，1 失败。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(process.env.CDP_PORT || argValue('port', 9223));
const URL_TO_LOAD = argValue('url', 'http://localhost:8123/index.html');
const OUT = argValue('out', '');
const TIMEOUT_MS = Number(argValue('timeout', 30000));
const MIN_BYTES = Number(argValue('min-bytes', 20000));
const WAIT_MS = Number(argValue('wait', 2500));
const RESET_VIEW = args.includes('--reset-view');

// 这些是环境限制导致的噪音，不代表页面坏了：headless 下没有 WebGPU 适配器，
// 以及 powerPreference 在 Windows 上被忽略。
const IGNORED = [
  /No available adapters/i,
  /powerPreference option is currently ignored/i,
  /WebGPU is not available, running under WebGL2 backend/i
];

const problems = [];
const warnings = [];

async function connect() {
  const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  const handlers = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
      return;
    }
    for (const handler of handlers) handler(msg);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  return { ws, send, on: (fn) => handlers.push(fn), browser: version.Browser };
}

function classify(text, kind) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  if (IGNORED.some((re) => re.test(clean))) return;
  if (/Shader Error|NaN|is not compiled|program not valid|WebGLProgram/i.test(clean)) {
    problems.push(`${kind}: ${clean.slice(0, 400)}`);
  } else if (/error/i.test(kind)) {
    problems.push(`${kind}: ${clean.slice(0, 400)}`);
  } else {
    warnings.push(`${kind}: ${clean.slice(0, 200)}`);
  }
}

const main = async () => {
  const { ws, send, on, browser } = await connect();
  console.log(`[smoke] 已连接 ${browser} @ ${PORT}`);

  on((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (msg.params.type === 'error') classify(text, 'console.error');
      else if (msg.params.type === 'warning') classify(text, 'console.warning');
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      classify(d?.exception?.description || d?.text, 'exception');
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      classify(msg.params.entry.text, 'log.error');
    }
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  // 必须禁用缓存：python http.server 会回 304，改完代码仍看到旧结果。
  await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false
  }, sessionId);

  const started = Date.now();
  await send('Page.navigate', { url: `${URL_TO_LOAD}${URL_TO_LOAD.includes('?') ? '&' : '?'}smoke=${started}` }, sessionId);

  // 等 canvas 出现并且有尺寸（首帧渲染完成的最便宜信号）。
  let canvasInfo = null;
  while (Date.now() - started < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          const c = document.querySelector('canvas');
          if (!c || !c.width || !c.height) return null;
          const boot = document.getElementById('boot');
          return JSON.stringify({
            w: c.width, h: c.height,
            backend: c.getContext('webgpu') ? 'webgpu' : 'webgl2',
            booting: boot ? getComputedStyle(boot).display !== 'none' : false
          });
        })()`,
        returnByValue: true
      }, sessionId);
      if (res.result.value) {
        canvasInfo = JSON.parse(res.result.value);
        if (!canvasInfo.booting) break;
      }
    } catch {
      // 页面还在导航，继续等
    }
  }

  // 让动画多跑一会儿，把「首帧能画、后续帧报错」的情况也覆盖进来。
  await new Promise((r) => setTimeout(r, WAIT_MS));

  // 出图时可先复位视角、停掉自动旋转，避免每次截图角度都不一样。
  if (RESET_VIEW) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const rot = document.getElementById('b-rot');
        if (rot && rot.classList.contains('on')) rot.click();
        document.getElementById('b-reset')?.click();
        return 'reset';
      })()`,
      returnByValue: true
    }, sessionId);
    await new Promise((r) => setTimeout(r, 1800));
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
  const bytes = Buffer.from(shot.data, 'base64');

  if (OUT) {
    const abs = path.resolve(OUT);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, bytes);
    console.log(`[smoke] 截图已保存 ${abs} (${(bytes.length / 1024).toFixed(0)} KB)`);
  }

  await send('Target.closeTarget', { targetId });
  ws.close();

  if (!canvasInfo) problems.push('页面在超时内没有渲染出 canvas');
  else if (canvasInfo.booting) problems.push('启动遮罩一直没有消失，可能卡在初始化');
  // 全白/全黑的 PNG 压缩率极高，用体积做一道粗筛：正常画面远大于这个阈值。
  if (bytes.length < MIN_BYTES) problems.push(`截图只有 ${bytes.length} 字节，疑似空白画面`);

  console.log(`[smoke] canvas ${canvasInfo ? `${canvasInfo.w}x${canvasInfo.h} (${canvasInfo.backend})` : '无'}`);
  if (warnings.length) {
    console.log(`[smoke] 警告 ${warnings.length} 条（不计入失败）：`);
    warnings.slice(0, 5).forEach((w) => console.log(`  - ${w}`));
  }
  if (problems.length) {
    console.error(`[smoke] 失败，${problems.length} 个问题：`);
    problems.slice(0, 20).forEach((p) => console.error(`  - ${p}`));
    process.exitCode = 1;
    return;
  }
  console.log('[smoke] 通过：无 shader 报错、无未捕获异常、画面非空白');
};

main().catch((err) => {
  console.error(`[smoke] 执行失败：${err.message}`);
  process.exitCode = 1;
});
