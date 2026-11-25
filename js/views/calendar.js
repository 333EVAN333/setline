/**
 * views/calendar.js — month calendar of your workouts (#/calendar).
 *
 * - Days you trained are filled in lime; today has a ring.
 * - Tap a day to see its workouts below the grid, open or edit them, or
 *   add a workout you forgot to log (today or any past day).
 * - Future days show what your weekly schedule has planned.
 */
import { h, mount, icon, chooseAction } from '../ui.js';
import { DAYS, dayKeyFor, state, listWorkouts, listRoutines, exerciseMap } from '../store.js';
import { summarizeWorkout } from '../stats.js';
import { uid } from '../db.js';
import { localISO, fmtDate, fmtTime, formatVolume, formatDurationShort } from '../format.js';
import { editNewWorkout } from './workout-edit.js';

// Remembered while the app is open, so coming back from a workout keeps your place.
let viewMonth = null;   // Date set to the 1st of the month being shown
let selectedISO = null; // 'YYYY-MM-DD'

export async function render(root) {
  const [workouts, routines, exMap] = await Promise.all([listWorkouts(), listRoutines(), exerciseMap()]);
  const routineById = new Map(routines.map((r) => [r.id, r]));
  const todayISO = localISO();
  if (!selectedISO) selectedISO = todayISO;
  if (!viewMonth) { const d = new Date(); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); }

  // Group workouts by calendar day.
  const byDay = new Map();
  for (const w of workouts) {
    const key = localISO(new Date(w.startedAt));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(w);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startedAt - b.startedAt);

  const redraw = () => render(root);
  const changeMonth = (delta) => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1); redraw(); };
  const goToday = () => { const d = new Date(); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); selectedISO = todayISO; redraw(); };

  /* ----- month grid ----- */
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = (viewMonth.getDay() + 6) % 7; // weeks start on Monday
  const monthCount = [...byDay.keys()].filter((k) => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
    .reduce((n, k) => n + byDay.get(k).length, 0);

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(h('span', { class: 'cal-cell blank' }));
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = localISO(new Date(year, month, d));
    const count = byDay.get(iso)?.length ?? 0;
    const cls = ['cal-cell',
      count && 'has-workout',
      iso === todayISO && 'is-today',
      iso === selectedISO && 'selected',
      iso > todayISO && 'future'].filter(Boolean).join(' ');
    cells.push(h('button', {
      type: 'button', class: cls,
      'aria-label': `${fmtDate(new Date(year, month, d).getTime(), { weekday: 'long', month: 'long', day: 'numeric' })}${count ? `, ${count} workout${count > 1 ? 's' : ''}` : ''}`,
      'aria-pressed': String(iso === selectedISO),
      onclick: () => { selectedISO = iso; redraw(); },
    }, String(d), count > 1 && h('small', {}, `×${count}`)));
  }

  const calendar = h('section', { class: 'card calendar' },
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => changeMonth(-1) }, icon('back')),
      h('div', { class: 'cal-title' },
        h('b', {}, fmtDate(viewMonth.getTime(), { month: 'long', year: 'numeric' })),
        h('span', {}, `${monthCount} ${monthCount === 1 ? 'workout' : 'workouts'}`)),
      h('button', { class: 'icon-btn', 'aria-label': 'Next month', onclick: () => changeMonth(1) }, icon('chevron'))),
    h('div', { class: 'cal-grid cal-weekdays' }, DAYS.map((d) => h('span', {}, d.short[0]))),
    h('div', { class: 'cal-grid' }, cells));

  /* ----- selected day ----- */
  const [sy, sm, sd] = selectedISO.split('-').map(Number);
  const selDate = new Date(sy, sm - 1, sd);
  const dayWorkouts = byDay.get(selectedISO) ?? [];
  const isFuture = selectedISO > todayISO;
  const scheduled = routineById.get(state.schedule[dayKeyFor(selDate)]);

  async function addWorkout() {
    const choice = await chooseAction(`Add workout · ${fmtDate(selDate.getTime(), { weekday: 'short', month: 'short', day: 'numeric' })}`, [
      ...routines.map((r) => ({ label: r.name, value: r.id, active: r.id === scheduled?.id })),
      { label: 'Empty workout', value: 'empty' },
    ]);
    if (!choice) return;
    const routine = routineById.get(choice);
    // Default start: 6 pm that day, 1 hour long. Both editable on the next screen.
    const start = new Date(sy, sm - 1, sd, 18, 0).getTime();
    editNewWorkout({
      id: uid(),
      routineId: routine?.id ?? null,
      routineName: routine?.name ?? 'Workout',
      startedAt: start,
      finishedAt: start + 60 * 60000,
      exercises: (routine?.exercises ?? []).map((rx) => ({
        exerciseId: rx.exerciseId,
        name: exMap.get(rx.exerciseId)?.name ?? 'Exercise', // snapshot, like logged workouts
        sets: rx.sets.map(({ type, weight, reps, time }) => ({ type, weight, reps, time })),
      })),
    }, '#/calendar');
  }

  const workoutCard = (w) => {
    const s = summarizeWorkout(w);
    return h('div', { class: 'card day-workout' },
      h('a', { class: 'day-workout-main', href: `#/history/${w.id}` },
        h('b', {}, w.routineName || 'Workout'),
        h('span', {}, `${fmtTime(w.startedAt)} · ${formatDurationShort(s.duration)} · ${formatVolume(s.volume, state.unit)} · ${s.sets} ${s.sets === 1 ? 'set' : 'sets'}`)),
      h('a', { class: 'btn btn-small', href: `#/history/${w.id}/edit` }, 'Edit'));
  };

  const dayPanel = h('section', { class: 'day-panel' },
    h('h2', { class: 'section-title' }, selectedISO === todayISO ? 'Today' : fmtDate(selDate.getTime(), { weekday: 'long', month: 'long', day: 'numeric' })),
    dayWorkouts.length
      ? h('div', { class: 'stack' }, dayWorkouts.map(workoutCard))
      : h('p', { class: 'day-empty' },
        isFuture
          ? (scheduled ? `Planned: ${scheduled.name}` : 'Rest day')
          : 'No workout logged.',
        !isFuture && scheduled && h('span', { class: 'muted' }, ` Scheduled: ${scheduled.name}.`)),
    !isFuture && h('button', { class: 'btn btn-block add-exercise', onclick: addWorkout }, icon('plus'),
      dayWorkouts.length ? 'Add another workout' : 'Add workout'));

  mount(root,
    h('header', { class: 'topbar workout-bar' }, // workout-bar: right column fits a text button
      h('a', { class: 'icon-btn', href: '#/history', 'aria-label': 'Back to history' }, icon('back')),
      h('div', { class: 'topbar-title' }, 'Calendar'),
      h('button', { class: 'btn btn-small', onclick: goToday }, 'Today')),
    calendar,
    dayPanel,
  );
}
