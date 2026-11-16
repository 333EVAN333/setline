/**
 * views/workout.js — the live workout screen (#/workout).
 *
 * Layout per exercise card:  SET | PREVIOUS | LBS | REPS | ✓   (or SET | PREVIOUS | TIME | ✓)
 *   - PREVIOUS = the same set number from the last time you did this exercise.
 *     Tap it to copy those numbers into the row.
 *   - ✓ marks a set done. Only checked sets are saved to history.
 *
 * Same editing pattern as the routine editor: typing autosaves (debounced),
 * structural changes save immediately and redraw.
 */
import { h, mount, icon, chooseAction, confirmAction, toast, debounce } from '../ui.js';
import { state, getActiveWorkout, saveActiveWorkout, clearActiveWorkout, exerciseMap, lastSessions } from '../store.js';
import {
  setLabels, setTypeChoices, newSet, formatRepTarget, parseDuration, formatDuration, parseNumber, formatSetSummary,
} from '../sets.js';
import { unitFor, formatWeight, displayToKg, kgToDisplay } from '../units.js';
import { makeEntry, workoutStats, pendingSets, finishWorkout, updateRoutineFromWorkout, formatClock } from '../workout.js';
import { pickExercise } from './exercises.js';

export async function render(root) {
  const w = await getActiveWorkout();
  if (!w) { location.hash = '#/home'; return; }
  const [exMap, last] = await Promise.all([exerciseMap(), lastSessions()]);

  const saveSoon = debounce(() => saveActiveWorkout(w), 300);
  window.addEventListener('hashchange', saveSoon.flush, { once: true });
  /** Save now and redraw. `structural` marks that the routine layout changed. */
  const commit = async (structural = false) => {
    if (structural) w.structureChanged = true;
    saveSoon.cancel();
    await saveActiveWorkout(w);
    await render(root);
  };

  /* ----- header stats (duration ticks every second) ----- */
  const clockEl = h('b', {}, formatClock(Date.now() - w.startedAt));
  const volumeEl = h('b');
  const setsEl = h('b');
  const updateStats = () => {
    const { sets, volume } = workoutStats(w);
    volumeEl.textContent = `${Math.round(kgToDisplay(volume, state.unit)).toLocaleString()} ${state.unit}`;
    setsEl.textContent = sets;
  };
  updateStats();
  const timer = setInterval(() => {
    if (!clockEl.isConnected) { clearInterval(timer); return; } // screen was redrawn or left
    clockEl.textContent = formatClock(Date.now() - w.startedAt);
  }, 1000);

  /* ----- actions ----- */
  async function addExercise() {
    const ex = await pickExercise();
    if (!ex) return;
    exMap.set(ex.id, ex);
    w.exercises.push(makeEntry(ex.id, {}, last)); // auto-fills from your last session if there is one
    await commit(true);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  async function discard() {
    const ok = await confirmAction({ title: 'Discard workout?', message: 'Nothing from this session will be saved.', okLabel: 'Discard', danger: true });
    if (!ok) return;
    saveSoon.cancel();
    await clearActiveWorkout();
    location.hash = '#/home';
  }

  async function finish() {
    saveSoon.flush();
    const done = workoutStats(w).sets;
    if (!done) {
      toast('Check off at least one set first (or discard the workout)');
      return;
    }
    const pending = pendingSets(w);
    const ok = await confirmAction({
      title: 'Finish workout?',
      message: pending ? `${pending} unchecked ${pending === 1 ? 'set' : 'sets'} won’t be saved.` : `${done} sets completed. Nice work.`,
      okLabel: 'Finish',
    });
    if (!ok) return;

    // Offer to copy layout changes back into the routine before the workout is cleared.
    let updated = false;
    if (w.structureChanged && w.routineId) {
      const choice = await chooseAction(`Update “${w.routineName}”?`, [
        { label: 'Update routine with today’s changes', value: 'update' },
        { label: 'Keep routine as it was', value: 'keep' },
      ]);
      if (choice === 'update') updated = await updateRoutineFromWorkout(w);
    }
    const record = await finishWorkout(w);
    toast(record ? `Workout saved${updated ? ' · routine updated' : ''}` : 'Nothing to save');
    location.hash = record ? `#/history/${record.id}` : '#/home'; // show the summary
  }

  /* ----- one exercise card ----- */
  function exerciseCard(x, index) {
    const ex = exMap.get(x.exerciseId);
    if (!ex) return null;
    const timed = ex.kind === 'time';
    const unit = unitFor(ex, state.unit);
    const labels = setLabels(x.sets);
    const prevSets = last.get(x.exerciseId)?.sets ?? [];

    async function exerciseMenu() {
      const lastIndex = w.exercises.length - 1;
      const choice = await chooseAction(ex.name, [
        { label: 'Move up', value: 'up', disabled: index === 0 },
        { label: 'Move down', value: 'down', disabled: index === lastIndex },
        { label: 'Remove exercise', value: 'remove', danger: true },
      ]);
      const list = w.exercises;
      if (choice === 'up') [list[index - 1], list[index]] = [list[index], list[index - 1]];
      else if (choice === 'down') [list[index + 1], list[index]] = [list[index], list[index + 1]];
      else if (choice === 'remove') list.splice(index, 1);
      else return;
      commit(true);
    }

    async function setMenu(i) {
      const choice = await chooseAction(`Set ${labels[i]}`, setTypeChoices(x.sets[i].type));
      if (!choice) return;
      if (choice === 'remove') x.sets.splice(i, 1);
      else x.sets[i].type = choice;
      commit(true);
    }

    const setRow = (set, i) => {
      const prev = prevSets[i];
      const badge = h('button', { type: 'button', class: `set-badge type-${set.type}`, 'aria-label': `Set ${labels[i]}, change type`, onclick: () => setMenu(i) }, labels[i]);

      // PREVIOUS: tap to copy last time's numbers into this row.
      const prevCell = h('button', {
        type: 'button', class: 'prev-cell', disabled: !prev || set.done, 'aria-label': prev ? 'Use previous' : 'No previous',
        onclick: () => { Object.assign(set, { weight: prev.weight, reps: prev.reps, time: prev.time }); commit(); },
      }, prev ? formatSetSummary(prev, unit, timed) : '—');

      const check = h('button', {
        type: 'button', class: `check${set.done ? ' on' : ''}`, 'aria-label': set.done ? 'Mark set not done' : 'Mark set done', 'aria-pressed': String(!!set.done),
        onclick: () => {
          if (!set.done) {
            if (timed && set.time == null) { toast('Enter a time first'); return; }
            if (!timed && set.reps == null) { toast('Enter reps first'); return; }
          }
          set.done = !set.done;
          commit();
        },
      }, icon('check'));

      const rowClass = `set-grid live${timed ? ' timed' : ''} set-row${set.done ? ' done' : ''}`;

      if (timed) {
        const timeInput = h('input', {
          class: 'cell-input', value: formatDuration(set.time), placeholder: prev ? formatDuration(prev.time) : '0:00', inputmode: 'text', 'aria-label': 'Time',
          onchange: (e) => {
            const sec = parseDuration(e.target.value);
            if (Number.isNaN(sec)) { e.target.classList.add('invalid'); toast('Use seconds (45) or m:ss (1:30)'); return; }
            e.target.classList.remove('invalid');
            set.time = sec;
            e.target.value = formatDuration(sec);
            saveSoon();
          },
        });
        return h('div', { class: rowClass }, badge, prevCell, timeInput, check);
      }

      const weightInput = h('input', {
        class: 'cell-input', value: formatWeight(set.weight, unit), placeholder: '–', inputmode: 'decimal', 'aria-label': `Weight (${unit})`,
        oninput: (e) => {
          const n = parseNumber(e.target.value);
          e.target.classList.toggle('invalid', Number.isNaN(n));
          if (Number.isNaN(n)) return;
          set.weight = displayToKg(n, unit);
          saveSoon();
          updateStats();
        },
      });
      const repsInput = h('input', {
        class: 'cell-input', value: set.reps ?? '', placeholder: formatRepTarget(x.repTarget) || '–', inputmode: 'numeric', 'aria-label': 'Reps',
        oninput: (e) => {
          const n = parseNumber(e.target.value);
          const bad = Number.isNaN(n) || (n !== null && !Number.isInteger(n));
          e.target.classList.toggle('invalid', bad);
          if (bad) return;
          set.reps = n;
          saveSoon();
          updateStats();
        },
      });
      return h('div', { class: rowClass }, badge, prevCell, weightInput, repsInput, check);
    };

    const header = timed
      ? h('div', { class: 'set-grid live timed set-head' }, h('span', {}, 'Set'), h('span', {}, 'Previous'), h('span', {}, 'Time'), h('span', {}, icon('check')))
      : h('div', { class: 'set-grid live set-head' }, h('span', {}, 'Set'), h('span', {}, 'Previous'), h('span', {}, unit), h('span', {}, 'Reps'), h('span', {}, icon('check')));

    const doneCount = x.sets.filter((s) => s.done).length;
    return h('section', { class: `card ex-card${doneCount && doneCount === x.sets.length ? ' complete' : ''}` },
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-title' },
          h('div', { class: 'ex-name' }, ex.name),
          h('div', { class: 'ex-sub' },
            [ex.muscle, x.repTarget && `${formatRepTarget(x.repTarget)} reps`, `${doneCount}/${x.sets.length} done`].filter(Boolean).join(' · '))),
        h('button', { class: 'icon-btn', 'aria-label': 'Exercise options', onclick: exerciseMenu }, icon('more'))),
      header,
      x.sets.map(setRow),
      h('button', {
        type: 'button', class: 'add-set',
        onclick: () => { x.sets.push({ ...newSet(x.sets[x.sets.length - 1]), done: false }); commit(true); },
      }, icon('plus'), 'Add set'));
  }

  mount(root,
    h('header', { class: 'topbar workout-bar' },
      h('a', { class: 'icon-btn', href: '#/home', 'aria-label': 'Minimize workout' }, icon('down')),
      h('div', { class: 'topbar-title' }, w.routineName),
      h('button', { class: 'btn btn-small btn-primary', onclick: finish }, 'Finish')),
    h('div', { class: 'stats' },
      h('div', {}, h('span', {}, 'Duration'), clockEl),
      h('div', {}, h('span', {}, 'Volume'), volumeEl),
      h('div', {}, h('span', {}, 'Sets'), setsEl)),
    w.exercises.length
      ? h('div', { class: 'stack' }, w.exercises.map(exerciseCard))
      : h('div', { class: 'empty card' }, h('h3', {}, 'No exercises'), h('p', {}, 'Add one below to keep going.')),
    h('button', { class: 'btn btn-primary btn-block add-exercise', onclick: addExercise }, icon('plus'), 'Add exercise'),
    h('button', { class: 'btn btn-ghost-danger btn-block', onclick: discard }, 'Discard workout'),
  );
}
