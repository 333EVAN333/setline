/**
 * stats.js — numbers derived from workout history. Pure functions: data in,
 * numbers out, no database or DOM, which makes them easy to reason about.
 *
 * Warm-up sets are excluded from everything here (volume, best set, PRs).
 */
import { isWorkingSet } from './sets.js';

/**
 * Estimated one-rep max (Epley formula): weight × (1 + reps / 30).
 * A single rep is its own 1RM. Weights are in kg like everything stored.
 */
export function e1rm(kg, reps) {
  if (!kg || !reps) return 0;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

/** Totals for one finished workout. */
export function summarizeWorkout(w) {
  let sets = 0;
  let volume = 0;
  for (const x of w.exercises) {
    for (const s of x.sets) {
      sets += 1;
      if (isWorkingSet(s) && s.weight && s.reps) volume += s.weight * s.reps;
    }
  }
  return { sets, volume, duration: w.finishedAt - w.startedAt, exercises: w.exercises.length };
}

/** Metrics for one exercise within one workout. */
function sessionMetrics(workout, entry) {
  const working = entry.sets.filter(isWorkingSet);
  let best = null; // the set with the highest estimated 1RM
  let heaviest = 0;
  let mostReps = 0;
  let longest = 0;
  let volume = 0;
  for (const s of working) {
    const est = e1rm(s.weight, s.reps);
    if (est && (!best || est > best.e1rm)) best = { ...s, e1rm: est };
    heaviest = Math.max(heaviest, s.weight || 0);
    mostReps = Math.max(mostReps, s.reps || 0);
    longest = Math.max(longest, s.time || 0);
    if (s.weight && s.reps) volume += s.weight * s.reps;
  }
  return {
    workoutId: workout.id,
    date: workout.startedAt,
    routineName: workout.routineName,
    sets: entry.sets,
    best,
    e1rm: best?.e1rm ?? 0,
    heaviest,
    mostReps,
    longest,
    volume,
    prs: [],
  };
}

/**
 * Every session of one exercise, newest first, plus all-time records.
 * Each session's `prs` lists the records it set at the time (e.g. ['e1rm']),
 * so history can show a PR badge where you actually broke one.
 */
export function exerciseHistory(exerciseId, workouts) {
  const sessions = [];
  for (const w of workouts) {
    for (const x of w.exercises) {
      if (x.exerciseId === exerciseId) sessions.push(sessionMetrics(w, x));
    }
  }

  // Walk oldest -> newest, keeping the best-so-far for each record.
  const records = { e1rm: 0, heaviest: 0, mostReps: 0, longest: 0, bestSet: null };
  for (const s of [...sessions].reverse()) {
    for (const key of ['e1rm', 'heaviest', 'mostReps', 'longest']) {
      if (s[key] > records[key]) {
        if (records[key] > 0) s.prs.push(key); // the first session sets a baseline, not a PR
        records[key] = s[key];
        if (key === 'e1rm') records.bestSet = s.best;
      }
    }
  }
  return { sessions, records };
}
