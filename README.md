# 立体时间轴

[简体中文](./README.md) | [English](./README.en.md)

用 **Three.js r186 + TSL** 做的可配置 3D 时间轴：一年一根毛玻璃立柱，沿时间轴排开，两端退进紫雾里。

年份范围、标题、色带都集中在配置里，默认附带一份 Web 发展史示例数据。支持 WebGPU，浏览器不支持时自动退回 WebGL2。

![立体时间轴预览](./docs/screenshot.png)

## 特性

- **年份可配**：右上角“配置”面板可以改年份、标题、颜色、灯光、材质和后期效果。
- **数据可替换**：每年的事件文案和强度在 `src/config.js`，不绑定固定主题。
- **TSL 节点效果**：极光天幕、毛玻璃、菲涅尔边缘光、泛光、色差、暗角、颗粒。
- **实例化渲染**：立柱、光壳、顶球、地面光池、接地阴影、年份牌都走 `InstancedMesh`。
- **自适应画质**：自动 / 极致 / 省电三档，支持移动端和局域网访问。

## 快速开始

双击：

```bat
start.bat
```

或手动启动静态服务：

```bash
python -m http.server 8123
# 打开 http://localhost:8123/index.html
```

> 不要直接双击 `index.html`。ES module + importmap 在 `file://` 下会被 CORS 拦住。

### 局域网 / 手机

```bat
start.bat          :: http://<本机IP>:8123/index.html，WebGL2 兼容模式
start-https.bat    :: https://<本机IP>:8443/index.html，自签证书，WebGPU 可用
```

HTTPS 首次使用需要放行防火墙：

```bat
netsh advfirewall firewall add rule name="timeline-8443-lan" dir=in action=allow protocol=TCP localport=8443 remoteip=LocalSubnet
```

## 配置时间轴

默认配置集中在 `src/config.js` 的 `DEFAULT_CONFIG`。页面加载时按以下优先级合并：

1. `DEFAULT_CONFIG`
2. `window.TIMELINE_CONFIG_OVERRIDES`（在 `main.js` 前注入）
3. 配置面板保存到浏览器 `localStorage` 的覆盖值

配置按职责分区，改一个区域不会牵动其他模块：

| 区域 | 控制内容 |
| --- | --- |
| `meta` | 标题、页面描述、界面文案、加载/报错文字 |
| `timeline` | 年份、事件、高度范围、色带、默认热度 |
| `layout` | 时间轴跨度、弯曲、漂移、柱宽、导轨 |
| `camera` | 视角、轨道限制、自动旋转、巡游、聚焦动画 |
| `scene` | 雾、曝光、色调映射、抗锯齿、灯光列表 |
| `ground` / `sky` / `backdrop` / `dust` | 地面、天幕、背景幕、浮尘的颜色与效果 |
| `pillars` | 玻璃材质、光壳、顶球、光池、阴影、年份牌图集 |
| `postfx` | bloom、色差、暗角、颗粒、冷暖分离，均可单独关闭 |
| `quality` | DPR 上限、画质档位、自适应阈值、预热与冷却帧数 |
| `ui` / `debug` | 面板显隐、滑杆初值、性能面板、强制 WebGL |

### 页面配置面板

点击页面右上角“配置”打开面板。面板会根据 `src/config.js` 自动生成表单，新增配置项后不需要再手写控件。

- 支持数字、开关、颜色、普通文本、JSON 数组和 JSON 对象。
- 顶部搜索框可以按配置路径或中文名称筛选。
- “时间轴数据 → 每年内容”默认一年一行，可直接改年份、事件文案和热度，也能新增、删除。
- 点“批量编辑 JSON”可一次粘贴整份 `timeline.events`；切回逐行编辑会自动展开成每年一行。
- `scene.lights` 使用 JSON 编辑。
- 点击“应用并重载”后写入当前浏览器的 `localStorage`，刷新页面生效。
- 点击“恢复默认”只清除配置面板保存的值，不修改代码里的默认配置。
- URL 查询参数不再参与配置，避免分享链接时意外带入主题设置。

### 页面内覆盖

需要在部署环境中按主题切换时，在 `index.html` 的模块脚本前加入：

```html
<script>
  window.TIMELINE_CONFIG_OVERRIDES = {
    meta: { title: '产品进化史' },
    timeline: { startYear: 2000, endYear: 2024 },
    camera: { fov: 55 },
    postfx: { bloom: { strength: 0.5 } }
  };
</script>
```

### 替换事件

在配置面板搜索 `timeline.events`，编辑 JSON；也可以直接修改 `src/config.js`：

```js
timeline: {
  events: {
    2007: { tag: 'iPhone 发布，移动端起点', heat: 0.74 },
    2013: { tag: 'React 开源', heat: 1.06 },
    2022: { tag: 'ChatGPT 发布', heat: 1.38 }
  }
}
```

- `tag`：年份牌和悬停提示里显示的事件文案。
- `heat`：立柱高度、顶部光球大小和亮度。
- 未配置的年份由 `timeline.fallbackHeat` 生成平滑高度，文案留空。
- 面板中“热度”留空表示自动高度；已填写的年份，热度改成空值也会移除自定义热度。

