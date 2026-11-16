/**
 * workout.js — the logic of a workout, kept apart from the screen that shows it.
 *
 * Workout in progress:
 *   { id, routineId, routineName, startedAt, structureChanged,
 *     exercises: [{ id, exerciseId, repTarget, sets: [{ type, weight, reps, time, done }] }] }
 *
 * `structureChanged` becomes true when you add/remove/reorder exercises or sets,
 * or change a set's type. On finish, that's what triggers "Update routine?".
 */
import { uid } from './db.js';
import {
  getActiveWorkout, saveActiveWorkout, clearActiveWorkout, lastSessions, saveWorkout,
  getRoutine, saveRoutine, exerciseMap,
} from './store.js';
import { newSet, isWorkingSet } from './sets.js';
import { chooseAction } from './ui.js';

/**
 * One exercise entry for a new workout.
 * AUTO-FILL: if you've done this exercise before, copy the sets (count, types,
 * weight, reps, time) from your last session. Otherwise use the routine's
 * planned sets, or 3 empty sets if there's no plan either.
 */
export function makeEntry(exerciseId, { repTarget = null, plannedSets = null } = {}, last = new Map()) {
  const previous = last.get(exerciseId);
  const source = previous?.sets?.length ? previous.sets : plannedSets?.length ? plannedSets : [newSet(), newSet(), newSet()];
  return {
    id: uid(),
    exerciseId,
    repTarget,
    sets: source.map((s) => ({ type: s.type, weight: s.weight, reps: s.reps, time: s.time, done: false })),
  };
}

/** Create the workout in progress from a routine and open the workout screen. */
export async function startWorkout(routine) {
  const active = await getActiveWorkout();
  if (active) {
    const choice = await chooseAction('A workout is already in progress', [
      { label: `Resume “${active.routineName}”`, value: 'resume' },
      { label: `Discard it and start “${routine.name}”`, value: 'replace', danger: true },
    ]);
    if (choice === 'resume') { location.hash = '#/workout'; return; }
    if (choice !== 'replace') return;
  }
  const last = await lastSessions();
  const workout = {
    id: uid(),
    routineId: routine.id,
    routineName: routine.name,
    startedAt: Date.now(),
    structureChanged: false,
    exercises: routine.exercises.map((rx) => makeEntry(rx.exerciseId, { repTarget: rx.repTarget, plannedSets: rx.sets }, last)),
  };
  await saveActiveWorkout(workout);
  location.hash = '#/workout';
}

/**
 * Numbers for the header. Volume = weight × reps of completed working sets
 * (warm-ups excluded), in kg.
 */
export function workoutStats(w, { onlyDone = true } = {}) {
  let sets = 0;
  let volume = 0;
  for (const x of w.exercises) {
    for (const s of x.sets) {
      if (onlyDone && !s.done) continue;
      sets += 1;
      if (isWorkingSet(s) && s.weight && s.reps) volume += s.weight * s.reps;
    }
  }
  return { sets, volume };
}

/** Count of sets not yet checked off. */
export const pendingSets = (w) => w.exercises.reduce((n, x) => n + x.sets.filter((s) => !s.done).length, 0);

/**
 * Save the finished workout to history (checked-off sets only) and clear the
 * in-progress one. Returns the saved record, or null if nothing was completed.
 */
export async function finishWorkout(w) {
  const exMap = await exerciseMap();
  const record = {
    id: w.id,
    routineId: w.routineId,
    routineName: w.routineName,
    startedAt: w.startedAt,
    finishedAt: Date.now(),
    exercises: w.exercises
      .map((x) => ({
        exerciseId: x.exerciseId,
        name: exMap.get(x.exerciseId)?.name ?? 'Deleted exercise',
        sets: x.sets.filter((s) => s.done).map(({ type, weight, reps, time }) => ({ type, weight, reps, time })),
      }))
      .filter((x) => x.sets.length),
  };
  if (!record.exercises.length) return null;
  await saveWorkout(record);
  await clearActiveWorkout();
  return record;
}

/**
 * Copy the workout's layout back into its routine: exercise order, set count,
 * set types, and the values you used (so next time's plan matches today).
 */
export async function updateRoutineFromWorkout(w) {
  const routine = await getRoutine(w.routineId);
  if (!routine) return false;
  routine.exercises = w.exercises.map((x) => ({
    id: uid(),
    exerciseId: x.exerciseId,
    repTarget: x.repTarget,
    sets: x.sets.map(({ type, weight, reps, time }) => ({ type, weight, reps, time })),
  }));
  await saveRoutine(routine);
  return true;
}

/** 754000 ms -> "12:34", 3_725_000 -> "1:02:05" */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
