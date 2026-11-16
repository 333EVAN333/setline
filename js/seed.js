/**
 * seed.js — your starting plan, loaded automatically the first time the app
 * opens on a device with no data (e.g. right after installing on your phone).
 *
 * It runs only once per device: afterwards a 'seeded' flag is stored, so
 * deleting a routine never makes it come back. Restoring a backup also skips
 * it, because the device then already has data.
 *
 * To change the starting plan, edit PLAN / EXTRA_EXERCISES below.
 */
import { db, uid } from './db.js';
import { getSetting, setSetting, saveExercise, createRoutine, saveRoutine, setScheduleDay } from './store.js';

// Default for every planned exercise: 3 working sets × 8 reps, target 8.
// Weights are left empty — your first workout fills them in, and from then
// on auto-fill copies your last session (including a lighter/shorter last set).
const SETS = 3;
const REPS = 8;

/** Weekly plan. `muscle` must be one of MUSCLE_GROUPS in store.js. */
const PLAN = [
  {
    day: 'mon',
    name: 'Legs + Abs',
    exercises: [
      ['45° leg press', 'Quads'],
      ['Quad extension', 'Quads'],
      ['Hamstring curl (seated)', 'Hamstrings'],
      ['Seated calf raise', 'Calves'],
      ['Roman chair leg raise', 'Abs'],
      ['Weighted ab crunch', 'Abs'],
    ],
  },
  {
    day: 'tue',
    name: 'Back + Biceps',
    exercises: [
      ['Wide-grip pull-up', 'Back'],
      ['Chest-supported row machine', 'Back'],
      ['Unilateral reverse pec deck fly', 'Shoulders'],
      ['Dumbbell preacher curl', 'Biceps'],
      ['Bayesian cable curl', 'Biceps'],
      ['Reverse-grip barbell curl', 'Biceps'],
    ],
  },
  {
    day: 'wed',
    name: 'Chest + Triceps',
    exercises: [
      ['Flat barbell bench press', 'Chest'],
      ['Incline dumbbell press', 'Chest'],
      ['Pec deck fly', 'Chest'],
      ['High-to-low cable fly', 'Chest'],
      ['Dips', 'Triceps'],
      ['Skullcrusher', 'Triceps'],
      ['Triceps pressdown', 'Triceps'],
    ],
  },
  { day: 'fri', name: 'Lower', exercises: [] }, // fill in later
  { day: 'sat', name: 'Upper', exercises: [] }, // fill in later
  // Thursday and Sunday stay as Rest (the default).
];

/** In the library, but not in any routine (done occasionally). */
const EXTRA_EXERCISES = [
  ['Wide-grip lat pulldown', 'Back'],
  ['Seated cable row', 'Back'],
  ['Overhead cable triceps extension', 'Triceps'],
  ['Lying hamstring curl', 'Hamstrings'],
];

/** Load the plan if this device has never been seeded and has no data. */
export async function seedIfNeeded() {
  if (await getSetting('seeded', false)) return false;
  const [exercises, routines] = await Promise.all([db.getAll('exercises'), db.getAll('routines')]);
  if (exercises.length || routines.length) {
    await setSetting('seeded', true); // existing data (e.g. restored backup): never seed on top of it
    return false;
  }

  const addExercise = (name, muscle) => saveExercise({ name, muscle, kind: 'weight', unit: null });

  for (const day of PLAN) {
    const routine = await createRoutine(day.name);
    for (const [name, muscle] of day.exercises) {
      const ex = await addExercise(name, muscle);
      routine.exercises.push({
        id: uid(),
        exerciseId: ex.id,
        repTarget: { min: REPS, max: REPS },
        sets: Array.from({ length: SETS }, () => ({ type: 'normal', weight: null, reps: REPS, time: null })),
      });
    }
    await saveRoutine(routine);
    await setScheduleDay(day.day, routine.id);
  }
  for (const [name, muscle] of EXTRA_EXERCISES) await addExercise(name, muscle);

  await setSetting('seeded', true);
  return true;
}
