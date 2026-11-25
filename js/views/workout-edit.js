/**
 * views/workout-edit.js — edit a finished workout (#/history/:id/edit).
 *
 * Unlike the routine editor (which autosaves), this works on a COPY of the
 * workout and only writes it back when you tap Save. History is your record,
 * so changes should be deliberate, and Cancel throws them away.
 *
 * Editable: name, date & start time, duration, and every exercise/set.
 * Volume and set counts aren't stored; they're recalculated from the sets,
 * so the numbers at the top update as you edit.
 */
import { h, mount, icon, chooseAction, confirmAction, toast } from '../ui.js';
import { state, getWorkout, saveWorkout, exerciseMap } from '../store.js';
import { summarizeWorkout } from '../stats.js';
import { setLabels, setTypeChoices, newSet, parseDuration, formatDuration, parseNumber } from '../sets.js';
import { unitFor, formatWeight, displayToKg } from '../units.js';
import { formatVolume } from '../format.js';
import { pickExercise } from './exercises.js';

/** Date -> "2026-11-24T18:05" for <input type="datetime-local"> (local time). */
function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function render(root, id) {
  const [original, exMap] = await Promise.all([getWorkout(id), exerciseMap()]);
  if (!original) { location.hash = '#/history'; return; }

  // Work on a deep copy; `original` stays untouched until Save.
  const draft = structuredClone(original);
  let durationMin = Math.max(1, Math.round((draft.finishedAt - draft.startedAt) / 60000));
  let dirty = false;
  const changed = () => { dirty = true; updateStats(); };

  /* ----- live totals ----- */
  const volumeEl = h('b');
  const setsEl = h('b');
  function updateStats() {
    const s = summarizeWorkout(draft);
    volumeEl.textContent = formatVolume(s.volume, state.unit);
    setsEl.textContent = s.sets;
  }

  /* ----- leaving ----- */
  async function cancel() {
    if (dirty && !(await confirmAction({ title: 'Discard changes?', message: 'Your edits to this workout won’t be saved.', okLabel: 'Discard', danger: true }))) return;
    location.hash = `#/history/${id}`;
  }

  async function save() {
    // Drop sets with nothing logged, then exercises left with no sets.
    let dropped = 0;
    for (const x of draft.exercises) {
      const timed = exMap.get(x.exerciseId)?.kind === 'time';
      const before = x.sets.length;
      x.sets = x.sets.filter((s) => (timed ? s.time != null : s.reps != null));
      dropped += before - x.sets.length;
    }
    draft.exercises = draft.exercises.filter((x) => x.sets.length);
    if (!draft.exercises.length) {
      toast('A workout needs at least one set. Delete it instead.');
      return;
    }
    draft.finishedAt = draft.startedAt + durationMin * 60000;
    draft.routineName = draft.routineName.trim() || 'Workout';
    await saveWorkout(draft);
    toast(dropped ? `Saved · ${dropped} empty ${dropped === 1 ? 'set' : 'sets'} removed` : 'Workout updated');
    location.hash = `#/history/${id}`;
  }

  /* ----- details card: name, start, duration ----- */
  const nameInput = h('input', {
    class: 'input', value: draft.routineName, maxlength: 60, 'aria-label': 'Workout name',
    oninput: (e) => { draft.routineName = e.target.value; changed(); },
  });
  const startInput = h('input', {
    class: 'input', type: 'datetime-local', value: toLocalInput(draft.startedAt), 'aria-label': 'Start date and time',
    onchange: (e) => {
      const ms = new Date(e.target.value).getTime(); // datetime-local is read as local time
      if (Number.isNaN(ms)) { e.target.value = toLocalInput(draft.startedAt); return; }
      draft.startedAt = ms;
      changed();
    },
  });
  const durationInput = h('input', {
    class: 'input', value: durationMin, inputmode: 'numeric', 'aria-label': 'Duration in minutes',
    oninput: (e) => {
      const n = parseNumber(e.target.value);
      const bad = !n || !Number.isInteger(n) || n > 1440;
      e.target.classList.toggle('invalid', bad);
      if (bad) return;
      durationMin = n;
      changed();
    },
  });
  const details = h('section', { class: 'card pad edit-details' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), nameInput),
    h('div', { class: 'edit-row' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Started'), startInput),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Minutes'), durationInput)));

  /* ----- exercises ----- */
  const listEl = h('div', { class: 'stack' });

  /** Redraw the exercise cards after a structural change (add/remove/reorder/type). */
  function drawExercises() {
    mount(listEl, draft.exercises.map(exerciseCard));
    updateStats();
  }
  const structural = () => { dirty = true; drawExercises(); };

  async function addExercise() {
    const ex = await pickExercise();
    if (!ex) return;
    exMap.set(ex.id, ex);
    draft.exercises.push({ exerciseId: ex.id, name: ex.name, sets: [newSet()] });
    structural();
  }

  function exerciseCard(x, index) {
    const ex = exMap.get(x.exerciseId);
    const timed = ex ? ex.kind === 'time' : x.sets.some((s) => s.time != null);
    const unit = unitFor(ex, state.unit);
    const labels = setLabels(x.sets);

    async function exerciseMenu() {
      const last = draft.exercises.length - 1;
      const choice = await chooseAction(x.name, [
        { label: 'Move up', value: 'up', disabled: index === 0 },
        { label: 'Move down', value: 'down', disabled: index === last },
        { label: 'Remove exercise', value: 'remove', danger: true },
      ]);
      const list = draft.exercises;
      if (choice === 'up') [list[index - 1], list[index]] = [list[index], list[index - 1]];
      else if (choice === 'down') [list[index + 1], list[index]] = [list[index], list[index + 1]];
      else if (choice === 'remove') list.splice(index, 1);
      else return;
      structural();
    }

    async function setMenu(i) {
      const choice = await chooseAction(`Set ${labels[i]}`, setTypeChoices(x.sets[i].type));
      if (!choice) return;
      if (choice === 'remove') x.sets.splice(i, 1);
      else x.sets[i].type = choice;
      structural();
    }

    const setRow = (s, i) => {
      const badge = h('button', { type: 'button', class: `set-badge type-${s.type}`, 'aria-label': `Set ${labels[i]}, change type`, onclick: () => setMenu(i) }, labels[i]);
      const remove = h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Remove set', onclick: () => { x.sets.splice(i, 1); structural(); } }, icon('x'));

      if (timed) {
        const timeInput = h('input', {
          class: 'cell-input', value: formatDuration(s.time), placeholder: '0:00', 'aria-label': 'Time',
          onchange: (e) => {
            const sec = parseDuration(e.target.value);
            if (Number.isNaN(sec)) { e.target.classList.add('invalid'); toast('Use seconds (45) or m:ss (1:30)'); return; }
            e.target.classList.remove('invalid');
            s.time = sec;
            e.target.value = formatDuration(sec);
            changed();
          },
        });
        return h('div', { class: 'set-grid timed set-row' }, badge, timeInput, remove);
      }

      const weightInput = h('input', {
        class: 'cell-input', value: s.weight > 0 ? formatWeight(s.weight, unit) : '', placeholder: 'BW', inputmode: 'decimal', 'aria-label': `Weight (${unit})`,
        oninput: (e) => {
          const n = parseNumber(e.target.value);
          e.target.classList.toggle('invalid', Number.isNaN(n));
          if (Number.isNaN(n)) return;
          s.weight = displayToKg(n, unit);
          changed();
        },
      });
      const repsInput = h('input', {
        class: 'cell-input', value: s.reps ?? '', placeholder: '–', inputmode: 'numeric', 'aria-label': 'Reps',
        oninput: (e) => {
          const n = parseNumber(e.target.value);
          const bad = Number.isNaN(n) || (n !== null && !Number.isInteger(n));
          e.target.classList.toggle('invalid', bad);
          if (bad) return;
          s.reps = n;
          changed();
        },
      });
      return h('div', { class: 'set-grid set-row' }, badge, weightInput, repsInput, remove);
    };

    const header = timed
      ? h('div', { class: 'set-grid timed set-head' }, h('span', {}, 'Set'), h('span', {}, 'Time'), h('span'))
      : h('div', { class: 'set-grid set-head' }, h('span', {}, 'Set'), h('span', {}, unit), h('span', {}, 'Reps'), h('span'));

    return h('section', { class: 'card ex-card' },
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-title' }, h('div', { class: 'ex-name' }, x.name), h('div', { class: 'ex-sub' }, ex?.muscle ?? '')),
        h('button', { class: 'icon-btn', 'aria-label': 'Exercise options', onclick: exerciseMenu }, icon('more'))),
      header,
      x.sets.map(setRow),
      h('button', {
        type: 'button', class: 'add-set',
        onclick: () => { x.sets.push(newSet(x.sets[x.sets.length - 1])); structural(); },
      }, icon('plus'), 'Add set'));
  }

  mount(root,
    h('header', { class: 'topbar workout-bar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Cancel editing', onclick: cancel }, icon('x')),
      h('div', { class: 'topbar-title' }, 'Edit workout'),
      h('button', { class: 'btn btn-small btn-primary', onclick: save }, 'Save')),
    details,
    h('div', { class: 'stats two' },
      h('div', {}, h('span', {}, 'Volume'), volumeEl),
      h('div', {}, h('span', {}, 'Sets'), setsEl)),
    listEl,
    h('button', { class: 'btn btn-block add-exercise', onclick: addExercise }, icon('plus'), 'Add exercise'),
    h('p', { class: 'footnote' }, 'Volume is calculated from weight × reps (warm-ups excluded), so edit the sets to change it. Leave weight empty for bodyweight.'),
  );
  drawExercises();
}
