/**
 * db.js — a tiny promise-based wrapper around IndexedDB.
 *
 * IndexedDB is a database built into every browser. Data lives on this device
 * only (no server), survives closing the app, and works offline.
 *
 * It is organised into "object stores" (think: tables). Each record is a plain
 * JS object, and `keyPath: 'id'` means the object's `id` field is its key.
 *
 * The raw IndexedDB API is event-based and verbose, so this file turns the few
 * operations we need into Promises we can `await`.
 */

const DB_NAME = 'setline';
const DB_VERSION = 1; // bump this when the store layout changes, then migrate in onupgradeneeded

let dbPromise = null;

/** Open (and on first run, create) the database. Cached so it only happens once. */
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs only when the DB is new or DB_VERSION went up: create the stores.
    // All stores for every stage are created now so no migration is needed later.
    req.onupgradeneeded = () => {
      const db = req.result;
      const ensure = (name, indexes = []) => {
        if (db.objectStoreNames.contains(name)) return;
        const store = db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
        indexes.forEach((field) => store.createIndex(field, field));
      };
      ensure('exercises');               // exercise library
      ensure('routines');                // gym-day templates
      ensure('workouts', ['startedAt']); // logged sessions (stage 2)
      ensure('bodyweight', ['date']);    // body weight entries (stage 3)
      ensure('settings');                // key/value pairs: unit, schedule, ...
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * Run one operation inside a transaction and resolve when it has committed.
 * `action` receives the object store and returns an IDBRequest (or nothing).
 */
async function run(storeName, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  put: (store, obj) => run(store, 'readwrite', (s) => s.put(obj)),
  delete: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
  /** Write many records in a single transaction (all succeed or none do). */
  putMany: (store, objs) => run(store, 'readwrite', (s) => { objs.forEach((o) => s.put(o)); }),
};

export const STORES = ['exercises', 'routines', 'workouts', 'bodyweight', 'settings'];

/**
 * Restore from a backup: wipe every store and write the backup's records,
 * all inside ONE transaction. If anything fails midway, IndexedDB rolls the
 * whole thing back, so you never end up with half old / half new data.
 * data: { exercises: [...], routines: [...], ... }
 */
export async function replaceAll(data) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      const store = tx.objectStore(name);
      store.clear();
      (data[name] || []).forEach((rec) => store.put(rec));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Random unique id for new records. */
export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
