/**
 * seed.js — your starting plan.
 *
 * Two jobs:
 *  1. seedIfNeeded(): the first time the app opens on a device with no data,
 *     create the routines, weekly schedule and exercise library below.
 *  2. Plan updates: when the default plan changes after you've already
 *     installed the app, PLAN_UPDATES applies the change once to existing
 *     devices, without touching your workout history.
 *
 * Weights below are written in lbs (null = bodyweight / not set yet) and
 * converted to kg when stored, like everything else in the app.
 */
import { db, uid } from './db.js';
import { displayToKg } from './units.js';
import {
  getSetting, setSetting, saveExercise, createRoutine, saveRoutine, setScheduleDay, listExercises, listRoutines,
} from './store.js';

/** One planned set: weight in lbs (null = bodyweight or unknown) × reps. */
const set = (lbs, reps) => ({ type: 'normal', weight: displayToKg(lbs, 'lbs'), reps, time: null });
/** `count` identical sets. */
const sets = (count, lbs, reps) => Array.from({ length: count }, () => set(lbs, reps));

/*
 * Weekly plan. Each exercise: [name, muscle group, planned sets, rep target].
 * Muscle groups must match MUSCLE_GROUPS in store.js.
 */
const PLAN = [
  {
    day: 'mon',
    name: 'Legs + Abs',
    exercises: [
      ['45° leg press', 'Quads', [set(360, 8), set(360, 7), set(360, 6)], 8],
      ['Leg extension', 'Quads', [set(185, 8), set(170, 8), set(170, 8)], 8],
      ['Seated hamstring curl', 'Hamstrings', sets(3, 160, 8), 8],
      ['Seated calf raise', 'Calves', sets(3, 100, 12), 12],
      ['Roman chair leg raise', 'Abs', sets(3, null, 15), 15],
      ['Cable crunch', 'Abs', sets(3, null, 12), 12], // weight not decided yet
    ],
  },
  {
    day: 'tue',
    name: 'Back + Biceps',
    exercises: [
      ['Wide-grip pull-up', 'Back', [set(null, 8), set(null, 8), set(null, 6)], 8],
      ['Chest-supported row machine', 'Back', sets(3, 145, 8), 8],
      ['Reverse pec deck fly', 'Shoulders', sets(3, 90, 8), 8],
      ['Iso-lateral low row', 'Back', sets(3, 90, 8), 8],
      ['Dumbbell preacher curl', 'Biceps', [set(27.5, 8), set(27.5, 7), set(27.5, 8)], 8],
      ['Bayesian cable curl', 'Biceps', sets(3, 30, 8), 8],
      ['Reverse-grip barbell curl', 'Biceps', [set(50, 8), set(50, 6), set(50, 6)], 8],
    ],
  },
  {
    day: 'wed',
    name: 'Chest + Triceps',
    exercises: [
      ['Flat barbell bench press', 'Chest', sets(3, null, 8), 8],
      ['Incline dumbbell press', 'Chest', sets(3, null, 8), 8],
      ['Pec deck fly', 'Chest', sets(3, null, 8), 8],
      ['High-to-low cable fly', 'Chest', sets(3, null, 8), 8],
      ['Dips', 'Triceps', sets(3, null, 8), 8],
      ['Skullcrusher', 'Triceps', sets(3, null, 8), 8],
      ['Triceps pressdown', 'Triceps', sets(3, null, 8), 8],
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

/*
 * Changes to the default plan, applied once to devices that already have it.
 *   renames:  old exercise name -> new name. The exercise keeps its id, so its
 *             history and charts carry over under the new name.
 *   routines: routines (by name) whose exercises & sets are replaced with the
 *             version in PLAN above.
 */
const PLAN_UPDATES = [
  {
    version: 2,
    renames: {
      'Quad extension': 'Leg extension',
      'Hamstring curl (seated)': 'Seated hamstring curl',
      'Weighted ab crunch': 'Cable crunch',
      'Unilateral reverse pec deck fly': 'Reverse pec deck fly',
    },
    routines: ['Legs + Abs', 'Back + Biceps'],
  },
];
const PLAN_VERSION = PLAN_UPDATES[PLAN_UPDATES.length - 1].version;

/* ---------- helpers ---------- */

/** Build a routine's exercise list from PLAN, reusing library exercises by name. */
async function buildRoutineExercises(planDay, byName) {
  const list = [];
  for (const [name, muscle, plannedSets, target] of planDay.exercises) {
    let ex = byName.get(name.toLowerCase());
    if (!ex) {
      ex = await saveExercise({ name, muscle, kind: 'weight', unit: null });
      byName.set(name.toLowerCase(), ex);
    }
    list.push({
      id: uid(),
      exerciseId: ex.id,
      repTarget: { min: target, max: target },
      sets: plannedSets.map((s) => ({ ...s })),
    });
  }
  return list;
}

async function exercisesByName() {
  return new Map((await listExercises()).map((e) => [e.name.toLowerCase(), e]));
}

/* ---------- first launch ---------- */

/** Load the plan if this device has never been seeded and has no data. */
export async function seedIfNeeded() {
  if (await getSetting('seeded', false)) return false;
  const [exercises, routines] = await Promise.all([db.getAll('exercises'), db.getAll('routines')]);
  if (exercises.length || routines.length) {
    await setSetting('seeded', true); // existing data (e.g. restored backup): never seed on top of it
    return false;
  }

  const byName = new Map();
  for (const day of PLAN) {
    const routine = await createRoutine(day.name);
    routine.exercises = await buildRoutineExercises(day, byName);
    await saveRoutine(routine);
    await setScheduleDay(day.day, routine.id);
  }
  for (const [name, muscle] of EXTRA_EXERCISES) {
    if (!byName.has(name.toLowerCase())) await saveExercise({ name, muscle, kind: 'weight', unit: null });
  }

  await setSetting('seeded', true);
  await setSetting('planVersion', PLAN_VERSION); // already the latest plan
  return true;
}

/* ---------- updates for existing devices ---------- */

/** Apply any PLAN_UPDATES this device hasn't had yet. Safe to call on every launch. */
export async function applyPlanUpdates() {
  if (!(await getSetting('seeded', false))) return;
  const current = await getSetting('planVersion', 1); // devices seeded before versioning = 1

  for (const update of PLAN_UPDATES) {
    if (update.version <= current) continue;

    // 1. Rename exercises in place (keeps history). Skip if the new name already exists.
    const byName = await exercisesByName();
    for (const [oldName, newName] of Object.entries(update.renames || {})) {
      const ex = byName.get(oldName.toLowerCase());
      if (ex && !byName.has(newName.toLowerCase())) {
        ex.name = newName;
        await saveExercise(ex);
        byName.delete(oldName.toLowerCase());
        byName.set(newName.toLowerCase(), ex);
      }
    }

    // 2. Replace the listed routines' exercises and sets with the plan's version.
    const routines = await listRoutines();
    for (const routineName of update.routines || []) {
      const routine = routines.find((r) => r.name === routineName);
      const planDay = PLAN.find((d) => d.name === routineName);
      if (!routine || !planDay) continue; // you deleted or renamed it: leave it alone
      routine.exercises = await buildRoutineExercises(planDay, byName);
      await saveRoutine(routine);
    }

    await setSetting('planVersion', update.version);
  }
}
