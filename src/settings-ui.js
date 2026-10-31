import {
  CONFIG_STORAGE_KEY,
  DEFAULT_TIMELINE_CONFIG,
  TIMELINE_CONFIG
} from './config.js';

const GROUP_ORDER = [
  'meta',
  'timeline',
  'layout',
  'camera',
  'scene',
  'ground',
  'sky',
  'backdrop',
  'dust',
  'pillars',
  'postfx',
  'quality',
  'ui',
  'debug'
];

const GROUP_LABELS = {
  meta: '基础信息',
  timeline: '时间轴数据',
  layout: '时间轴布局',
  camera: '相机',
  scene: '场景与灯光',
  ground: '地面',
  sky: '天空',
  backdrop: '背景幕',
  dust: '浮尘',
  pillars: '立柱与年份牌',
  postfx: '后期效果',
  quality: '性能与画质',
  ui: '界面显隐',
  debug: '调试'
};

const KEY_LABELS = {
  enabled: '启用',
  color: '颜色',
  colors: '颜色',
  intensity: '强度',
  opacity: '不透明度',
  speed: '速度',
  count: '数量',
  size: '尺寸',
  width: '宽度',
  height: '高度',
  min: '最小值',
  max: '最大值',
  start: '起点',
  end: '终点',
  x: 'X 坐标',
  y: 'Y 坐标',
  z: 'Z 坐标',
  fov: '视场角',
  near: '近裁剪面',
  far: '远裁剪面',
  title: '标题',
  titleSuffix: '标题后缀',
  description: '页面描述',
  introHtml: '介绍 HTML',
  lang: '页面语言',
  labels: '界面文案',
  events: '年份事件',
  lights: '灯光列表',
  startYear: '起始年份',
  endYear: '结束年份',
  fallbackHeat: '默认热度',
  heat: '热度',
  tag: '事件文案',
  span: '跨度',
  recurve: '回弯',
  drift: '漂移',
  driftPower: '漂移曲线',
  jitter: '抖动',
  rail: '导轨',
  target: '观察目标',
  orbit: '轨道控制',
  autoRotate: '自动旋转',
  cruise: '巡游',
  focus: '聚焦动画',
  fog: '雾',
  exposure: '曝光',
  toneMapping: '色调映射',
  antialias: '抗锯齿',
  trackTimestamp: '记录 GPU 时间',
  powerPreference: '显卡偏好',
  material: '材质',
  shader: '着色器',
  glass: '玻璃',
  shell: '光壳',
  orb: '顶球',
  pool: '光池',
  contact: '接触阴影',
  atlas: '年份牌图集',
  year: '年份文字',
  line: '分隔线',
  bloom: '泛光',
  rgbShift: '色差',
  vignette: '暗角',
  grain: '颗粒',
  colorSplit: '冷暖分离',
  strength: '强度',
  radius: '半径',
  threshold: '阈值',
  resolutionScale: '分辨率比例',
  amount: '数量',
  angle: '角度',
  inner: '内圈',
  outer: '外圈',
  scale: '缩放',
  shadow: '阴影色',
  highlight: '高光色',
  initialMode: '初始画质',
  order: '切换顺序',
  dpr: '渲染倍率',
  modes: '画质档位',
  label: '按钮文字',
  fpsCap: '帧率上限',
  showTitle: '显示标题',
  showHud: '显示状态面板',
  showLegend: '显示色带',
  showFogControl: '显示雾滑杆',
  showExposureControl: '显示曝光滑杆',
  showRoughnessControl: '显示粗糙度滑杆',
  showQualityButton: '显示画质按钮',
  showLabelsButton: '显示年份牌按钮',
  fogControlValue: '雾滑杆初值',
  exposureControlValue: '曝光滑杆初值',
  roughnessControlValue: '粗糙度滑杆初值',
  bench: '性能读数',
  forceWebGL: '强制 WebGL2'
};

const JSON_PATHS = new Set(['scene.lights']);
const YEAR_EVENTS_PATH = 'timeline.events';
const VIEW_KEY = 'settings-view';

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const fields = [];

