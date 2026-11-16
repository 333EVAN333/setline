/**
 * backup.js — Export (download a JSON backup) and Import (restore from one).
 *
 * Why this matters: your data lives only in this browser on this phone.
 * If the app is deleted or the phone is lost/reset, the backup file is the
 * only copy. Keep it somewhere safe (iCloud Drive, Google Drive, email it to
 * yourself...).
 *
 * File format:
 *   { app: 'setline', format: 1, exportedAt: <ms>, data: { exercises: [...], routines: [...],
 *     workouts: [...], bodyweight: [...], settings: [...] } }
 */
import { db, STORES, replaceAll } from './db.js';
import { getSetting, setSetting, loadSettings } from './store.js';
import { localISO, fmtDate } from './format.js';
import { confirmAction, toast } from './ui.js';

const FORMAT = 1;
export const REMIND_AFTER_DAYS = 14;

/* ---------- export ---------- */

export async function exportBackup() {
  const data = {};
  for (const name of STORES) data[name] = await db.getAll(name);
  // Backup bookkeeping isn't part of the data you'd want restored.
  data.settings = data.settings.filter((s) => !['lastExport', 'backupSnoozeUntil'].includes(s.key));

  const backup = { app: 'setline', format: FORMAT, exportedAt: Date.now(), data };
  const json = JSON.stringify(backup, null, 1);
  const filename = `setline-backup-${localISO()}.json`;
  const file = new File([json], filename, { type: 'application/json' });

  // On phones, the share sheet is the friendliest way to save a file
  // ("Save to Files", Drive, email...). On computers, a normal download.
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
    } catch (err) {
      if (err.name === 'AbortError') return false; // you closed the share sheet: not backed up
      throw err;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  await setSetting('lastExport', Date.now());
  toast('Backup saved');
  return true;
}

/* ---------- import ---------- */

/** Opens a file picker, checks the file, confirms, then replaces all data. */
export function importBackup() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { resolve(false); return; }
      try {
        const backup = JSON.parse(await file.text());
        validate(backup);
        const d = backup.data;
        const ok = await confirmAction({
          title: 'Replace all data?',
          message: `Backup from ${fmtDate(backup.exportedAt, { month: 'long', day: 'numeric', year: 'numeric' })}: `
            + `${d.workouts.length} workouts, ${d.routines.length} routines, ${d.exercises.length} exercises, `
            + `${d.bodyweight.length} body weight entries. Everything currently on this device will be replaced.`,
          okLabel: 'Replace',
          danger: true,
        });
        if (!ok) { resolve(false); return; }
        await replaceAll(d);
        await setSetting('lastExport', backup.exportedAt); // the restored data is exactly as safe as that file
        await loadSettings();
        toast('Backup restored');
        resolve(true);
      } catch (err) {
        console.error(err);
        toast(`Couldn’t import: ${err.message}`);
        resolve(false);
      }
    });
    input.click();
  });
}

/** Throw a readable error if the file isn't a Setline backup. */
function validate(backup) {
  if (backup?.app !== 'setline' || !backup.data) throw new Error('not a Setline backup file');
  if (backup.format > FORMAT) throw new Error('this backup is from a newer version of Setline');
  for (const name of STORES) {
    if (!Array.isArray(backup.data[name])) throw new Error(`backup is missing “${name}”`);
  }
}

/* ---------- reminder ---------- */

/**
 * Days since the last export, or null if a reminder isn't due.
 * Only nags once there's something worth saving (at least one workout),
 * and respects "Later" (snoozed for a day).
 */
export async function backupReminderDue() {
  const [last, snoozeUntil, workouts] = await Promise.all([
    getSetting('lastExport', null), getSetting('backupSnoozeUntil', 0), db.getAll('workouts'),
  ]);
  if (!workouts.length || Date.now() < snoozeUntil) return null;
  // Never exported: count from your first workout.
  const since = last ?? Math.min(...workouts.map((w) => w.startedAt));
  const days = Math.floor((Date.now() - since) / 86400000);
  return days >= REMIND_AFTER_DAYS ? { days, never: last == null } : null;
}

export const snoozeBackupReminder = () => setSetting('backupSnoozeUntil', Date.now() + 86400000);
