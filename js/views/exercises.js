/**
 * views/exercises.js — the exercise library screen, plus two reusable sheets:
 *   - pickExercise(): choose an exercise to add to a routine (or workout later)
 *   - exerciseForm(): create or edit an exercise
 */
import { h, mount, icon, openSheet, confirmAction, toast, pageHead, field, segmented, searchBox } from '../ui.js';
import { listExercises, saveExercise, deleteExercise, routinesUsing, MUSCLE_GROUPS, state } from '../store.js';

/* ---------- library screen ---------- */

export async function renderLibrary(root) {
  const all = await listExercises();
  const listEl = h('div');
  // Tapping an exercise opens its history page (which has an Edit button).
  const open = (ex) => { location.hash = `#/exercise/${ex.id}`; };
  const draw = (q = '') => listEl.replaceChildren(groupedList(filterExercises(all, q), open));
  async function create() {
    if (await exerciseForm()) renderLibrary(root);
  }

  const search = searchBox(draw);
  mount(root,
    pageHead('Exercises',
      h('button', { class: 'btn btn-small btn-primary', onclick: create }, icon('plus'), 'New'),
      `${all.length} in library`),
    search.el,
    listEl,
  );
  draw();
}

/* ---------- list rendering (shared by the screen and the picker) ---------- */

function filterExercises(all, query) {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((e) => e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q));
}

/** Exercises grouped under muscle-group headings, in MUSCLE_GROUPS order. */
function groupedList(exercises, onPick, emptyText = 'No exercises yet. Tap “New” to add your first one.') {
  if (!exercises.length) return h('p', { class: 'empty' }, emptyText);
  const groups = MUSCLE_GROUPS
    .map((m) => [m, exercises.filter((e) => e.muscle === m)])
    .filter(([, list]) => list.length);
  return h('div', {}, groups.map(([muscle, list]) => [
    h('h2', { class: 'section-title' }, muscle),
    h('div', { class: 'card list' }, list.map((ex) => exerciseRow(ex, onPick))),
  ]));
}

function exerciseRow(ex, onPick) {
  return h('button', { type: 'button', class: 'ex-row', onclick: () => onPick(ex) },
    h('span', { class: 'ex-row-name' }, ex.name),
    h('span', { class: 'ex-row-tags' },
      ex.kind === 'time' && h('span', { class: 'tag' }, icon('clock'), 'Time'),
      ex.unit && h('span', { class: 'tag' }, ex.unit)));
}

/* ---------- picker sheet ---------- */

/** Resolves with the chosen (or newly created) exercise, or null. */
export async function pickExercise() {
  const all = await listExercises();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; sheet.close(); resolve(v); };

    const listEl = h('div', { class: 'picker-list' });
    const draw = (q = '') => listEl.replaceChildren(
      groupedList(filterExercises(all, q), finish, q ? 'No match — create it below.' : 'Your library is empty — create an exercise below.'));
    const search = searchBox(draw);

    const createBtn = h('button', {
      type: 'button',
      class: 'btn btn-block',
      onclick: async () => {
        // Close the picker, open the form pre-filled with what was searched for.
        settled = true;
        sheet.close();
        const created = await exerciseForm({ name: search.input.value.trim() });
        resolve(created && created !== 'deleted' ? created : null);
      },
    }, icon('plus'), 'Create new exercise');

    const sheet = openSheet('Add exercise', h('div', {}, search.el, createBtn, listEl), { onClose: () => finish(null) });
    sheet.panel.classList.add('sheet-tall');
    draw();
  });
}

/* ---------- create / edit form ---------- */

/**
 * Pass an existing exercise to edit it, a partial draft ({name}) or nothing to create one.
 * Resolves with the saved exercise, 'deleted', or null if cancelled.
 */
export function exerciseForm(existing = null) {
  const isNew = !existing?.id;
  const draft = { name: '', muscle: MUSCLE_GROUPS[0], kind: 'weight', unit: null, ...existing };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; sheet.close(); resolve(v); };

    const nameInput = h('input', { class: 'input', value: draft.name, placeholder: 'e.g. Incline dumbbell press', maxlength: 60 });
    const muscleSelect = h('select', { class: 'input', value: draft.muscle },
      MUSCLE_GROUPS.map((m) => h('option', { value: m }, m)));

    const unitField = field('Weight unit', segmented([
      { value: null, label: `Default (${state.unit})` },
      { value: 'lbs', label: 'lbs' },
      { value: 'kg', label: 'kg' },
    ], draft.unit, (v) => { draft.unit = v; }));
    unitField.hidden = draft.kind !== 'weight';

    const kindField = field('Tracking', segmented([
      { value: 'weight', label: 'Weight × reps' },
      { value: 'time', label: 'Time' },
    ], draft.kind, (v) => { draft.kind = v; unitField.hidden = v !== 'weight'; }));

    async function save() {
      const name = nameInput.value.trim().replace(/\s+/g, ' ');
      if (!name) { nameInput.focus(); toast('Give the exercise a name'); return; }
      const clash = (await listExercises()).find((e) => e.id !== draft.id && e.name.toLowerCase() === name.toLowerCase());
      if (clash) { toast(`“${clash.name}” already exists`); return; }
      const saved = await saveExercise({ ...draft, name, muscle: muscleSelect.value, unit: draft.kind === 'weight' ? draft.unit : null });
      finish(saved);
    }

    async function remove() {
      const used = await routinesUsing(draft.id);
      const ok = await confirmAction({
        title: `Delete “${draft.name}”?`,
        message: used.length
          ? `It will also be removed from: ${used.map((r) => r.name).join(', ')}.`
          : 'This can’t be undone.',
        okLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await deleteExercise(draft.id);
      finish('deleted');
    }

    const body = h('div', {},
      field('Name', nameInput),
      field('Muscle group', muscleSelect),
      kindField,
      unitField,
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, isNew ? 'Create' : 'Save')),
      !isNew && h('button', { type: 'button', class: 'btn btn-ghost-danger btn-block', onclick: remove }, 'Delete exercise'),
    );
    const sheet = openSheet(isNew ? 'New exercise' : 'Edit exercise', body, { onClose: () => finish(null) });
    if (isNew) setTimeout(() => nameInput.focus(), 50);
  });
}
