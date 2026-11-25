/**
 * views/history.js — the History tab (#/history) and one workout's details (#/history/:id).
 */
import { h, mount, icon, pageHead, chooseAction, confirmAction } from '../ui.js';
import { state, listWorkouts, getWorkout, deleteWorkout, listBodyweight, exerciseMap } from '../store.js';
import { summarizeWorkout } from '../stats.js';
import { setLabels, formatDuration } from '../sets.js';
import { unitFor, formatWeight } from '../units.js';
import { formatVolume, formatDurationShort, fmtDay, fmtTime, fmtDate, fmtShort, isoToMs } from '../format.js';

/* ======================= list ======================= */

export async function renderList(root) {
  const [workouts, weights] = await Promise.all([listWorkouts(), listBodyweight()]);

  // Workouts in the last 7 days, for the summary line.
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = workouts.filter((w) => w.startedAt >= weekAgo);
  const recentVolume = recent.reduce((sum, w) => sum + summarizeWorkout(w).volume, 0);

  /* body weight card */
  const latest = weights[0];
  const prev = weights[1];
  const delta = latest && prev ? (latest.weight - prev.weight) : null;
  const bwCard = h('a', { class: 'card bw-card', href: '#/bodyweight' },
    h('div', {},
      h('p', { class: 'eyebrow' }, 'Body weight'),
      latest
        ? h('div', { class: 'bw-now' }, formatWeight(latest.weight, state.unit), h('small', {}, ` ${state.unit}`))
        : h('div', { class: 'bw-now muted' }, 'Not logged yet'),
      latest && h('p', { class: 'muted small' },
        fmtShort(isoToMs(latest.date)),
        delta != null && delta !== 0 && ` · ${delta > 0 ? '+' : '−'}${formatWeight(Math.abs(delta), state.unit)} since last`)),
    h('span', { class: 'btn btn-small' }, latest ? 'Open' : 'Log'));

  /* workout cards grouped by month */
  const groups = new Map();
  for (const w of workouts) {
    const key = fmtDate(w.startedAt, { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }

  const workoutCard = (w) => {
    const s = summarizeWorkout(w);
    return h('a', { class: 'card workout-card', href: `#/history/${w.id}` },
      h('div', { class: 'wc-top' },
        h('div', { class: 'wc-name' }, w.routineName || 'Workout'),
        h('div', { class: 'wc-date' }, `${fmtDay(w.startedAt)} · ${fmtTime(w.startedAt)}`)),
      h('div', { class: 'wc-stats' },
        stat('Duration', formatDurationShort(s.duration)),
        stat('Volume', formatVolume(s.volume, state.unit)),
        stat('Sets', s.sets)),
      h('div', { class: 'wc-exercises' }, w.exercises.map((x) => x.name).join(' · ')));
  };

  mount(root,
    pageHead('History', null, workouts.length ? `${workouts.length} workouts logged` : null),
    bwCard,
    workouts.length > 0 && h('p', { class: 'week-summary' },
      `Last 7 days: `, h('b', {}, `${recent.length} ${recent.length === 1 ? 'workout' : 'workouts'}`),
      recent.length > 0 && [' · ', h('b', {}, formatVolume(recentVolume, state.unit))]),
    workouts.length
      ? h('div', {}, [...groups].map(([month, list]) => [ // h() flattens nested arrays; replaceChildren doesn't
        h('h2', { class: 'section-title' }, month),
        h('div', { class: 'stack' }, list.map(workoutCard)),
      ]))
      : h('div', { class: 'empty card', style: 'margin-top:16px' },
        h('h3', {}, 'No workouts yet'),
        h('p', {}, 'Finish a workout and it shows up here with its duration, volume and sets.')),
  );
}

const stat = (label, value) => h('div', {}, h('span', {}, label), h('b', {}, value));

/* ======================= detail ======================= */

export async function renderDetail(root, id) {
  const [w, exMap] = await Promise.all([getWorkout(id), exerciseMap()]);
  if (!w) { location.hash = '#/history'; return; }
  const s = summarizeWorkout(w);

  async function menu() {
    const choice = await chooseAction(w.routineName, [
      { label: 'Edit workout', value: 'edit' },
      { label: 'Delete workout', value: 'delete', danger: true },
    ]);
    if (choice === 'edit') { location.hash = `#/history/${w.id}/edit`; return; }
    if (choice !== 'delete') return;
    if (await confirmAction({ title: 'Delete this workout?', message: 'It will be removed from history and stats. This can’t be undone.', okLabel: 'Delete', danger: true })) {
      await deleteWorkout(w.id);
      location.hash = '#/history';
    }
  }

  const exerciseBlock = (x) => {
    const ex = exMap.get(x.exerciseId);
    const timed = ex ? ex.kind === 'time' : x.sets.some((st) => st.time != null);
    const unit = unitFor(ex, state.unit);
    const labels = setLabels(x.sets);
    return h('section', { class: 'card ex-card' },
      h('div', { class: 'ex-head' },
        ex
          ? h('a', { class: 'ex-title', href: `#/exercise/${ex.id}` }, h('div', { class: 'ex-name' }, x.name), h('div', { class: 'ex-sub' }, 'View history ›'))
          : h('div', { class: 'ex-title' }, h('div', { class: 'ex-name' }, x.name))),
      h('div', { class: 'done-sets' }, x.sets.map((st, i) =>
        h('div', { class: 'done-set' },
          h('span', { class: `set-badge type-${st.type}` }, labels[i]),
          h('span', {}, timed
            ? formatDuration(st.time)
            : st.weight > 0 ? `${formatWeight(st.weight, unit)} ${unit} × ${st.reps}` : `${st.reps} reps`)))));
  };

  mount(root,
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/history', 'aria-label': 'Back to history' }, icon('back')),
      h('div', { class: 'topbar-title' }, w.routineName || 'Workout'),
      h('button', { class: 'icon-btn', 'aria-label': 'Workout options', onclick: menu }, icon('more'))),
    h('p', { class: 'detail-date' }, `${fmtDate(w.startedAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${fmtTime(w.startedAt)}`),
    h('div', { class: 'stats' },
      stat('Duration', formatDurationShort(s.duration)),
      stat('Volume', formatVolume(s.volume, state.unit)),
      stat('Sets', s.sets)),
    h('div', { class: 'stack' }, w.exercises.map(exerciseBlock)),
  );
}
