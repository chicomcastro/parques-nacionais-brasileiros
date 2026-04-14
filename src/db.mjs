const DB_NAME = "parques-passaporte";
const DB_VERSION = 1;
const STORE = "visits";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "parkId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore(mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => { db.close(); resolve(result._result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      // For requests, capture the result when it's available
      if (result instanceof IDBRequest) {
        result.onsuccess = () => { result._result = result.result; };
        result._result = undefined;
      }
    });
  });
}

export function getVisit(parkId) {
  return withStore("readonly", store => store.get(parkId));
}

export function saveVisit(parkId, { date, notes, photos }) {
  return withStore("readwrite", store =>
    store.put({ parkId, date, notes: notes || "", photos: photos || [] })
  );
}

export function deleteVisit(parkId) {
  return withStore("readwrite", store => store.delete(parkId));
}

export function getAllVisits() {
  return withStore("readonly", store => store.getAll());
}
