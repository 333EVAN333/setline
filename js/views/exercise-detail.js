/**
 * views/exercise-detail.js — one exercise's progress (#/exercise/:id):
 * personal records, a chart over time, and every past session.
 */
import { h, mount, icon, segmented } from '../ui.js';
import { state, exerciseMap, listWorkouts } from '../store.js';
import { exerciseHistory } from '../stats.js';
import { setLabels, formatDuration } from '../sets.js';
import { unitFor, formatWeight, kgToDisplay } from '../units.js';
import { fmtDay } from '../format.js';
import { lineChart } from '../chart.js';
import { exerciseForm } from './exercises.js';

export async function render(root, id) {
  const [exMap, workouts] = await Promise.all([exerciseMap(), listWorkouts()]);
  const ex = exMap.get(id);
  if (!ex) { location.hash = '#/exercises'; return; }
  const timed = ex.kind === 'time';
  const unit = unitFor(ex, state.unit);
  const { sessions, records } = exerciseHistory(id, workouts);

  const w = (kg) => `${formatWeight(kg, unit)} ${unit}`;
  const setText = (s) => (timed
    ? formatDuration(s.time)
    : s.weight > 0 ? `${formatWeight(s.weight, unit)} ${unit} × ${s.reps}` : `${s.reps} reps`);

  /*
   * Three kinds of exercise get different records and charts:
   *   timed          -> longest time
   *   bodyweight     -> most reps (logged with no added weight, e.g. dips)
   *   weighted       -> estimated 1RM and heaviest weight
   */
  const mode = timed ? 'timed' : records.heaviest > 0 || !sessions.length ? 'weighted' : 'bodyweight';
  const METRICS = {
    timed: [{ key: 'longest', label: 'Longest time', fmt: (v) => formatDuration(Math.round(v)), axis: (v) => formatDuration(Math.round(v)), toY: (v) => v }],
    bodyweight: [{ key: 'mostReps', label: 'Most reps', fmt: (v) => `${v} reps`, toY: (v) => v }],
    weighted: [
      { key: 'e1rm', label: 'Est. 1RM', fmt: (v) => `${v} ${unit}`, toY: (kg) => kgToDisplay(kg, unit) },
      { key: 'heaviest', label: 'Heaviest', fmt: (v) => `${v} ${unit}`, toY: (kg) => kgToDisplay(kg, unit) },
    ],
  };
  const metrics = METRICS[mode].filter((m) => records[m.key] > 0);
  const prKeys = METRICS[mode].map((m) => m.key);

  const chartHost = h('div');
  const drawChart = (m) => {
    const points = sessions.filter((s) => s[m.key] > 0).map((s) => ({ x: s.date, y: Math.round(m.toY(s[m.key]) * 10) / 10 }));
    chartHost.replaceChildren(lineChart({
      points, formatY: m.fmt, formatAxis: m.axis, label: `${ex.name}: ${m.label} over time`,
      emptyText: 'Log this exercise to see your progress.',
    }));
  };

  /* records tiles */
  const tiles = mode === 'timed'
    ? [['Longest time', records.longest ? formatDuration(records.longest) : '—'], ['Sessions', sessions.length]]
    : mode === 'bodyweight'
      ? [['Most reps', records.mostReps], ['Sessions', sessions.length]]
      : [
      ['Est. 1RM', records.e1rm ? `${Math.round(kgToDisplay(records.e1rm, unit))} ${unit}` : '—'], // an estimate, so whole numbers
      ['Heaviest', records.heaviest ? w(records.heaviest) : '—'],
      ['Best set', records.bestSet ? setText(records.bestSet) : '—'],
      ['Sessions', sessions.length],
    ];

  const PR_LABELS = { e1rm: '1RM PR', heaviest: 'Weight PR', mostReps: 'Rep PR', longest: 'Time PR' };
  const sessionCard = (s) => {
    const labels = setLabels(s.sets);
    // Tag the first set that matches the session's best (highest est. 1RM) set.
    const bestIndex = mode === 'weighted' && s.best
      ? s.sets.findIndex((st) => st.type !== 'warmup' && st.weight === s.best.weight && st.reps === s.best.reps)
      : -1;
    return h('a', { class: 'card session', href: `#/history/${s.workoutId}` },
      h('div', { class: 'session-head' },
        h('div', {}, h('b', {}, fmtDay(s.date)), h('span', { class: 'muted small' }, ` · ${s.routineName || 'Workout'}`)),
        h('div', { class: 'chips' }, s.prs.filter((k) => prKeys.includes(k)).map((k) => h('span', { class: 'chip' }, PR_LABELS[k])))),
      h('div', { class: 'done-sets' }, s.sets.map((st, i) => h('div', { class: 'done-set' },
        h('span', { class: `set-badge type-${st.type}` }, labels[i]),
        h('span', {}, setText(st)),
        i === bestIndex && h('span', { class: 'best-tag' }, 'best')))));
  };

  async function edit() {
    const res = await exerciseForm(ex);
    if (res === 'deleted') location.hash = '#/exercises';
    else if (res) render(root, id);
  }

  mount(root,
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => history.back() }, icon('back')),
      h('div', { class: 'topbar-title' }, ex.name),
      h('button', { class: 'btn btn-small', onclick: edit }, 'Edit')),
    h('p', { class: 'detail-date' }, ex.muscle, timed ? ' · timed' : ` · ${unit}`),
    h('div', { class: `stats records${tiles.length === 4 ? ' four' : ''}` }, tiles.map(([label, value]) => h('div', {}, h('span', {}, label), h('b', {}, value)))),
    metrics.length > 0 && h('section', { class: 'card chart-card' },
      metrics.length > 1 && segmented(metrics.map((m) => ({ value: m, label: m.label })), metrics[0], drawChart),
      chartHost),
    h('h2', { class: 'section-title' }, 'Sessions'),
    sessions.length
      ? h('div', { class: 'stack' }, sessions.map(sessionCard))
      : h('div', { class: 'empty card' }, h('p', {}, 'No sessions yet. Once you finish a workout with this exercise, every session is listed here.')),
  );
  if (metrics.length) drawChart(metrics[0]);
}
