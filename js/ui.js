/**
 * ui.js — reusable UI building blocks (no framework).
 *
 * `h()` builds DOM elements in one line, e.g.
 *     h('button', { class: 'btn', onclick: save }, 'Save')
 * Everything else here (sheets, toasts, segmented controls) is built with it.
 */

/** Create an element. Props starting with "on" become event listeners. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v; // applied after children (needed for <select>)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  if (value !== undefined) el.value = value;
  return el;
}

/**
 * Replace everything inside `root` with `children`, using the same rules as h():
 * nested arrays are flattened and null/false are skipped. (The built-in
 * replaceChildren would print "false" or "[object HTMLDivElement]" instead.)
 */
export function mount(root, ...children) {
  root.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

/* ---------- icons (inline SVG so they work offline) ---------- */

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
};
export function icon(name) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return wrap.firstChild;
}

/* ---------- layout helpers ---------- */

export function pageHead(title, action = null, eyebrow = null) {
  return h('header', { class: 'page-head' },
    h('div', {}, eyebrow && h('p', { class: 'eyebrow' }, eyebrow), h('h1', {}, title)),
    action);
}

export function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}

/**
 * Segmented control (pill-style toggle).
 * options: [{ value, label }]. Calls onChange(value) when the user picks one.
 */
export function segmented(options, current, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  options.forEach((o) => {
    const b = h('button', { type: 'button', role: 'radio', class: o.value === current ? 'on' : '' }, o.label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onChange(o.value);
    });
    wrap.append(b);
  });
  return wrap;
}

/** Search field; calls onInput(text) as the user types. */
export function searchBox(onInput, placeholder = 'Search exercises') {
  const input = h('input', { type: 'search', placeholder, autocomplete: 'off', oninput: (e) => onInput(e.target.value) });
  return { el: h('label', { class: 'search' }, icon('search'), input), input };
}

/* ---------- bottom sheets (the slide-up panels used for menus and forms) ---------- */

export function openSheet(title, body, { onClose } = {}) {
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-handle' }),
    title && h('h2', { class: 'sheet-title' }, title),
    body);
  const backdrop = h('div', { class: 'sheet-backdrop' }, panel);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open')); // triggers the slide-up animation

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 220);
    onClose?.();
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  return { close, panel };
}

/**
 * A menu of choices. Resolves with the chosen option's value, or null if dismissed.
 * option: { label, value, danger?, active?, disabled?, badge?, badgeClass? }
 */
export function chooseAction(title, options) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; sheet.close(); resolve(v); };
    const list = h('div', { class: 'action-list' }, options.map((o) =>
      h('button', {
        type: 'button',
        class: `action-item${o.danger ? ' danger' : ''}${o.active ? ' active' : ''}`,
        disabled: o.disabled,
        onclick: () => finish(o.value),
      },
      o.badge !== undefined && h('span', { class: `set-badge ${o.badgeClass || ''}` }, o.badge),
      h('span', { class: 'action-label' }, o.label),
      o.active && icon('check'))));
    const sheet = openSheet(title, list, { onClose: () => finish(null) });
  });
}

/** Ask for a line of text. Resolves with the trimmed text, or null if cancelled/empty. */
export function askText({ title, value = '', placeholder = '', okLabel = 'Save' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; sheet.close(); resolve(v); };
    const input = h('input', { class: 'input', value, placeholder, maxlength: 60, enterkeyhint: 'done' });
    const submit = () => finish(input.value.trim() || null);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const body = h('div', {}, input,
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: submit }, okLabel)));
    const sheet = openSheet(title, body, { onClose: () => finish(null) });
    setTimeout(() => { input.focus(); input.select(); }, 50);
  });
}

/** Yes/no confirmation. Resolves true/false. */
export function confirmAction({ title, message = '', okLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; sheet.close(); resolve(v); };
    const body = h('div', {},
      message && h('p', { class: 'sheet-message' }, message),
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(false) }, 'Cancel'),
        h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => finish(true) }, okLabel)));
    const sheet = openSheet(title, body, { onClose: () => finish(false) });
  });
}

/* ---------- toast (small message that fades out) ---------- */

export function toast(message) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2200);
}

/* ---------- misc ---------- */

/**
 * Debounce: wait until calls stop for `ms` before running fn (used for autosave
 * while typing). `.flush()` runs a pending call now, `.cancel()` drops it.
 */
export function debounce(fn, ms) {
  let timer = null;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(() => { timer = null; fn(); }, ms); };
  debounced.cancel = () => { clearTimeout(timer); timer = null; };
  debounced.flush = () => { if (timer) { debounced.cancel(); fn(); } };
  return debounced;
}
