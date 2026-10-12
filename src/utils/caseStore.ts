/**
 * Case persistence, in IndexedDB.
 *
 * localStorage caps out around 5 MB per origin and stores strings, so a single
 * --full scan of a real volume would not fit. IndexedDB stores structured
 * objects with a quota measured in a share of free disk. Everything stays in
 * this browser profile — nothing is uploaded, as before.
 *
 * The database name carries the schema version, so a schema bump starts from
 * an empty store rather than resurrecting cases this build cannot render.
 */

import { CaseFile, SCHEMA_VERSION } from '../types';

const DB_NAME = `forensica-v${SCHEMA_VERSION}`;
const STORE = 'cases';
/** Where cases lived before IndexedDB; migrated once, then removed. */
const LEGACY_KEY = `forensica-cases-v${SCHEMA_VERSION}`;

const isCase = (value: unknown): value is CaseFile =>
  typeof value === 'object' &&
  value !== null &&
  (value as CaseFile).schemaVersion === SCHEMA_VERSION &&
  typeof (value as CaseFile).scan?.caseId === 'string';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser'));
        return;
      }
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore(STORE, { keyPath: 'scan.caseId' });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('the case database is open in another tab'));
    });
    // A failed open should be retried next time rather than cached forever.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
};

/** Moves cases saved by earlier builds out of localStorage. */
const migrateLegacy = async (db: IDBDatabase): Promise<void> => {
  let legacy: unknown;
  try {
    const stored = localStorage.getItem(LEGACY_KEY);
    if (!stored) return;
    legacy = JSON.parse(stored);
  } catch {
    return;
  }

  if (Array.isArray(legacy)) {
    const tx = db.transaction(STORE, 'readwrite');
    legacy.filter(isCase).forEach((caseFile) => tx.objectStore(STORE).put(caseFile));
    await transactionDone(tx);
  }

  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Harmless: the copy in IndexedDB is now authoritative.
  }
};

export const loadCases = async (): Promise<CaseFile[]> => {
  const db = await openDb();
  await migrateLegacy(db);
  const all = await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  return all.filter(isCase);
};

export const saveCase = async (caseFile: CaseFile): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(caseFile);
  await transactionDone(tx);
};

export const deleteCase = async (caseId: string): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(caseId);
  await transactionDone(tx);
};