export function initSettingsUI() {
  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');
  const backdrop = document.getElementById('settings-backdrop');
  const close = document.getElementById('settings-close');
  const form = document.getElementById('settings-form');
  const search = document.getElementById('settings-search');
  const apply = document.getElementById('settings-apply');
  const reset = document.getElementById('settings-reset');
  const status = document.getElementById('settings-status');
  const summary = document.getElementById('settings-summary');

  if (!toggle || !panel || !backdrop || !close || !form || !search
    || !apply || !reset || !status || !summary) {
    return;
  }

  const baseConfig = mergeConfig(DEFAULT_TIMELINE_CONFIG, readGlobalOverrides());
  const initialDiff = diffConfig(baseConfig, TIMELINE_CONFIG);
  const changedCount = countLeaves(initialDiff);
  summary.textContent = changedCount
    ? `${changedCount} 项来自配置面板保存`
    : '当前使用默认配置';
  let editedConfig = cloneValue(TIMELINE_CONFIG);

  buildForm(form, readStoredView());
  updateYearRowLabels();
  const initialYearToggle = form.querySelector('[data-year-toggle="toggle-list"]');
  if (initialYearToggle) updateListToggleCount(initialYearToggle);

  const setStatus = (message, kind = '') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  form.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action } = button.dataset;

    if (action === 'add-year') {
      const list = form.querySelector('.settings-year-rows');
      list.appendChild(createYearRow(list, '', '', '', true, getEventBounds()));
      const rows = list.querySelectorAll('.settings-year-row');
      rows[rows.length - 1].querySelector('input')?.focus();
      updateYearRowLabels();
      list.hidden = false;
      const listToggle = form.querySelector('[data-year-toggle="toggle-list"]');
      if (listToggle) {
        listToggle.setAttribute('aria-expanded', 'true');
        updateListToggleCount(listToggle);
      }
      setStatus('已新增一行，请填写年份和内容', 'dirty');
    } else if (action === 'remove-year') {
      button.closest('.settings-year-row')?.remove();
      updateYearRowLabels();
      const listToggle = form.querySelector('[data-year-toggle="toggle-list"]');
      if (listToggle) updateListToggleCount(listToggle);
      setStatus('已删除一行，点击应用后生效', 'dirty');
    }
  });

  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-year-toggle]');
    if (!button) return;
    if (button.dataset.yearToggle === 'toggle-list') {
      const list = form.querySelector('.settings-year-rows');
      if (!list) return;
      list.hidden = !list.hidden;
      button.setAttribute('aria-expanded', String(!list.hidden));
      updateListToggleCount(button);
      if (!list.hidden) {
        requestAnimationFrame(() => list.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
      return;
    }
    syncConfigFromYearRows(form, editedConfig);
    toggleYearEditor(form);
  });

  form.addEventListener('toggle', (event) => {
    const section = event.target;
    if (section.classList.contains('settings-group')) {
      saveStoredView(section.dataset.group, section.open);
    }
  }, true);

  const setOpen = (open) => {
    panel.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('settings-open', open);
    if (open) {
      requestAnimationFrame(() => search.focus());
    } else {
      toggle.focus();
    }
  };

  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  close.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('open')) setOpen(false);
  });

  search.addEventListener('input', () => filterFields(search.value));
  form.addEventListener('input', (event) => {
    event.target.closest('.settings-year-row')?.classList.remove('invalid');
    updateYearRowLabels();
    setStatus('有未保存的修改', 'dirty');
  });
  form.addEventListener('change', () => setStatus('有未保存的修改', 'dirty'));

  apply.addEventListener('click', () => {
    try {
      const next = collectConfig();
      const overrides = diffConfig(baseConfig, next);
      const savedCount = countLeaves(overrides);

      if (savedCount === 0) {
        localStorage.removeItem(CONFIG_STORAGE_KEY);
      } else {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(overrides));
      }

      setStatus(
        savedCount ? `已保存 ${savedCount} 项，正在重载…` : '已恢复默认值，正在重载…',
        'ok'
      );
      location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  });

  reset.addEventListener('click', () => {
    try {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
      localStorage.removeItem(VIEW_KEY);
      setStatus('已清除浏览器保存的配置，正在重载…', 'ok');
      location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  });

  function focusField(path) {
    const field = fields.find((entry) => entry.path === path);
    if (!field) return;
    field.element.classList.add('invalid');
    field.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    field.element.querySelector('input, textarea')?.focus();
  }

  function updateYearRowLabels() {
    const editor = form.querySelector('[data-year-editor]');
    if (!editor) return;
    for (const [index, row] of [...editor.querySelectorAll('.settings-year-row')].entries()) {
      const yearInput = row.querySelector('input');
      const label = yearInput.value.trim() || '新';
      yearInput.setAttribute('aria-label', `${label} 年 · 第 ${index + 1} 行年份`);
      row.querySelectorAll('input')[1]?.setAttribute('aria-label', `${label} 年 · 事件文案`);
      row.querySelectorAll('input')[2]?.setAttribute('aria-label', `${label} 年 · 热度`);
      row.querySelector('button')?.setAttribute(
        'aria-label',
        yearInput.value.trim() ? `删除 ${yearInput.value.trim()} 年` : '删除这一行'
      );
    }
  }

  function collectConfig() {
    form.querySelectorAll('.invalid').forEach((node) => {
      node.classList.remove('invalid');
    });
    syncConfigFromYearRows(form, editedConfig);
    const next = cloneValue(editedConfig);

    for (const field of fields) {
      if (field.path === YEAR_EVENTS_PATH) continue;
      if (field.element.closest('.settings-year-editor')) continue;
      try {
        setAtPath(next, field.path, field.read());
      } catch (error) {
        focusField(field.path);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${field.path}：${message}`);
      }
    }
    expandTimelineRange(next);
    syncRangeFields(next);
    syncYearJson(next);
    editedConfig = next;
    return next;
  }

  function syncRangeFields(config) {
    for (const path of ['timeline.startYear', 'timeline.endYear']) {
      const field = fields.find((entry) => entry.path === path);
      if (!field) continue;
      const input = field.element.querySelector('input');
      if (input) input.value = String(getAtPath(config, path));
    }
  }
}

function getAtPath(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function syncConfigFromYearRows(form, target) {
  const yearEditor = form.querySelector('[data-year-editor]');
  if (yearEditor?.dataset.mode === 'list') {
    setAtPath(target, YEAR_EVENTS_PATH, readYearRows(yearEditor));
  }
}

// 新增年份后自动扩展可见范围，避免保存了却看不到新内容。
function expandTimelineRange(config) {
  const years = Object.keys(config.timeline.events || {})
    .map(Number)
    .filter(Number.isFinite);
  if (years.length === 0) return;
  const earliest = Math.min(...years);
  const latest = Math.max(...years);
  if (earliest < Number(config.timeline.startYear)) {
    setAtPath(config, 'timeline.startYear', earliest);
  }
  if (latest > Number(config.timeline.endYear)) {
    setAtPath(config, 'timeline.endYear', latest);
  }
}

function buildForm(form, storedView) {
  fields.length = 0;
  form.replaceChildren();

  const intro = document.createElement('p');
  intro.className = 'settings-intro';
  intro.textContent = '配置保存在当前浏览器，不会写入 URL。修改后点击“应用并重载”才会生效。';
  form.appendChild(intro);

  const keys = [
    ...GROUP_ORDER.filter((key) => key in TIMELINE_CONFIG),
    ...Object.keys(TIMELINE_CONFIG).filter((key) => !GROUP_ORDER.includes(key))
  ];

  for (const [index, key] of keys.entries()) {
    const value = TIMELINE_CONFIG[key];
    if (!isPlainObject(value) && !Array.isArray(value)) continue;

    const section = document.createElement('details');
    section.className = 'settings-group';
    section.dataset.group = key;
    section.open = storedView[key] ?? index === 0;

    const sectionSummary = document.createElement('summary');
    const sectionTitle = document.createElement('span');
    sectionTitle.textContent = GROUP_LABELS[key] ?? friendlyKey(key);
    const sectionPath = document.createElement('code');
    sectionPath.textContent = key;
    sectionSummary.append(sectionTitle, sectionPath);

    const sectionBody = document.createElement('div');
    sectionBody.className = 'settings-group-body';
    section.append(sectionSummary, sectionBody);
    form.appendChild(section);

    if (isPlainObject(value)) {
      renderObjectEntries(sectionBody, value, key, section);
    } else {
      renderValue(sectionBody, key, value, key, section);
    }
  }
}

function renderValue(container, key, value, path, section) {
  if (path === YEAR_EVENTS_PATH) {
    container.appendChild(createYearEditor(value, section));
    return;
  }

  if (JSON_PATHS.has(path) || Array.isArray(value)
    || (isPlainObject(value) && Object.keys(value).length === 0)) {
    container.appendChild(createField(key, value, path, section, 'json'));
    return;
  }

  if (isPlainObject(value)) {
    const group = document.createElement('section');
    group.className = 'settings-subgroup';

    const heading = document.createElement('div');
    heading.className = 'settings-subhead';
    const name = document.createElement('span');
    name.textContent = friendlyKey(key);
    const pathCode = document.createElement('code');
    pathCode.textContent = path;
    heading.append(name, pathCode);

    const body = document.createElement('div');
    body.className = 'settings-subgroup-body';
    group.append(heading, body);
    container.appendChild(group);

    renderObjectEntries(body, value, path, section);
    return;
  }

  container.appendChild(createField(key, value, path, section));
}

function renderObjectEntries(container, value, path, section) {
  for (const [childKey, childValue] of Object.entries(value)) {
    renderValue(container, childKey, childValue, `${path}.${childKey}`, section);
  }
}

function createYearEditor(events, section) {
  const editor = document.createElement('div');
  editor.className = 'settings-year-editor';
  editor.dataset.yearEditor = YEAR_EVENTS_PATH;
  editor.dataset.mode = 'list';
  editor.dataset.search = `${YEAR_EVENTS_PATH} 年份事件 年份内容 事件文案 热度 新增删除 批量编辑`
    .toLowerCase();

  const heading = document.createElement('div');
  heading.className = 'settings-year-heading';
  const title = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = '每年内容';
  const pathCode = document.createElement('code');
  pathCode.textContent = YEAR_EVENTS_PATH;
  const hint = document.createElement('p');
  hint.textContent = '每年一行：事件文案显示在年份牌和悬停提示里，热度决定立柱高度与光球亮度。';
  title.append(name, pathCode, hint);

  const toggleList = document.createElement('button');
  toggleList.type = 'button';
  toggleList.className = 'settings-mini-btn';
  toggleList.dataset.yearToggle = 'toggle-list';
  toggleList.setAttribute('aria-expanded', 'false');
  toggleList.textContent = '展开年份';

  const toggleJson = document.createElement('button');
  toggleJson.type = 'button';
  toggleJson.className = 'settings-mini-btn';
  toggleJson.dataset.yearToggle = 'toggle-json';
  toggleJson.textContent = '批量编辑 JSON';
  heading.append(title, toggleList, toggleJson);

  const list = document.createElement('div');
  list.className = 'settings-year-rows';
  list.hidden = true;
  for (const [year, event] of Object.entries(events)) {
    list.appendChild(createYearRow(
      list,
      year,
      event?.tag ?? '',
      event?.heat ?? '',
      false,
      getEventBounds()
    ));
  }

  const actions = document.createElement('div');
  actions.className = 'settings-year-actions';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'settings-mini-btn accent';
  add.dataset.action = 'add-year';
    add.textContent = '+ 新增年份（展开列表）';
  actions.appendChild(add);

  const jsonWrap = document.createElement('div');
  jsonWrap.className = 'settings-year-json';
  jsonWrap.hidden = true;
  const jsonField = createField('年份事件', events, YEAR_EVENTS_PATH, section, 'json');
  jsonField.dataset.yearJson = 'true';
  jsonWrap.appendChild(jsonField);

  editor.append(heading, list, actions, jsonWrap);
  return editor;
}

function createYearRow(list, year, tag, heat, isNew, bounds) {
  const row = document.createElement('div');
  row.className = 'settings-year-row';

  const yearLabel = document.createElement('label');
  yearLabel.className = 'settings-year-cell year';
  const yearName = document.createElement('span');
  yearName.textContent = '年份';
  const yearInput = document.createElement('input');
  yearInput.type = 'number';
  yearInput.step = '1';
  yearInput.inputMode = 'numeric';
  yearInput.value = year === '' ? '' : String(year);
  yearInput.placeholder = String(bounds.start);
  yearInput.setAttribute('aria-label', '年份');
  yearLabel.append(yearName, yearInput);

  const tagLabel = document.createElement('label');
  tagLabel.className = 'settings-year-cell tag';
  const tagName = document.createElement('span');
  tagName.textContent = '事件文案';
  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.value = String(tag);
  tagInput.placeholder = '例如：Chrome 发布 · HTML5 草案';
  tagInput.setAttribute('aria-label', '事件文案');
  tagLabel.append(tagName, tagInput);

  const heatLabel = document.createElement('label');
  heatLabel.className = 'settings-year-cell heat';
  const heatName = document.createElement('span');
  heatName.textContent = '热度';
  const heatInput = document.createElement('input');
  heatInput.type = 'number';
  heatInput.step = '0.01';
  heatInput.inputMode = 'decimal';
  heatInput.min = '0';
  heatInput.value = heat === '' ? '' : String(heat);
  heatInput.placeholder = '自动';
  heatInput.setAttribute('aria-label', '热度');
  heatLabel.append(heatName, heatInput);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'settings-year-remove';
  remove.dataset.action = 'remove-year';
  remove.title = '删除这一年';
  remove.setAttribute('aria-label', year ? `删除 ${year} 年` : '删除这一行');
  remove.textContent = '×';

  row.append(yearLabel, tagLabel, heatLabel, remove);
  list.dataset.dirty = String(isNew);
  return row;
}

function readYearRows(editor) {
  const rows = [...editor.querySelectorAll('.settings-year-row')];
  const events = {};
  const seen = new Map();

  editor.classList.remove('invalid');
  for (const row of rows) {
    const [yearInput, tagInput, heatInput] = row.querySelectorAll('input');
    const rawYear = yearInput.value.trim();
    const tag = tagInput.value.trim();
    const rawHeat = heatInput.value.trim();

    row.classList.remove('invalid');
    if (!rawYear && !tag && !rawHeat) continue;

    const year = Number(rawYear);
    if (!rawYear || !Number.isInteger(year) || year < 1 || year > 9999) {
      row.classList.add('invalid');
      yearInput.focus();
      throw new Error('请填写 1–9999 之间的整数年份');
    }
    if (seen.has(year)) {
      row.classList.add('invalid');
      yearInput.focus();
      throw new Error(`年份 ${year} 重复了；请合并内容，或给新增的一行换一个年份`);
    }

    const event = { tag };
    if (rawHeat) {
      const heat = Number(rawHeat);
      if (!Number.isFinite(heat) || heat < 0) {
        row.classList.add('invalid');
        heatInput.focus();
        throw new Error(`${year} 年的热度必须是大于等于 0 的数字`);
      }
      event.heat = heat;
    }
    seen.set(year, row);
    events[year] = event;
  }
  return events;
}

function getEventBounds() {
  const start = Number(TIMELINE_CONFIG.timeline.startYear);
  const end = Number(TIMELINE_CONFIG.timeline.endYear);
  const years = Object.keys(TIMELINE_CONFIG.timeline.events).map(Number).filter(Number.isFinite);
  return {
    start: Number.isFinite(start) ? start : years[0] ?? 2000,
    end: Number.isFinite(end) ? end : Math.max(...years, 2000)
  };
}

function toggleYearEditor(form) {
  const editor = document.querySelector(`[data-year-editor="${YEAR_EVENTS_PATH}"]`);
  if (!editor) return;

  const goToList = editor.dataset.mode === 'json';
  if (goToList) {
    const textarea = editor.querySelector('textarea');
    let parsed;
    try {
      parsed = JSON.parse(textarea.value);
    } catch {
      editor.classList.add('invalid');
      textarea.focus();
      return;
    }
    if (!isPlainObject(parsed)) {
      editor.classList.add('invalid');
      textarea.focus();
      return;
    }
    const invalid = Object.entries(parsed).find(([year, event]) => (
      !/^\d+$/.test(year)
      || Number(year) < 1
      || Number(year) > 9999
      || !isPlainObject(event)
    ));
    if (invalid) {
      editor.classList.add('invalid');
      textarea.focus();
      return;
    }

    const list = editor.querySelector('.settings-year-rows');
    const bounds = getEventBounds();
    list.replaceChildren();
    for (const [year, event] of Object.entries(parsed)) {
      list.appendChild(createYearRow(
        list,
        year,
        event?.tag ?? '',
        event?.heat ?? '',
        false,
        bounds
      ));
    }
  } else {
    const textarea = editor.querySelector('textarea');
    let values;
    try {
      values = readYearRows(editor);
    } catch {
      editor.classList.add('invalid');
      return;
    }
    textarea.value = formatJson(values);
  }

  editor.dataset.mode = goToList ? 'list' : 'json';
  editor.classList.remove('invalid');
  editor.querySelector('.settings-year-rows').hidden = !goToList;
  editor.querySelector('.settings-year-actions').hidden = !goToList;
  editor.querySelector('.settings-year-json').hidden = goToList;
  const listToggle = form.querySelector('[data-year-toggle="toggle-list"]');
  if (listToggle && goToList) {
    listToggle.hidden = false;
    updateListToggleCount(listToggle);
  }
  form.querySelector('[data-year-toggle="toggle-json"]')
    .textContent = goToList ? '批量编辑 JSON' : '返回逐行编辑';
}

function updateListToggleCount(button) {
  const count = document.querySelectorAll('.settings-year-row:not([hidden])').length;
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.textContent = `${expanded ? '收起' : '展开'} ${count} 年`;
}

function syncYearJson(config) {
  const textarea = document.querySelector(`[data-year-editor="${YEAR_EVENTS_PATH}"] textarea`);
  const mode = document.querySelector(`[data-year-editor="${YEAR_EVENTS_PATH}"]`)?.dataset.mode;
  if (textarea && mode === 'list') {
    textarea.value = formatJson(config.timeline.events);
  }
}

function createField(key, value, path, section, forcedKind = '') {
  const field = document.createElement('div');
  field.className = 'settings-field';
  field.dataset.settingField = path;
  field.dataset.search = `${path} ${friendlyKey(key)} ${GROUP_LABELS[path.split('.')[0]] ?? ''}`
    .toLowerCase();

  const label = document.createElement('label');
  label.className = 'settings-field-label';
  label.htmlFor = `setting-${path.replaceAll('.', '-')}`;

  const name = document.createElement('span');
  name.className = 'settings-field-name';
  name.textContent = friendlyKey(key);
  const pathCode = document.createElement('code');
  pathCode.textContent = path;
  label.append(name, pathCode);

  const control = document.createElement('div');
  control.className = 'settings-control';
  const id = label.htmlFor;
  const kind = forcedKind || getKind(value);
  let read;

  if (kind === 'boolean') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = Boolean(value);
    control.appendChild(input);
    read = () => input.checked;
  } else if (kind === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.step = inferStep(path);
    input.value = String(value);
    input.inputMode = 'decimal';
    control.appendChild(input);
    read = () => {
      if (input.value.trim() === '') throw new Error('请填写数字');
      const number = Number(input.value);
      if (!Number.isFinite(number)) throw new Error('请填写有效数字');
      return number;
    };
  } else if (kind === 'color') {
    const wrap = document.createElement('div');
    wrap.className = 'settings-color';

    const text = document.createElement('input');
    text.type = 'text';
    text.id = id;
    text.value = String(value);
    text.spellcheck = false;

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = normalizeHex(value);
    picker.setAttribute('aria-label', `${path} 颜色选择器`);

    picker.addEventListener('input', () => {
      text.value = picker.value;
      text.dispatchEvent(new Event('input', { bubbles: true }));
    });
    text.addEventListener('input', () => {
      if (COLOR_RE.test(text.value)) picker.value = normalizeHex(text.value);
    });

    wrap.append(text, picker);
    control.appendChild(wrap);
    read = () => text.value;
  } else if (kind === 'json') {
    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.value = formatJson(value);
    textarea.spellcheck = false;
    textarea.rows = Math.min(18, Math.max(5, textarea.value.split('\n').length + 1));
    control.appendChild(textarea);
    read = () => {
      let parsed;
      try {
        parsed = JSON.parse(textarea.value);
      } catch {
        throw new Error('JSON 格式错误');
      }

      if (Array.isArray(value) && !Array.isArray(parsed)) {
        throw new Error('这里必须是 JSON 数组');
      }
      if (isPlainObject(value) && !isPlainObject(parsed)) {
        throw new Error('这里必须是 JSON 对象');
      }
      return sanitizeValue(parsed);
    };
  } else if (kind === 'nullable') {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.value = value === null ? 'null' : String(value);
    input.spellcheck = false;
    control.appendChild(input);
    read = () => {
      const raw = input.value.trim();
      if (raw === '' || raw === 'null') return null;
      const number = Number(raw);
      if (!Number.isFinite(number)) throw new Error('请填写数字或 null');
      return number;
    };
  } else {
    const useTextarea = path === 'meta.introHtml' || String(value).length > 100;
    const input = document.createElement(useTextarea ? 'textarea' : 'input');
    input.id = id;
    input.value = String(value);
    if (useTextarea) {
      input.rows = Math.min(10, Math.max(4, input.value.split('\n').length + 1));
    } else {
      input.type = 'text';
    }
    control.appendChild(input);
    read = () => input.value;
  }

  field.append(label, control);
  section.dataset.search = `${section.dataset.search ?? ''} ${field.dataset.search}`.trim();
  fields.push({ path, element: field, read });
  return field;
}

function getKind(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value === null) return 'nullable';
  if (typeof value === 'string' && COLOR_RE.test(value)) return 'color';
  if (Array.isArray(value) || isPlainObject(value)) return 'json';
  return 'text';
}

function filterFields(rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  const sections = document.querySelectorAll('.settings-group');

  for (const section of sections) {
    let visibleFields = 0;
    for (const field of section.querySelectorAll('[data-setting-field], [data-year-editor]')) {
      const visible = !query || field.dataset.search.includes(query);
      field.hidden = !visible;
      if (visible) visibleFields++;
    }

    for (const subgroup of section.querySelectorAll('.settings-subgroup')) {
      const visible = [...subgroup.querySelectorAll('[data-setting-field]')]
        .some((field) => !field.hidden);
      subgroup.hidden = Boolean(query) && !visible;
    }

    const yearEditor = section.querySelector('[data-year-editor]');
    if (yearEditor && !yearEditor.hidden) {
      for (const row of yearEditor.querySelectorAll('.settings-year-row')) {
        const visible = !query || row.textContent.toLowerCase().includes(query)
          || [...row.querySelectorAll('input')].some((input) => input.value.toLowerCase().includes(query));
        row.hidden = Boolean(query) && !visible;
      }
    }

    section.hidden = Boolean(query) && visibleFields === 0;
    if (query && visibleFields > 0) section.open = true;
  }
}

function readStoredView() {
  try {
    const value = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
    return isPlainObject(value) ? value : {};
  } catch {
    return {};
  }
}

function saveStoredView(group, open) {
  if (!group) return;
  try {
    const view = readStoredView();
    view[group] = Boolean(open);
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // 仅记录界面展开状态，存储不可用时不影响配置编辑。
  }
}

function friendlyKey(key) {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function inferStep(path) {
  return /(?:Year|Frames?|Cols|rowsPerCol|octaves|Octaves|segments)$/i.test(path) ? '1' : 'any';
}

function normalizeHex(value) {
  const raw = String(value);
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split('').map((char) => char + char).join('')}`;
  }
  return '#000000';
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (!BLOCKED_KEYS.has(key)) out[key] = cloneValue(child);
    }
    return out;
  }
  return value;
}

