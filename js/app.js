/**
 * app.js — entry point and router.
 *
 * "Routing" here means: look at the part of the URL after # (the hash), pick
 * the matching screen, and draw it into <main id="view">. Clicking a link like
 * <a href="#/routines"> changes the hash, which fires 'hashchange', which
 * redraws. Hash routing needs no server config, which suits GitHub Pages.
 */
import { loadSettings, getActiveWorkout } from './store.js';
import { h, icon } from './ui.js';
import { formatClock } from './workout.js';
import { seedIfNeeded, applyPlanUpdates } from './seed.js';
import { loadTheme } from './theme.js';
import * as home from './views/home.js';
import * as routines from './views/routines.js';
import * as exercises from './views/exercises.js';
import * as settings from './views/settings.js';
import * as workout from './views/workout.js';
import * as historyView from './views/history.js';
import * as exerciseDetail from './views/exercise-detail.js';
import * as bodyweight from './views/bodyweight.js';
import * as workoutEdit from './views/workout-edit.js';
import * as calendar from './views/calendar.js';

// [pattern, render function, which tab to highlight]
const routes = [
  [/^#\/home$/, home.render, 'home'],
  [/^#\/routines$/, routines.renderList, 'routines'],
  [/^#\/routine\/([\w-]+)$/, routines.renderEditor, 'routines'],
  [/^#\/exercises$/, exercises.renderLibrary, 'exercises'],
  [/^#\/settings$/, settings.render, 'settings'],
  [/^#\/workout$/, workout.render, 'workout'],
  [/^#\/history$/, historyView.renderList, 'history'],
  [/^#\/history\/([\w-]+)$/, historyView.renderDetail, 'history'],
  [/^#\/history\/([\w-]+)\/edit$/, workoutEdit.render, 'history'],
  [/^#\/bodyweight$/, bodyweight.render, 'history'],
  [/^#\/calendar$/, calendar.render, 'history'],
  [/^#\/exercise\/([\w-]+)$/, exerciseDetail.render, 'exercises'],
];

const view = document.getElementById('view');

async function route() {
  const hash = location.hash || '#/home';
  const match = routes.find(([re]) => re.test(hash));
  if (!match) { location.hash = '#/home'; return; }
  const [re, render, tab] = match;
  const params = hash.match(re).slice(1); // e.g. the routine id from #/routine/abc

  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  document.body.classList.toggle('in-workout', tab === 'workout'); // CSS hides the tab bar during a workout
  window.scrollTo(0, 0);
  await render(view, ...params);
  await updateResumeBar(tab);
}

/**
 * While a workout is in progress and you're on another screen, show a bar
 * above the tabs that takes you back to it.
 */
let resumeBar = null;
let resumeTimer = null;
async function updateResumeBar(tab) {
  const active = tab === 'workout' ? null : await getActiveWorkout();
  clearInterval(resumeTimer);
  resumeBar?.remove();
  resumeBar = null;
  document.body.classList.toggle('has-resume', !!active);
  if (!active) return;
  const clock = h('span', { class: 'resume-clock' }, formatClock(Date.now() - active.startedAt));
  resumeTimer = setInterval(() => { clock.textContent = formatClock(Date.now() - active.startedAt); }, 1000);
  resumeBar = h('a', { class: 'resume-bar', href: '#/workout' },
    h('span', { class: 'pulse' }),
    h('span', { class: 'resume-name' }, active.routineName),
    clock,
    h('span', { class: 'resume-cta' }, 'Resume', icon('chevron')));
  document.body.append(resumeBar);
}

/**
 * Offline support: register the service worker (sw.js).
 *
 * Skipped on "localhost" so that while you're editing code you always see your
 * latest files. To test offline behaviour on your computer, open
 * http://127.0.0.1:5173 instead — same server, but the service worker runs.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost') return;

  // True only after you tap "Reload" on the update bar. The first time the app
  // is ever opened, the service worker also takes control of the page; that
  // must NOT trigger a reload, so we only reload when an update was requested.
  let updateRequested = false;

  navigator.serviceWorker.register('sw.js').then((reg) => {
    // A new version has finished downloading and is waiting -> offer to switch.
    const offer = (worker) => showUpdateBar(() => {
      updateRequested = true;
      worker.postMessage('SKIP_WAITING');
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    // Check for updates whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }); // fails offline; that's fine
  }).catch((err) => console.warn('Service worker registration failed', err));

  // Once the new version takes over, reload once to run its files.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });
}

function showUpdateBar(apply) {
  if (document.querySelector('.update-bar')) return;
  document.body.append(h('div', { class: 'update-bar', role: 'status' },
    h('span', {}, 'A new version of Setline is ready'),
    h('button', { class: 'btn btn-small btn-primary', onclick: apply }, 'Reload')));
}

async function init() {
  await seedIfNeeded();     // first launch on this device: load the starting plan
  await applyPlanUpdates(); // plan changed since this device was set up: apply once
  await loadSettings();
  await loadTheme();        // accent colour + background from Settings
  window.addEventListener('hashchange', route);
  await route();
  registerServiceWorker();
  // Ask the browser not to clear our data when the phone is low on storage.
  navigator.storage?.persist?.().catch(() => {});
}

init().catch((err) => {
  console.error(err);
  view.textContent = 'Something went wrong starting the app: ' + err.message;
});
