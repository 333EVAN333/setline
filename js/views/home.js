/**
 * views/home.js — the Today screen: today's routine with a big Start button,
 * and the week at a glance. Tapping a weekday assigns a routine (or Rest) to it,
 * so this screen doubles as the weekly schedule editor.
 */
import { h, mount, icon, chooseAction } from '../ui.js';
import { DAYS, dayKeyFor, state, listRoutines, setScheduleDay, getActiveWorkout } from '../store.js';
import { startWorkout } from '../workout.js';
import { backupReminderDue, exportBackup, snoozeBackupReminder } from '../backup.js';

export async function render(root) {
  const [routines, active, reminder] = await Promise.all([listRoutines(), getActiveWorkout(), backupReminderDue()]);
  const byId = new Map(routines.map((r) => [r.id, r]));
  const now = new Date();
  const todayKey = dayKeyFor(now);
  const todays = byId.get(state.schedule[todayKey]) || null;

  // Monday of the current week, so each row can show its date.
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  async function pickForDay(day) {
    if (!routines.length) { location.hash = '#/routines'; return; }
    const current = state.schedule[day.key];
    const choice = await chooseAction(`${day.long}`, [
      ...routines.map((r) => ({ label: r.name, value: r.id, active: r.id === current })),
      { label: 'Rest', value: 'rest', active: !byId.has(current) },
    ]);
    if (choice === null) return;
    await setScheduleDay(day.key, choice === 'rest' ? null : choice);
    render(root);
  }

  /* ----- today card ----- */
  let todayCard;
  if (active) {
    todayCard = h('section', { class: 'card today' },
      h('p', { class: 'eyebrow accent' }, 'Workout in progress'),
      h('h2', {}, active.routineName),
      h('p', { class: 'muted' }, `Started at ${new Date(active.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`),
      h('a', { class: 'btn btn-primary btn-block btn-big', href: '#/workout' }, icon('play'), 'Resume Workout'));
  } else if (!routines.length) {
    todayCard = h('section', { class: 'card today' },
      h('p', { class: 'eyebrow' }, 'Welcome to Setline'),
      h('h2', {}, 'Build your week'),
      h('p', { class: 'muted' }, 'Create a routine for each gym day, then tap a weekday below to schedule it.'),
      h('a', { class: 'btn btn-primary btn-block btn-big', href: '#/routines' }, icon('plus'), 'Create a routine'));
  } else if (todays) {
    const sets = todays.exercises.reduce((n, x) => n + x.sets.length, 0);
    todayCard = h('section', { class: 'card today' },
      h('p', { class: 'eyebrow accent' }, 'Today’s routine'),
      h('h2', {}, todays.name),
      h('p', { class: 'muted' }, todays.exercises.length ? `${todays.exercises.length} exercises · ${sets} sets` : 'No exercises yet'),
      h('button', {
        class: 'btn btn-primary btn-block btn-big start-btn',
        disabled: !todays.exercises.length,
        onclick: () => startWorkout(todays),
      }, icon('play'), 'Start Workout'),
      h('div', { class: 'today-links' },
        h('a', { class: 'link', href: `#/routine/${todays.id}` }, 'Edit routine'),
        h('button', { class: 'link', onclick: () => pickForDay(DAYS.find((d) => d.key === todayKey)) }, 'Change today')));
  } else {
    todayCard = h('section', { class: 'card today rest' },
      h('p', { class: 'eyebrow' }, 'Today'),
      h('h2', {}, 'Rest day'),
      h('p', { class: 'muted' }, 'Recovery is part of the plan.'),
      h('button', { class: 'btn btn-block', onclick: () => pickForDay(DAYS.find((d) => d.key === todayKey)) }, 'Train today instead'));
  }

  /* ----- week list ----- */
  const weekRow = (day, i) => {
    const r = byId.get(state.schedule[day.key]);
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const isToday = day.key === todayKey;
    return h('li', { class: isToday ? 'today-row' : '' },
      h('button', { type: 'button', onclick: () => pickForDay(day), 'aria-label': `${day.long}: ${r ? r.name : 'Rest'}. Change` },
        h('span', { class: 'day' }, h('b', {}, day.short), h('small', {}, date.getDate())),
        r
          ? h('span', { class: 'plan' }, r.name, h('small', {}, `${r.exercises.length} exercises`))
          : h('span', { class: 'plan rest' }, 'Rest'),
        h('span', { class: 'chev' }, icon('chevron'))));
  };

  /* ----- backup reminder (14+ days since last export) ----- */
  const reminderCard = reminder && h('section', { class: 'card backup-reminder', role: 'status' },
    h('div', {},
      h('b', {}, 'Time to back up'),
      h('p', {}, reminder.never
        ? `You’ve been logging for ${reminder.days} days without a backup.`
        : `Your last backup was ${reminder.days} days ago.`)),
    h('div', { class: 'backup-reminder-actions' },
      h('button', { class: 'btn btn-small', onclick: async () => { await snoozeBackupReminder(); render(root); } }, 'Later'),
      h('button', { class: 'btn btn-small btn-primary', onclick: async () => { if (await exportBackup()) render(root); } }, 'Back up')));

  mount(root,
    h('header', { class: 'page-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
        h('h1', {}, 'Today'))),
    reminderCard,
    todayCard,
    h('h2', { class: 'section-title' }, 'This week'),
    h('ul', { class: 'card week plain' }, DAYS.map(weekRow)),
    h('p', { class: 'footnote' }, 'Tap a day to change what’s scheduled.'),
  );
}
