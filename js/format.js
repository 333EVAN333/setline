/**
 * format.js — turning numbers and dates into display text.
 */
import { kgToDisplay } from './units.js';

/** Total volume (stored in kg) as "4,605 lbs". */
export function formatVolume(kg, unit) {
  return `${Math.round(kgToDisplay(kg, unit) ?? 0).toLocaleString()} ${unit}`;
}

/** 2_520_000 ms -> "42m", 4_500_000 -> "1h 15m" */
export function formatDurationShort(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
}

export const fmtDate = (ms, opts) => new Date(ms).toLocaleDateString(undefined, opts);
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** "Mon, Nov 16" */
export const fmtDay = (ms) => fmtDate(ms, { weekday: 'short', month: 'short', day: 'numeric' });
/** "Nov 16" or "Nov 16, 2025" when not this year */
export function fmtShort(ms) {
  const sameYear = new Date(ms).getFullYear() === new Date().getFullYear();
  return fmtDate(ms, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Calendar dates (body weight) are stored as "YYYY-MM-DD" strings in local time,
 * so a 11pm entry never slides into the next day because of time zones.
 */
export function localISO(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
export function isoToMs(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
