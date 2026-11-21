import { t as tt } from "../i18n";
/** Where demo-mode photos live. The browser uses IndexedDB (persistent, far larger than localStorage); tests use a Map. */
export interface ImageStore {
  put(path: string, blob: Blob): Promise<void>;
  get(path: string): Promise<Blob | null>;
}

export const memoryImageStore = (): ImageStore => {
  const m = new Map<string, Blob>();
  return { put: async (p, b) => void m.set(p, b), get: async (p) => m.get(p) ?? null };
};

const DB = "dayview-images";
const STORE = "images";
export const indexedDbImageStore = (): ImageStore => {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error(tt("This browser can’t store photos on this device.")));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error(tt("Couldn’t open photo storage.")));
    });
  const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => (db.close(), resolve(req.result));
      tx.onerror = () => (db.close(), reject(tx.error ?? new Error(tt("Couldn’t save the photo."))));
      tx.onabort = () => (db.close(), reject(tx.error ?? new Error(tt("Couldn’t save the photo (storage may be full)."))));
    });
  };
  return {
    put: async (path, blob) => void (await run("readwrite", (s) => s.put(blob, path))),
    get: async (path) => ((await run("readonly", (s) => s.get(path))) as Blob | undefined) ?? null,
  };
};
