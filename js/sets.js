/**
 * sets.js — small helpers about sets: types, labels, and parsing user input.
 * Shared by the routine editor and the live workout screen.
 */
import { formatWeight } from './units.js';

export const SET_TYPES = {
  warmup: { label: 'Warm-up', badge: 'W' },
  normal: { label: 'Normal', badge: null }, // shows its number instead of a letter
  failure: { label: 'Failure', badge: 'F' },
  drop: { label: 'Drop set', badge: 'D' },
};

/** Options for the "tap the set number" menu (used with chooseAction). */
export function setTypeChoices(currentType) {
  return [
    ...Object.entries(SET_TYPES).map(([type, t]) => ({
      label: t.label, value: type, active: currentType === type,
      badge: t.badge ?? '1', badgeClass: `type-${type}`,
    })),
    { label: 'Remove set', value: 'remove', danger: true },
  ];
}

/** Short text for a set, e.g. "225 × 8", "× 12" (no weight) or "1:30". */
export function formatSetSummary(set, unit, timed) {
  if (!set) return '';
  if (timed) return set.time != null ? formatDuration(set.time) : '';
  const w = set.weight > 0 ? formatWeight(set.weight, unit) : ''; // 0 = bodyweight, e.g. "× 12"
  if (set.reps == null) return w;
  return w ? `${w} × ${set.reps}` : `× ${set.reps}`;
}

/** Warm-up sets never count toward volume or PRs. */
export const isWorkingSet = (set) => set.type !== 'warmup';

/** A fresh set, optionally copying weight/reps/time from another set. */
export function newSet(from = null) {
  return { type: 'normal', weight: from?.weight ?? null, reps: from?.reps ?? null, time: from?.time ?? null };
}

/**
 * What to show in the SET column: warm-ups show "W", working sets are
 * numbered 1, 2, 3… and failure/drop sets show "F"/"D" in their slot.
 * e.g. [warmup, normal, normal, failure] -> ['W', '1', '2', 'F']
 */
export function setLabels(sets) {
  let n = 0;
  return sets.map((s) => {
    if (s.type === 'warmup') return 'W';
    n += 1;
    return SET_TYPES[s.type]?.badge ?? String(n);
  });
}

/**
 * Parse a rep target typed by the user: "8" -> {min:8,max:8}, "6-8" / "6–8" / "6 to 8" -> {min:6,max:8}.
 * Returns null for empty input and undefined if it can't be understood.
 */
export function parseRepTarget(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3})(?:\s*(?:-|–|—|to)\s*(\d{1,3}))?$/i);
  if (!m) return undefined;
  let min = Number(m[1]);
  let max = m[2] ? Number(m[2]) : min;
  if (min > max) [min, max] = [max, min];
  if (max === 0) return undefined;
  return { min, max };
}
export function formatRepTarget(rt) {
  if (!rt) return '';
  return rt.min === rt.max ? String(rt.min) : `${rt.min}–${rt.max}`;
}

/** Parse "45" (seconds) or "1:30" (m:ss). null if empty, NaN if invalid. */
export function parseDuration(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(?:(\d{1,3}):)?(\d{1,4})$/);
  if (!m) return NaN;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}
/** 90 -> "1:30" */
export function formatDuration(sec) {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Parse a decimal number ("62,5" works too). null if empty, NaN if invalid or negative. */
export function parseNumber(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