## 交互

| 操作 | 效果 |
| --- | --- |
| 拖拽 / 滚轮 | 环绕、缩放 |
| 悬停立柱 | 显示年份、关键词、高度、序号 |
| 点击立柱 | 相机缓动聚焦 |
| 自动旋转 | 轻微呼吸镜头，手动拖拽后关闭 |
| 巡游 | 相机沿时间轴飞过 |
| 雾浓度 / 曝光 / 毛玻璃粗糙度 | 实时调参 |
| 年份牌 | 开关标签 |
| 右上角“配置” | 编辑全部场景配置并保存到当前浏览器 |

控制台调试入口：

```js
window.timeline.{scene,camera,controls,pillars,state,renderer}
```

在配置面板打开 `debug.bench` 可以显示 GPU 时间、Draw call、三角面等性能读数。

## 目录

```text
index.html      页面骨架 + 毛玻璃 HUD
src/config.js   全量默认配置 + 全局/localStorage 覆盖解析
src/color.js    颜色解析唯一入口（hex → 线性色，非法值兜底）
src/settings-ui.js  自动生成配置面板、校验并保存覆盖值
src/data.js     年份生成 + 布局与配色计算
src/main.js     场景装配、相机模式、悬停拾取、HUD
src/pillars.js  毛玻璃立柱、光壳、顶球、地面光池、年份牌图集
src/sky.js      极光天幕、背景色幕、环境贴图
src/dust.js     浮尘粒子
src/postfx.js   bloom、色差、暗角、颗粒、冷暖分离
scripts/smoke.mjs  渲染冒烟检查 + 截图（走 CDP）
serve-https.py  局域网 HTTPS 静态服务
```

## 实现说明

### 毛玻璃

`MeshPhysicalNodeMaterial` 使用 `transmission` 做透射，再用 TSL 覆写：

- `roughnessNode`：分形噪声形成喷砂玻璃颗粒。
- `thickness`：整根柱子固定厚度，不做上下变化。
- `emissiveNode`：菲涅尔边缘光、顶部亮带和底部亮区，均为硬边色块。

每根柱子外加一层放大的 `BackSide` 光壳，保证在雾和泛光背景里轮廓仍然清楚。

### 实例化

TSL 会把逐对象常量烘焙进 WGSL，如果每根柱子单独建材质，会产生大量 shader program。

开 `emissiveNode` 只叠加亮度，不做颜色混合；呼吸灯按帧切换开关。

这里统一使用单位几何：

- 颜色走 `instanceColor`
- 相位走 `instanceIndex`
- 尺寸和朝向走 `instanceMatrix`

年份牌会合并成一张动态图集，再用 `instanceIndex` 计算 UV。

### 性能

- 年份牌按屏幕空间做防重叠 LOD。
- bloom 使用降分辨率链路。
- 页签隐藏时停止渲染。
- 画质根据真实 GPU/CPU 成本自动调整。
- 主循环中的临时向量和矩阵全部预分配复用。

无头浏览器或远程桌面可能把帧率锁在 30Hz，不能直接用帧率判断真实性能；请在配置面板打开 `debug.bench`，以 GPU 时间和 Draw call 为准。

## 开发与验证

### 渲染冒烟检查

着色器编译失败只会打一条 `console.error`，画面照样出，很容易被当成「设计就是这样」。所以这里把「能打开、没报错、画出了东西」固化成一条命令：

```bash
# 先起静态服务（端口与脚本默认值一致）
python -m http.server 8123

# 另开一个带远程调试端口的 Chrome，例如：
#   chrome.exe --remote-debugging-port=9223 --headless=new

node scripts/smoke.mjs
```

检查项：shader 编译错误、未捕获异常、canvas 是否出图、截图体积（空白画面会被判失败）。退出码非 0 即失败，可直接接进 CI。

### 重拍 README 截图

```bash
node scripts/smoke.mjs --out docs/screenshot.png --reset-view --wait 4000
```

`--reset-view` 会停掉自动旋转并复位视角，保证每次出图角度一致。注意截图里的渲染后端随环境变化（headless 通常退回 WebGL2），帧率数字同理，不代表真机性能。

### 颜色约定

所有颜色都是 `#rgb` / `#rrggbb` 字符串，统一由 `src/color.js` 解析：

- `toColor()` 给 `THREE.Color` 用，`toLinearRGB()` 给 TSL 常量用；
- 解析结果是线性工作色彩空间，**不要再手工 `/255` 直接喂给 shader**，那会把 sRGB 当线性用、整体偏亮；
- 非法值回退默认色，绝不产生 `NaN`（`NaN` 会让整块材质编译失败）。

`src/config.js` 的 `normalize()` 会在配置边界把非法颜色换回默认值。这类问题的完整跨层分析见 [docs/root-cause.md](./docs/root-cause.md)。

## 浏览器支持

| 环境 | 渲染后端 |
| --- | --- |
| 本机 `localhost` | WebGPU |
| HTTPS 局域网 | WebGPU |
| 局域网 HTTP | WebGL2 |
| 不支持 WebGPU 的浏览器 | WebGL2 |

## License

[MIT](./LICENSE)
