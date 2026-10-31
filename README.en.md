# 3D Timeline

[简体中文](./README.md) | [English](./README.en.md)

A configurable 3D timeline built with **Three.js r186 + TSL**. Each year becomes a frosted-glass pillar, with both ends fading into purple fog.

The year range, title, and color band are configurable. A Web development history dataset is included as a demo. WebGPU is used when available, with automatic fallback to WebGL2.

![3D Timeline preview](./docs/screenshot.png)

## Features

- **Configurable years**: open the top-right Settings panel to edit years, title, colors, lights, materials, and post effects.
- **Replaceable data**: per-year labels and intensity live in `src/config.js`.
- **TSL effects**: aurora sky, frosted glass, Fresnel rim light, bloom, chromatic aberration, vignette, and grain.
- **Instanced rendering**: pillars, shells, orbs, ground pools, contact shadows, and labels use `InstancedMesh`.
- **Adaptive quality**: Auto / Ultra / Eco modes, with desktop and LAN support.

## Quick Start

Double-click:

```bat
start.bat
```

Or start a static server manually:

```bash
python -m http.server 8123
# Open http://localhost:8123/index.html
```

> Do not open `index.html` directly. ES modules and import maps are blocked under `file://` by CORS.

### LAN / Mobile

```bat
start.bat          :: http://<LAN-IP>:8123/index.html, WebGL2-compatible
start-https.bat    :: https://<LAN-IP>:8443/index.html, self-signed HTTPS, WebGPU available
```

Allow the HTTPS port through Windows Firewall on first use:

```bat
netsh advfirewall firewall add rule name="timeline-8443-lan" dir=in action=allow protocol=TCP localport=8443 remoteip=LocalSubnet
```

## Configuration

Defaults live in `DEFAULT_CONFIG` inside `src/config.js`. At load time, values are merged in this order:

1. `DEFAULT_CONFIG`
2. `window.TIMELINE_CONFIG_OVERRIDES` (injected before `main.js`)
3. Overrides saved by the Settings panel in browser `localStorage`

The configuration is split by responsibility:

| Area | Controls |
| --- | --- |
| `meta` | Title, description, UI text, loading/error messages |
| `timeline` | Years, events, height range, color band, fallback heat |
| `layout` | Timeline span, curve, drift, pillar width, rail |
| `camera` | FOV, orbit limits, auto-rotate, cruise, focus animation |
| `scene` | Fog, exposure, tone mapping, antialiasing, light list |
| `ground` / `sky` / `backdrop` / `dust` | Ground, sky, backdrop, and dust appearance |
| `pillars` | Glass material, shell, orb, pool, contact shadow, label atlas |
| `postfx` | Bloom, RGB shift, vignette, grain, color split; each can be disabled |
| `quality` | DPR cap, quality modes, adaptive thresholds, warmup/cooldown |
| `ui` / `debug` | Panel visibility, slider defaults, benchmark, forced WebGL |

### Settings Panel

Click **Settings** in the top-right corner. The panel generates its form automatically from `src/config.js`, so new config fields do not require hand-written controls.

- Supports numbers, toggles, colors, text, JSON arrays, and JSON objects.
- The search box filters by config path or friendly label.
- **Timeline data → Per-year content** shows one row per year with editable year, event text, and heat, plus add/delete controls.
- **Edit as JSON** accepts the whole `timeline.events` object; switching back expands it into per-year rows.
- `scene.lights` uses a JSON editor.
- **Apply and Reload** saves overrides to `localStorage` for the current browser.
- **Restore Defaults** only clears panel-saved values; code defaults are untouched.
- URL query parameters are no longer used for configuration.

### In-Page Overrides

To switch themes per deployment, add this before the module script in `index.html`:

```html
<script>
  window.TIMELINE_CONFIG_OVERRIDES = {
    meta: { title: 'Product Evolution' },
    timeline: { startYear: 2000, endYear: 2024 },
    camera: { fov: 55 },
    postfx: { bloom: { strength: 0.5 } }
  };
</script>
```

### Replace Events

Search for `timeline.events` in the Settings panel and edit its JSON, or change `src/config.js` directly:

```js
timeline: {
  events: {
    2007: { tag: 'iPhone launch', heat: 0.74 },
    2013: { tag: 'React is open-sourced', heat: 1.06 },
    2022: { tag: 'ChatGPT launch', heat: 1.38 }
  }
}
```

- `tag`: text shown on the year label and hover tooltip.
- `heat`: pillar height, orb size, and brightness.
- Years without an entry use `timeline.fallbackHeat` for a smooth default height.
- Leaving heat blank uses the automatic height; clearing it on an existing year removes the custom heat.

