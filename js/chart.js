/**
 * chart.js — a small, dependency-free SVG line chart (works offline).
 *
 * How it works:
 *   1. Scales: map each data point's date (x) and value (y) to pixel positions.
 *   2. Draw: gridlines + axis labels, a soft area fill, the 2px line, and dots.
 *   3. Hover/touch: an invisible rectangle listens for the pointer, finds the
 *      nearest point by x, and moves a crosshair + tooltip to it. Arrow keys
 *      do the same when the chart has keyboard focus.
 * A ResizeObserver redraws at the container's real width, so the chart is
 * always crisp and never stretched.
 *
 * points: [{ x: timestamp ms, y: number }] in any order.
 */
import { h } from './ui.js';
import { fmtShort } from './format.js';

export function lineChart({ points, formatY, formatAxis = (v) => compact(v), height = 200, emptyText = 'No data yet', label = 'Line chart' }) {
  const wrap = h('div', { class: 'chart', tabindex: points.length ? '0' : null, role: 'img', 'aria-label': label });
  if (!points.length) {
    wrap.append(h('p', { class: 'chart-empty' }, emptyText));
    return wrap;
  }
  const data = [...points].sort((a, b) => a.x - b.x);
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const host = h('div');
  wrap.append(host, tip);

  let lastWidth = 0;
  let api = null; // { show(i), hide() } from the latest draw
  let current = data.length - 1;

  const draw = (W) => {
    const H = height;
    const pad = { top: 14, right: 14, bottom: 26, left: 44 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    // ---- scales ----
    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const step = niceStep((yMax - yMin) / 4);
    yMin = Math.floor(yMin / step) * step;
    yMax = Math.ceil(yMax / step) * step;
    const sx = (x) => (xMax === xMin ? pad.left + innerW / 2 : pad.left + ((x - xMin) / (xMax - xMin)) * innerW);
    const sy = (y) => pad.top + (1 - (y - yMin) / (yMax - yMin)) * innerH;

    // ---- grid + y labels ----
    let grid = '';
    for (let v = yMin; v <= yMax + step / 2; v += step) {
      const y = sy(v).toFixed(1);
      grid += `<line class="grid" x1="${pad.left}" x2="${W - pad.right}" y1="${y}" y2="${y}"/>`;
      grid += `<text class="axis" x="${pad.left - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${esc(formatAxis(v))}</text>`;
    }
    // ---- x labels: first and last date (and middle if there's room) ----
    const xLabel = (d, anchor) => `<text class="axis" x="${sx(d.x).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(fmtShort(d.x))}</text>`;
    let xLabels = data.length === 1 ? xLabel(data[0], 'middle') : xLabel(data[0], 'start') + xLabel(data[data.length - 1], 'end');
    if (data.length > 4 && innerW > 280) xLabels += xLabel(data[Math.floor(data.length / 2)], 'middle');

    // ---- line, area, dots ----
    const pts = data.map((d) => [sx(d.x), sy(d.y)]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const base = (pad.top + innerH).toFixed(1);
    const area = data.length > 1 ? `${line}L${pts[pts.length - 1][0].toFixed(1)},${base}L${pts[0][0].toFixed(1)},${base}Z` : '';
    const showAllDots = data.length <= 40;
    const dots = pts
      .filter((_, i) => showAllDots || i === pts.length - 1)
      .map(([x, y]) => `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`).join('');

    host.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      ${grid}${xLabels}
      ${area ? `<path class="area" d="${area}"/>` : ''}
      <path class="line" d="${line}"/>
      ${dots}
      <line class="crosshair" x1="0" x2="0" y1="${pad.top}" y2="${pad.top + innerH}" visibility="hidden"/>
      <circle class="dot hover" r="5.5" cx="0" cy="0" visibility="hidden"/>
      <rect class="hit" x="${pad.left - 10}" y="0" width="${innerW + 20}" height="${H}"/>
    </svg>`;

    const svg = host.firstElementChild;
    const cross = svg.querySelector('.crosshair');
    const hoverDot = svg.querySelector('.dot.hover');

    const show = (i) => {
      current = i;
      const [x, y] = pts[i];
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      hoverDot.setAttribute('cx', x); hoverDot.setAttribute('cy', y); hoverDot.setAttribute('visibility', 'visible');
      tip.replaceChildren(h('b', {}, formatY(data[i].y)), h('span', {}, fmtShort(data[i].x)));
      tip.hidden = false;
      // keep the tooltip inside the chart
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.min(Math.max(x - tw / 2, 0), W - tw)}px`;
      tip.style.top = `${Math.max(y - 54, 0)}px`;
    };
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      hoverDot.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    };
    const nearest = (clientX) => {
      const px = clientX - svg.getBoundingClientRect().left;
      let best = 0;
      pts.forEach(([x], i) => { if (Math.abs(x - px) < Math.abs(pts[best][0] - px)) best = i; });
      return best;
    };
    const hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
    hit.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    api = { show, hide };
  };

  // Keyboard: arrow keys step through points.
  wrap.addEventListener('keydown', (e) => {
    if (!api) return;
    if (e.key === 'ArrowLeft') { api.show(Math.max(0, current - 1)); e.preventDefault(); }
    if (e.key === 'ArrowRight') { api.show(Math.min(data.length - 1, current + 1)); e.preventDefault(); }
  });
  wrap.addEventListener('focus', () => api?.show(current));
  wrap.addEventListener('blur', () => api?.hide());

  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w && w !== lastWidth) { lastWidth = w; draw(w); }
  }).observe(wrap);

  return wrap;
}

/** A "nice" axis step (1, 2, 5 × 10^n) close to the raw step. */
function niceStep(raw) {
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

/** 1250 -> "1,250", 12500 -> "13K", 2.5 -> "2.5" */
function compact(v) {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}K`;
  return (Math.round(v * 10) / 10).toLocaleString();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
