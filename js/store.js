/**
 * store.js — the app's data layer.
 *
 * Views never talk to IndexedDB directly; they call these functions instead.
 * That keeps the "shape" of the data in one place.
 *
 * Data shapes
 * -----------
 * Exercise: { id, name, muscle, kind: 'weight' | 'time', unit: null | 'lbs' | 'kg', createdAt }
 *   - unit null = follow the global setting.
 *
 * Routine:  { id, name, order, exercises: [RoutineExercise], createdAt, updatedAt }
 * RoutineExercise: { id, exerciseId, repTarget: null | {min, max}, sets: [Set] }
 * Set:      { type: 'warmup'|'normal'|'failure'|'drop', weight: kg|null, reps: n|null, time: seconds|null }
 *   - Weights are ALWAYS stored in kilograms and converted for display (see units.js).
 *
 * Settings (key/value): 'unit' -> 'lbs'|'kg', 'schedule' -> { mon: routineId|null, ... }
 */
import { db, uid } from './db.js';

export const DAYS = [
  { key: 'mon', short: 'Mon', long: 'Monday' },
  { key: 'tue', short: 'Tue', long: 'Tuesday' },
  { key: 'wed', short: 'Wed', long: 'Wednesday' },
  { key: 'thu', short: 'Thu', long: 'Thursday' },
  { key: 'fri', short: 'Fri', long: 'Friday' },
  { key: 'sat', short: 'Sat', long: 'Saturday' },
  { key: 'sun', short: 'Sun', long: 'Sunday' },
];

/** JS weeks start on Sunday (getDay() === 0); ours start on Monday. */
export function dayKeyFor(date = new Date()) {
  return DAYS[(date.getDay() + 6) % 7].key;
}

export const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Full body', 'Cardio', 'Other',
];

const emptySchedule = () => Object.fromEntries(DAYS.map((d) => [d.key, null]));

/**
 * In-memory copy of settings, loaded once at startup, so views can read
 * `state.unit` synchronously instead of awaiting the DB every time.
 */
export const state = { unit: 'lbs', schedule: emptySchedule() };

/* ---------- settings ---------- */

export async function getSetting(key, fallback) {
  const row = await db.get('settings', key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  await db.put('settings', { key, value });
}
export async function loadSettings() {
  state.unit = await getSetting('unit', 'lbs');
  state.schedule = { ...emptySchedule(), ...(await getSetting('schedule', {})) };
}
export async function setUnit(unit) {
  state.unit = unit;
  await setSetting('unit', unit);
}
export async function setScheduleDay(dayKey, routineId) {
  state.schedule[dayKey] = routineId;
  await setSetting('schedule', state.schedule);
}

/* ---------- routines ---------- */

export async function listRoutines() {
  const all = await db.getAll('routines');
  return all.sort((a, b) => a.order - b.order);
}
export const getRoutine = (id) => db.get('routines', id);

export async function saveRoutine(routine) {
  routine.updatedAt = Date.now();
  await db.put('routines', routine);
}

export async function createRoutine(name) {
  const all = await listRoutines();
  const routine = {
    id: uid(),
    name,
    order: all.length ? all[all.length - 1].order + 1 : 0, // add to the end
    exercises: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put('routines', routine);
  return routine;
}

/** Delete a routine and clear any weekdays it was scheduled on. */
export async function deleteRoutine(id) {
  await db.delete('routines', id);
  let changed = false;
  for (const d of DAYS) {
    if (state.schedule[d.key] === id) { state.schedule[d.key] = null; changed = true; }
  }
  if (changed) await setSetting('schedule', state.schedule);
}

/** Move a routine up (dir = -1) or down (dir = +1) in the list. */
export async function moveRoutine(id, dir) {
  const all = await listRoutines();
  const i = all.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  all.forEach((r, k) => { r.order = k; }); // renumber 0..n-1
  await db.putMany('routines', all);
}

/* ---------- workouts ---------- */
/*
 * Finished workout (in the 'workouts' store):
 *   { id, routineId, routineName, startedAt, finishedAt,
 *     exercises: [{ exerciseId, name, sets: [{ type, weight, reps, time }] }] }
 *   Only sets you checked off are kept. `name` is a snapshot so history still
 *   reads correctly if the exercise is later renamed or deleted.
 *
 * The workout in progress lives in settings under 'activeWorkout', so it
 * survives closing the app or the phone killing the tab mid-session.
 */

export async function listWorkouts() {
  const all = await db.getAll('workouts');
  return all.sort((a, b) => b.startedAt - a.startedAt); // newest first
}
export const saveWorkout = (w) => db.put('workouts', w);
export const getWorkout = (id) => db.get('workouts', id);
export const deleteWorkout = (id) => db.delete('workouts', id);

/**
 * For every exercise, the sets from the most recent workout that included it.
 * Map<exerciseId, { date, sets }>. Powers both PREVIOUS and auto-fill.
 */
export async function lastSessions() {
  const map = new Map();
  for (const w of await listWorkouts()) {
    for (const x of w.exercises) {
      if (!map.has(x.exerciseId)) map.set(x.exerciseId, { date: w.startedAt, sets: x.sets });
    }
  }
  return map;
}

export const getActiveWorkout = () => getSetting('activeWorkout', null);
export const saveActiveWorkout = (w) => setSetting('activeWorkout', w);
export const clearActiveWorkout = () => db.delete('settings', 'activeWorkout');

/* ---------- body weight ---------- */
/*
 * Entry: { id, date: 'YYYY-MM-DD', weight: kg }. The id IS the date, so logging
 * twice on the same day simply replaces that day's entry.
 */
export async function listBodyweight() {
  const all = await db.getAll('bodyweight');
  return all.sort((a, b) => b.date.localeCompare(a.date)); // newest first
}
export const saveBodyweight = (date, kg) => db.put('bodyweight', { id: date, date, weight: kg });
export const deleteBodyweight = (id) => db.delete('bodyweight', id);

/* ---------- exercises ---------- */

export async function listExercises() {
  const all = await db.getAll('exercises');
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
export async function exerciseMap() {
  return new Map((await db.getAll('exercises')).map((e) => [e.id, e]));
}
export async function saveExercise(ex) {
  if (!ex.id) { ex.id = uid(); ex.createdAt = Date.now(); }
  await db.put('exercises', ex);
  return ex;
}
export async function routinesUsing(exerciseId) {
  return (await listRoutines()).filter((r) => r.exercises.some((x) => x.exerciseId === exerciseId));
}
/** Delete an exercise and remove it from every routine that used it. */
export async function deleteExercise(id) {
  for (const r of await routinesUsing(id)) {
    r.exercises = r.exercises.filter((x) => x.exerciseId !== id);
    await saveRoutine(r);
  }
  await db.delete('exercises', id);
}
