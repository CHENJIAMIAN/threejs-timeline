# 立体时间轴

[简体中文](./README.md) | [English](./README.en.md)

用 **Three.js r186 + TSL** 做的可配置 3D 时间轴：一年一根毛玻璃立柱，沿时间轴排开，两端退进紫雾里。

年份范围、标题、色带都集中在配置里，默认附带一份 Web 发展史示例数据。支持 WebGPU，浏览器不支持时自动退回 WebGL2。

![立体时间轴预览](./docs/screenshot.png)

## 特性

- **年份可配**：改一个配置，或直接用 URL 参数切换范围。
- **数据可替换**：每年的事件文案和强度都在 `src/data.js`，不绑定固定主题。
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

默认配置在 `src/config.js`：

```js
export const TIMELINE_CONFIG = {
  title: '立体时间轴',
  startYear: 1996,
  endYear: 2026,
  hueStart: 190,
  hueEnd: 325
};
```

也可以在 URL 上临时覆盖，不需要改文件：

| 参数 | 示例 | 作用 |
| --- | --- | --- |
| `start` | `?start=2000` | 起始年份 |
| `end` | `?end=2024` | 结束年份 |
| `title` | `?title=我的时间轴` | 页面标题 |
| `hueStart` | `?hueStart=180` | 色带起始色相 |
| `hueEnd` | `?hueEnd=340` | 色带结束色相 |

例如：

```text
http://localhost:8123/index.html?start=2000&end=2024&title=产品进化史
```

### 替换事件

编辑 `src/data.js` 里的 `EVENT_DATA`：

```js
export const EVENT_DATA = {
  2007: { tag: 'iPhone 发布，移动端起点', heat: 0.74 },
  2013: { tag: 'React 开源', heat: 1.06 },
  2022: { tag: 'ChatGPT 发布', heat: 1.38 }
};
```

- `tag`：悬停时显示的事件文案。
- `heat`：立柱高度、顶部光球大小和亮度。
- 未配置的年份会自动生成平滑高度，文案留空。

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

控制台调试入口：

```js
window.timeline.{scene,camera,controls,pillars,state,renderer}
```

加 `?bench=1` 可以打开 GPU 时间、Draw call、三角面等性能读数。

## 目录

```text
index.html      页面骨架 + 毛玻璃 HUD
src/config.js   标题、年份范围、色带配置
src/data.js     事件数据 + 年份生成 + 布局计算
src/main.js     场景装配、相机模式、悬停拾取、HUD
src/pillars.js  毛玻璃立柱、光壳、顶球、地面光池、年份牌图集
src/sky.js      极光天幕、背景色幕、环境贴图
src/dust.js     浮尘粒子
src/postfx.js   bloom、色差、暗角、颗粒、冷暖分离
serve-https.py  局域网 HTTPS 静态服务
```

## 实现说明

### 毛玻璃

`MeshPhysicalNodeMaterial` 使用 `transmission` 做透射，再用 TSL 覆写：

- `roughnessNode`：分形噪声形成喷砂玻璃颗粒。
- `thicknessNode`：底部厚、顶部薄。
- `emissiveNode`：菲涅尔边缘光、顶部亮带和内部渐变。

每根柱子外加一层放大的 `BackSide` 光壳，保证在雾和泛光背景里轮廓仍然清楚。

### 实例化

TSL 会把逐对象常量烘焙进 WGSL，如果每根柱子单独建材质，会产生大量 shader program。

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

无头浏览器或远程桌面可能把帧率锁在 30Hz，不能直接用帧率判断真实性能；请以 `?bench=1` 的 GPU 时间和 Draw call 为准。

## 浏览器支持

| 环境 | 渲染后端 |
| --- | --- |
| 本机 `localhost` | WebGPU |
| HTTPS 局域网 | WebGPU |
| 局域网 HTTP | WebGL2 |
| 不支持 WebGPU 的浏览器 | WebGL2 |

## License

[MIT](./LICENSE)