function mergeConfig(base, override) {
  const out = cloneValue(base);
  if (!isPlainObject(override)) return out;

  for (const [key, value] of Object.entries(override)) {
    if (BLOCKED_KEYS.has(key)) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key])
      ? mergeConfig(out[key], value)
      : cloneValue(value);
  }
  return out;
}

function readGlobalOverrides() {
  if (typeof window === 'undefined') return {};
  return isPlainObject(window.TIMELINE_CONFIG_OVERRIDES)
    ? window.TIMELINE_CONFIG_OVERRIDES
    : {};
}

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (!BLOCKED_KEYS.has(key)) out[key] = sanitizeValue(child);
    }
    return out;
  }
  return value;
}

function setAtPath(target, path, value) {
  const parts = path.split('.');
  if (!parts.length || parts.some((part) => BLOCKED_KEYS.has(part))) {
    throw new Error('配置路径无效');
  }

  let cursor = target;
  for (const key of parts.slice(0, -1)) {
    if (!isPlainObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = value;
}

function diffConfig(base, next) {
  if (Array.isArray(base) && Array.isArray(next)) {
    return JSON.stringify(base) === JSON.stringify(next) ? undefined : cloneValue(next);
  }

  if (isPlainObject(base) && isPlainObject(next)) {
    const out = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
    for (const key of keys) {
      if (BLOCKED_KEYS.has(key)) continue;
      const child = diffConfig(base[key], next[key]);
      if (child !== undefined) out[key] = child;
    }
    return Object.keys(out).length ? out : undefined;
  }

  if (Object.is(base, next)) return undefined;
  return cloneValue(next);
}

function countLeaves(value) {
  if (isPlainObject(value)) {
    return Object.values(value).reduce((total, child) => total + countLeaves(child), 0);
  }
  return value === undefined ? 0 : 1;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
