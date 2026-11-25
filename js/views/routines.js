/**
 * views/routines.js — the routine list (#/routines) and routine editor (#/routine/:id).
 *
 * Editing pattern used here:
 *   - Typing in a field changes the in-memory `routine` object and calls
 *     saveSoon() (debounced autosave), so there's no Save button.
 *   - Structural changes (add/remove/reorder, change set type) call commit(),
 *     which saves immediately and redraws the whole screen. Redrawing from
 *     scratch is simpler than patching the DOM and plenty fast for this size.
 */
import { h, mount, icon, pageHead, chooseAction, askText, confirmAction, toast, debounce } from '../ui.js';
import {
  DAYS, state, listRoutines, getRoutine, saveRoutine, createRoutine, deleteRoutine, moveRoutine, exerciseMap,
} from '../store.js';
import { startWorkout } from '../workout.js';
import { setTypeChoices, newSet, setLabels, parseRepTarget, formatRepTarget, parseDuration, formatDuration, parseNumber } from '../sets.js';
import { unitFor, formatWeight, displayToKg } from '../units.js';
import { uid } from '../db.js';
import { pickExercise } from './exercises.js';

/* ======================= routine list ======================= */

export async function renderList(root) {
  const routines = await listRoutines();
  const scheduledDays = (id) => DAYS.filter((d) => state.schedule[d.key] === id);

  async function create() {
    const name = await askText({ title: 'New routine', placeholder: 'e.g. Chest + Triceps', okLabel: 'Create' });
    if (!name) return;
    const r = await createRoutine(name);
    location.hash = `#/routine/${r.id}`;
  }

  async function menu(r) {
    const choice = await chooseAction(r.name, [
      { label: 'Edit exercises & sets', value: 'edit' },
      { label: 'Start workout', value: 'start', disabled: !r.exercises.length },
      { label: 'Rename', value: 'rename' },
      { label: 'Delete routine', value: 'delete', danger: true },
    ]);
    if (choice === 'edit') location.hash = `#/routine/${r.id}`; // opens the routine editor
    else if (choice === 'start') startWorkout(r);
    else if (choice === 'rename') {
      const name = await askText({ title: 'Rename routine', value: r.name });
      if (name) { r.name = name; await saveRoutine(r); renderList(root); }
    } else if (choice === 'delete') {
      const days = scheduledDays(r.id).map((d) => d.long);
      const ok = await confirmAction({
        title: `Delete “${r.name}”?`,
        message: days.length ? `${days.join(', ')} will become rest days. Past workouts are kept.` : 'Past workouts are kept.',
        okLabel: 'Delete', danger: true,
      });
      if (ok) { await deleteRoutine(r.id); renderList(root); }
    }
  }

  const card = (r, i) => {
    const sets = r.exercises.reduce((n, x) => n + x.sets.length, 0);
    const days = scheduledDays(r.id);
    return h('li', { class: 'card routine-card' },
      h('a', { class: 'routine-main', href: `#/routine/${r.id}` },
        h('div', { class: 'routine-name' }, r.name),
        h('div', { class: 'routine-meta' }, r.exercises.length ? `${r.exercises.length} exercises · ${sets} sets` : 'No exercises yet'),
        days.length > 0 && h('div', { class: 'chips' }, days.map((d) => h('span', { class: 'chip' }, d.short)))),
      h('div', { class: 'routine-actions' },
        h('button', { class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: async () => { await moveRoutine(r.id, -1); renderList(root); } }, icon('up')),
        h('button', { class: 'icon-btn', 'aria-label': 'Move down', disabled: i === routines.length - 1, onclick: async () => { await moveRoutine(r.id, 1); renderList(root); } }, icon('down')),
        h('button', { class: 'icon-btn', 'aria-label': 'More', onclick: () => menu(r) }, icon('more'))));
  };

  mount(root,
    pageHead('Routines', h('button', { class: 'btn btn-small btn-primary', onclick: create }, icon('plus'), 'New')),
    routines.length
      ? h('ul', { class: 'stack plain' }, routines.map(card))
      : h('div', { class: 'empty card' },
        h('h3', {}, 'No routines yet'),
        h('p', {}, 'A routine is one gym day, like “Chest + Triceps”. Create one, add exercises, then assign it to a weekday on the Today tab.'),
        h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Create routine')),
  );
}

/* ======================= routine editor ======================= */

export async function renderEditor(root, id) {
  const routine = await getRoutine(id);
  if (!routine) { location.hash = '#/routines'; return; }
  const exMap = await exerciseMap();

  const saveSoon = debounce(() => saveRoutine(routine), 400);
  window.addEventListener('hashchange', saveSoon.flush, { once: true }); // don't lose typing when leaving
  const commit = async () => {
    saveSoon.cancel();
    await saveRoutine(routine);
    await renderEditor(root, id);
  };

  async function rename() {
    const name = await askText({ title: 'Rename routine', value: routine.name });
    if (name) { routine.name = name; commit(); }
  }

  async function routineMenu() {
    const choice = await chooseAction(routine.name, [
      { label: 'Start workout', value: 'start', disabled: !routine.exercises.length },
      { label: 'Rename', value: 'rename' },
      { label: 'Delete routine', value: 'delete', danger: true },
    ]);
    if (choice === 'start') { saveSoon.flush(); startWorkout(routine); }
    if (choice === 'rename') rename();
    if (choice === 'delete' && await confirmAction({ title: `Delete “${routine.name}”?`, okLabel: 'Delete', danger: true })) {
      saveSoon.cancel();
      await deleteRoutine(routine.id);
      location.hash = '#/routines';
    }
  }

  async function addExercise() {
    const ex = await pickExercise();
    if (!ex) return;
    exMap.set(ex.id, ex);
    routine.exercises.push({ id: uid(), exerciseId: ex.id, repTarget: null, sets: [newSet(), newSet(), newSet()] });
    await commit();
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  /* ----- one exercise card ----- */
  function exerciseCard(rx, index) {
    const ex = exMap.get(rx.exerciseId);
    if (!ex) return null; // exercise was deleted from the library
    const timed = ex.kind === 'time';
    const unit = unitFor(ex, state.unit);
    const labels = setLabels(rx.sets);

    async function exerciseMenu() {
      const last = routine.exercises.length - 1;
      const choice = await chooseAction(ex.name, [
        { label: 'Move up', value: 'up', disabled: index === 0 },
        { label: 'Move down', value: 'down', disabled: index === last },
        { label: 'Remove from routine', value: 'remove', danger: true },
      ]);
      const list = routine.exercises;
      if (choice === 'up') [list[index - 1], list[index]] = [list[index], list[index - 1]];
      else if (choice === 'down') [list[index + 1], list[index]] = [list[index], list[index + 1]];
      else if (choice === 'remove') list.splice(index, 1);
      else return;
      commit();
    }

    async function setMenu(setIndex) {
      const set = rx.sets[setIndex];
      const choice = await chooseAction(`Set ${labels[setIndex]}`, setTypeChoices(set.type));
      if (!choice) return;
      if (choice === 'remove') rx.sets.splice(setIndex, 1);
      else set.type = choice;
      commit();
    }

    // Rep target: "8" or "6–8". Only for weight × reps exercises.
    const targetInput = !timed && h('input', {
      class: 'target-input', value: formatRepTarget(rx.repTarget), placeholder: 'e.g. 6–8',
      inputmode: 'text', enterkeyhint: 'done', 'aria-label': 'Rep target',
      onchange: (e) => {
        const rt = parseRepTarget(e.target.value);
        if (rt === undefined) { toast('Use a number like 8 or a range like 6–8'); e.target.value = formatRepTarget(rx.repTarget); return; }
        rx.repTarget = rt;
        e.target.value = formatRepTarget(rt);
        commit(); // redraw so reps placeholders show the new target
      },
    });

    const setRow = (set, i) => {
      const badge = h('button', {
        type: 'button', class: `set-badge type-${set.type}`, 'aria-label': `Set ${labels[i]}, change type`,
        onclick: () => setMenu(i),
      }, labels[i]);

      const removeBtn = h('button', {
        type: 'button', class: 'icon-btn small', 'aria-label': 'Remove set',
        onclick: () => { rx.sets.splice(i, 1); commit(); },
      }, icon('x'));

      if (timed) {
        const timeInput = h('input', {
          class: 'cell-input', value: formatDuration(set.time), placeholder: '0:00', inputmode: 'text', enterkeyhint: 'next', 'aria-label': 'Time',
          onchange: (e) => {
            const sec = parseDuration(e.target.value);
            if (Number.isNaN(sec)) { e.target.classList.add('invalid'); toast('Use seconds (45) or m:ss (1:30)'); return; }
            e.target.classList.remove('invalid');
            set.time = sec;
            e.target.value = formatDuration(sec);
            saveSoon();
          },
        });
        return h('div', { class: 'set-grid timed set-row' }, badge, timeInput, removeBtn);
      }

      const weightInput = h('input', {
        class: 'cell-input', value: formatWeight(set.weight, unit), placeholder: '–', inputmode: 'decimal', enterkeyhint: 'next', 'aria-label': `Weight (${unit})`,
        oninput: (e) => {
          const n = parseNumber(e.target.value);
          e.target.classList.toggle('invalid', Number.isNaN(n));
          if (Number.isNaN(n)) return;
          set.weight = displayToKg(n, unit);
          saveSoon();
        },
      });
      const repsInput = h('input', {
        class: 'cell-input', value: set.reps ?? '', placeholder: formatRepTarget(rx.repTarget) || '–', inputmode: 'numeric', enterkeyhint: 'next', 'aria-label': 'Reps',
        oninput: (e) => {
          const n = parseNumber(e.target.value);
          const bad = Number.isNaN(n) || (n !== null && !Number.isInteger(n));
          e.target.classList.toggle('invalid', bad);
          if (bad) return;
          set.reps = n;
          saveSoon();
        },
      });
      return h('div', { class: 'set-grid set-row' }, badge, weightInput, repsInput, removeBtn);
    };

    const header = timed
      ? h('div', { class: 'set-grid timed set-head' }, h('span', {}, 'Set'), h('span', {}, 'Time'), h('span'))
      : h('div', { class: 'set-grid set-head' }, h('span', {}, 'Set'), h('span', {}, unit), h('span', {}, 'Reps'), h('span'));

    return h('section', { class: 'card ex-card' },
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-title' },
          h('div', { class: 'ex-name' }, ex.name),
          h('div', { class: 'ex-sub' }, ex.muscle, timed ? ' · timed' : '')),
        h('button', { class: 'icon-btn', 'aria-label': 'Exercise options', onclick: exerciseMenu }, icon('more'))),
      targetInput && h('label', { class: 'target-row' }, 'Rep target', targetInput),
      header,
      rx.sets.map(setRow),
      h('button', {
        type: 'button', class: 'add-set',
        onclick: () => { rx.sets.push(newSet(rx.sets[rx.sets.length - 1])); commit(); },
      }, icon('plus'), 'Add set'));
  }

  mount(root,
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/routines', 'aria-label': 'Back to routines' }, icon('back')),
      h('button', { class: 'topbar-title', onclick: rename, title: 'Rename' }, routine.name),
      h('button', { class: 'icon-btn', 'aria-label': 'Routine options', onclick: routineMenu }, icon('more'))),
    routine.exercises.length
      ? h('div', { class: 'stack' }, routine.exercises.map(exerciseCard))
      : h('div', { class: 'empty card' },
        h('h3', {}, 'Empty routine'),
        h('p', {}, 'Add the exercises you do on this day, in order. Each starts with 3 sets you can adjust.')),
    h('button', { class: 'btn btn-primary btn-block add-exercise', onclick: addExercise }, icon('plus'), 'Add exercise'),
    h('p', { class: 'footnote' }, 'Changes save automatically. Tap a set number to make it a warm-up, failure or drop set.'),
  );
}
