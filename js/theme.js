/**
 * theme.js — accent colour and background (Settings → Appearance).
 *
 * A theme is just two attributes on <html>: data-accent and data-bg. The CSS
 * (bottom of css/app.css) swaps its colour variables based on them.
 *
 * The choice is saved twice:
 *   - in IndexedDB settings, so it's part of your backups;
 *   - in localStorage, which a tiny script in index.html reads before the
 *     page draws, so the app never flashes the default colour on launch.
 */
import { getSetting, setSetting } from './store.js';

export const ACCENTS = [
  { id: 'lime', label: 'Lime', color: '#c6f24e', ink: '#11150a' },
  { id: 'mint', label: 'Mint', color: '#3ee0a1', ink: '#032116' },
  { id: 'sky', label: 'Sky', color: '#5cb8ff', ink: '#04182b' },
  { id: 'orange', label: 'Ember', color: '#ff8f4d', ink: '#2a1204' },
  { id: 'pink', label: 'Pink', color: '#ff6fb5', ink: '#2b0717' },
  { id: 'mono', label: 'Mono', color: '#e9eaec', ink: '#111214' },
];

export const BACKGROUNDS = [
  { id: 'dark', label: 'Dark', color: '#0d0e10' },
  { id: 'black', label: 'Black', color: '#000000' }, // true black: saves battery on OLED phones
  { id: 'slate', label: 'Slate', color: '#11151c' },
];

const DEFAULT = { accent: 'lime', bg: 'dark' };
const LOCAL_KEY = 'setline-theme';

/** Put a theme on the page right now. */
export function applyTheme(theme) {
  const t = { ...DEFAULT, ...theme };
  const root = document.documentElement;
  if (t.accent === DEFAULT.accent) delete root.dataset.accent; else root.dataset.accent = t.accent;
  if (t.bg === DEFAULT.bg) delete root.dataset.bg; else root.dataset.bg = t.bg;
  // The phone's status bar / browser chrome colour.
  const bg = BACKGROUNDS.find((b) => b.id === t.bg)?.color ?? BACKGROUNDS[0].color;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(t)); } catch { /* private mode etc.: fine */ }
  return t;
}

export const getTheme = async () => ({ ...DEFAULT, ...(await getSetting('theme', {})) });

/** Load the saved theme at startup (also picks up a theme restored from a backup). */
export async function loadTheme() {
  return applyTheme(await getTheme());
}

/** Change one part of the theme, e.g. setTheme({ accent: 'sky' }). */
export async function setTheme(patch) {
  const t = applyTheme({ ...(await getTheme()), ...patch });
  await setSetting('theme', t);
  return t;
}
