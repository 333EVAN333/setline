/**
 * views/bodyweight.js — log body weight by date and see it over time (#/bodyweight).
 */
import { h, mount, icon, segmented, toast, confirmAction } from '../ui.js';
import { state, listBodyweight, saveBodyweight, deleteBodyweight } from '../store.js';
import { parseNumber } from '../sets.js';
import { formatWeight, displayToKg, kgToDisplay } from '../units.js';
import { localISO, isoToMs, fmtDate } from '../format.js';
import { lineChart } from '../chart.js';

const RANGES = [
  { value: 30, label: '1M' },
  { value: 90, label: '3M' },
  { value: 365, label: '1Y' },
  { value: 0, label: 'All' },
];
let rangeDays = 90; // remembered while the app is open

export async function render(root) {
  const entries = await listBodyweight(); // newest first
  const unit = state.unit;

  /* ----- log form ----- */
  const dateInput = h('input', { class: 'input', type: 'date', value: localISO(), max: localISO(), 'aria-label': 'Date' });
  const weightInput = h('input', {
    class: 'input', inputmode: 'decimal', placeholder: entries[0] ? formatWeight(entries[0].weight, unit) : unit,
    'aria-label': `Weight in ${unit}`, enterkeyhint: 'done',
  });
  async function save() {
    const n = parseNumber(weightInput.value);
    if (!n) { toast(`Enter your weight in ${unit}`); weightInput.focus(); return; }
    if (!dateInput.value) { toast('Pick a date'); return; }
    await saveBodyweight(dateInput.value, displayToKg(n, unit));
    toast('Saved');
    render(root);
  }
  weightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  /* ----- chart with range filter ----- */
  const chartHost = h('div');
  const drawChart = () => {
    const cutoff = rangeDays ? Date.now() - rangeDays * 86400000 : -Infinity;
    const points = entries
      .map((e) => ({ x: isoToMs(e.date), y: kgToDisplay(e.weight, unit) }))
      .filter((p) => p.x >= cutoff)
      .map((p) => ({ ...p, y: Math.round(p.y * 10) / 10 }));
    chartHost.replaceChildren(lineChart({
      points,
      formatY: (v) => `${v} ${unit}`,
      label: `Body weight over time in ${unit}`,
      emptyText: entries.length ? 'No entries in this range.' : 'Log your weight to start the chart.',
    }));
  };

  /* ----- entries list (doubles as the chart's table view) ----- */
  const row = (e, i) => {
    const older = entries[i + 1];
    const diff = older ? kgToDisplay(e.weight, unit) - kgToDisplay(older.weight, unit) : 0;
    return h('div', { class: 'bw-row' },
      h('span', { class: 'bw-date' }, fmtDate(isoToMs(e.date), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })),
      h('b', {}, `${formatWeight(e.weight, unit)} ${unit}`),
      h('span', { class: 'bw-diff' }, older && Math.abs(diff) >= 0.05 ? `${diff > 0 ? '+' : '−'}${Math.abs(Math.round(diff * 10) / 10)}` : ''),
      h('button', {
        class: 'icon-btn small', 'aria-label': `Delete entry for ${e.date}`,
        onclick: async () => {
          if (await confirmAction({ title: 'Delete this entry?', okLabel: 'Delete', danger: true })) {
            await deleteBodyweight(e.id);
            render(root);
          }
        },
      }, icon('x')));
  };

  mount(root,
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/history', 'aria-label': 'Back to history' }, icon('back')),
      h('div', { class: 'topbar-title' }, 'Body weight'),
      h('span')),
    h('section', { class: 'card pad bw-form' },
      h('div', { class: 'bw-inputs' }, dateInput, weightInput),
      h('button', { class: 'btn btn-primary btn-block', onclick: save }, 'Log weight'),
      h('p', { class: 'muted small' }, 'Logging again on the same date replaces that day’s entry.')),
    h('section', { class: 'card chart-card' },
      segmented(RANGES, rangeDays, (v) => { rangeDays = v; drawChart(); }),
      chartHost),
    entries.length > 0 && h('h2', { class: 'section-title' }, 'Entries'),
    entries.length > 0 && h('div', { class: 'card list' }, entries.map(row)),
  );
  drawChart();
}
