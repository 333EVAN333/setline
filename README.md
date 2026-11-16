# Setline

A personal workout tracker that runs in the browser and installs to your phone's home screen.
Routines → live set logging → history and progress charts. Works offline. All data stays on
your device (IndexedDB). No accounts, no server.

## Run it on your computer

```bash
python tools/serve.py
```

Then open <http://localhost:5173>. Edit any file and reload the page to see the change.

- `localhost` skips the offline service worker so you always see fresh files.
- To test offline/install behaviour locally, open <http://127.0.0.1:5173> instead.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | The single page; loads the CSS and `js/app.js` |
| `css/app.css` | All styles (colours are variables at the top) |
| `js/app.js` | Router (`#/home`, `#/routines`…), resume bar, service-worker registration |
| `js/db.js` | Small promise wrapper around IndexedDB |
| `js/store.js` | Data layer — every record shape is documented at the top |
| `js/workout.js` | Workout logic: auto-fill, finishing, updating a routine |
| `js/stats.js` | Volume, estimated 1RM, personal records |
| `js/chart.js` | Dependency-free SVG line chart |
| `js/backup.js` | Export / import JSON backups, 14-day reminder |
| `js/views/*.js` | One file per screen |
| `sw.js` | Service worker: caches the app for offline use |
| `manifest.webmanifest`, `icons/` | What makes it installable |
| `tools/` | Dev helpers (local server, icon generator) — not used by the app |

## Publish on GitHub Pages (first time)

1. **Make a GitHub account** at <https://github.com/signup> (free).
2. **Create an empty repository.** Click **+** (top right) → **New repository**.
   - Name: `setline`
   - Visibility: **Public** (free GitHub Pages needs public. Only the *code* is public;
     your workout data never leaves your phone.)
   - Do **not** tick "Add a README" / .gitignore / license — leave it empty.
   - Click **Create repository** and copy the URL it shows, like
     `https://github.com/YOUR-USERNAME/setline.git`.
3. **Upload the code.** In a terminal in this folder:
   ```bash
   git init -b main
   git add .
   git commit -m "Setline: first version"
   git remote add origin https://github.com/YOUR-USERNAME/setline.git
   git push -u origin main
   ```
   The first push opens a browser window asking you to sign in to GitHub — approve it.
4. **Turn on Pages.** On the repository page: **Settings** → **Pages** (left sidebar).
   Under **Build and deployment** → **Source**: *Deploy from a branch*.
   Branch: **main**, folder **/ (root)** → **Save**.
5. **Wait ~1 minute**, refresh that Settings → Pages screen, and it shows your address:
   `https://YOUR-USERNAME.github.io/setline/`. That's your app's permanent URL.

## Install on your phone

- **iPhone:** open the URL in **Safari** → **Share** button → **Add to Home Screen** → Add.
  (It must be Safari; other iPhone browsers can't install web apps on older iOS versions.)
- **Android:** open the URL in **Chrome** → **⋮** menu → **Install app** (or *Add to Home screen*).

Open it from the home-screen icon from then on. Your data belongs to that installed app,
so log workouts there rather than in a browser tab.

## Publishing an update

1. Make your changes and test them locally.
2. Open `sw.js` and bump `VERSION` (e.g. `'v1'` → `'v2'`). This is how phones notice the update.
   If you added a new file, also add it to `APP_FILES` in `sw.js`.
3. Commit and push:
   ```bash
   git add .
   git commit -m "Describe what changed"
   git push
   ```
4. GitHub Pages republishes within a minute or two. Next time you open the app it downloads
   the new version and shows **"A new version of Setline is ready · Reload"**.

## Backups

Settings → **Export backup** saves a `setline-backup-YYYY-MM-DD.json` file (on a phone, the share
sheet opens — choose *Save to Files*, Drive, email…). **Import…** restores from such a file and
replaces everything on the device. The Today screen reminds you if it's been 14+ days.
