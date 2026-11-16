/**
 * views/settings.js — global preferences, backup & restore, storage info.
 */
import { h, mount, pageHead, segmented, toast } from '../ui.js';
import { state, setUnit, getSetting } from '../store.js';
import { exportBackup, importBackup, REMIND_AFTER_DAYS } from '../backup.js';
import { fmtDate } from '../format.js';

export async function render(root) {
  const lastExport = await getSetting('lastExport', null);
  const daysAgo = lastExport ? Math.floor((Date.now() - lastExport) / 86400000) : null;
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const lastText = lastExport == null
    ? 'Never backed up'
    : `Last backup: ${fmtDate(lastExport, { month: 'short', day: 'numeric', year: 'numeric' })} (${daysAgo === 0 ? 'today' : `${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`})`;

  mount(root,
    pageHead('Settings'),

    h('h2', { class: 'section-title' }, 'Units'),
    h('section', { class: 'card pad' },
      h('p', { class: 'muted small' }, 'Default unit for weights. Individual exercises can override it in the Exercises tab.'),
      segmented([
        { value: 'lbs', label: 'Pounds (lbs)' },
        { value: 'kg', label: 'Kilograms (kg)' },
      ], state.unit, async (v) => { await setUnit(v); toast(`Weights now shown in ${v}`); })),

    h('h2', { class: 'section-title' }, 'Backup'),
    h('section', { class: 'card pad' },
      h('p', { class: `backup-status${daysAgo == null || daysAgo >= REMIND_AFTER_DAYS ? ' due' : ''}` }, lastText),
      h('p', { class: 'muted small' },
        'Your data lives only on this device. Export a backup file and keep it somewhere safe (Files, iCloud, Google Drive, email). ',
        `You’ll get a reminder after ${REMIND_AFTER_DAYS} days.`),
      h('div', { class: 'backup-actions' },
        h('button', { class: 'btn btn-primary', onclick: async () => { if (await exportBackup()) render(root); } }, 'Export backup'),
        h('button', { class: 'btn', onclick: async () => { if (await importBackup()) location.hash = '#/home'; } }, 'Import…'))),

    h('h2', { class: 'section-title' }, 'This device'),
    h('section', { class: 'card list' },
      infoRow('Installed as an app', installed ? 'Yes' : 'No — use “Add to Home Screen”'),
      infoRow('Protected from automatic clean-up', persisted ? 'Yes' : 'Not guaranteed')),

    h('p', { class: 'footnote' }, 'Setline · your data stays on this device'),
  );
}

const infoRow = (label, value) => h('div', { class: 'info-row' }, h('span', {}, label), h('b', {}, value));