## Interaction

| Action | Result |
| --- | --- |
| Drag / wheel | Orbit and zoom |
| Hover a pillar | Show year, label, height, and index |
| Click a pillar | Smooth camera focus |
| Auto rotate | Subtle camera breathing; disabled after manual drag |
| Cruise | Fly along the timeline |
| Fog / exposure / glass roughness | Live tuning |
| Year labels | Toggle labels |
| Top-right Settings | Edit every scene setting and save it in the current browser |

Console access:

```js
window.timeline.{scene,camera,controls,pillars,state,renderer}
```

Enable `debug.bench` in the Settings panel to show GPU time, draw calls, triangle count, and other performance readings.

## Structure

```text
index.html      Page shell and glass HUD
src/config.js   Full defaults plus global/localStorage override parsing
src/color.js    Single color entry point (hex to linear, safe fallback)
src/settings-ui.js  Auto-generated settings form, validation, and persistence
src/data.js     Year generation, layout, and color math
src/main.js     Scene setup, camera modes, picking, and HUD
src/pillars.js  Glass pillars, shells, orbs, ground pools, and label atlas
src/sky.js      Aurora sky, backdrop, and environment map
src/dust.js     Dust particles
src/postfx.js   Bloom, chromatic aberration, vignette, grain, and color split
scripts/smoke.mjs  Render smoke check and screenshot over CDP
serve-https.py  Local LAN HTTPS server
```

## Implementation Notes

### Frosted Glass

`MeshPhysicalNodeMaterial` uses `transmission` for refraction and TSL overrides for:

- `roughnessNode`: fractal-noise frosted grain.
- `thickness`: constant from bottom to top.
- `emissiveNode`: Fresnel rim, top band, and bottom band as hard-edged blocks.

Each pillar also has an enlarged `BackSide` light shell so its silhouette stays readable through fog and bloom.

### Instancing

TSL bakes per-object constants into WGSL. Building a separate material for each pillar would create many shader programs.

All pillars share unit geometry instead:

- color via `instanceColor`
- phase via `instanceIndex`
- size and orientation via `instanceMatrix`

Year labels are packed into a dynamic atlas, with UVs computed from `instanceIndex`.

### Performance

- Screen-space overlap avoidance for year labels.
- Downscaled bloom chain.
- Rendering stops when the tab is hidden.
- Adaptive quality based on real GPU/CPU cost.
- Reused temporary vectors and matrices in the main loop.

Headless browsers and remote desktops may cap rendering at 30Hz. Enable `debug.bench` in the Settings panel and use GPU time and draw calls instead of frame rate alone.

## Development and Verification

### Render smoke check

A shader compilation failure only prints a `console.error`; the page still renders, so the result is easy to mistake for "that's just how it looks". This check turns "loads, no errors, actually drew something" into one command:

```bash
# Start the static server first (same port as the script default)
python -m http.server 8123

# Then run Chrome with a remote debugging port, for example:
#   chrome.exe --remote-debugging-port=9223 --headless=new

node scripts/smoke.mjs
```

It checks shader errors, uncaught exceptions, whether a canvas is produced, and the screenshot size (blank frames fail). A non-zero exit code means failure, so it can run in CI.

### Regenerate the README screenshot

```bash
node scripts/smoke.mjs --out docs/screenshot.png --reset-view --wait 4000
```

`--reset-view` stops auto-rotation and restores the default camera so every capture uses the same angle. The renderer backend shown in the screenshot depends on the environment (headless usually falls back to WebGL2), and so does the frame rate; neither reflects real hardware performance.

### Color conventions

All colors are `#rgb` / `#rrggbb` strings parsed by `src/color.js`:

- `toColor()` for `THREE.Color`, `toLinearRGB()` for TSL constants;
- results are in the linear working color space — **do not hand-roll `/255` values into shaders**, that treats sRGB as linear and brightens everything;
- invalid input falls back to the default color and never produces `NaN` (a single `NaN` breaks the whole material compilation).

`normalize()` in `src/config.js` replaces invalid colors with defaults at the config boundary. See [docs/root-cause.md](./docs/root-cause.md) for the full cross-layer analysis.

## Browser Support

| Environment | Renderer |
| --- | --- |
| Local `localhost` | WebGPU |
| HTTPS over LAN | WebGPU |
| HTTP over LAN | WebGL2 |
| Browsers without WebGPU | WebGL2 |

## License

[MIT](./LICENSE)
