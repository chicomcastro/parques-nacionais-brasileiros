const DB_NAME = "parques-passaporte";
const DB_VERSION = 2;
const VISITS_STORE = "visits";
const ROUTES_STORE = "routes";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VISITS_STORE)) {
        db.createObjectStore(VISITS_STORE, { keyPath: "parkId" });
      }
      if (!db.objectStoreNames.contains(ROUTES_STORE)) {
        db.createObjectStore(ROUTES_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore(storeName, mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = fn(store);
      tx.oncomplete = () => { db.close(); resolve(result._result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      if (result instanceof IDBRequest) {
        result.onsuccess = () => { result._result = result.result; };
        result._result = undefined;
      }
    });
  });
}

// Visits
export function getVisit(parkId) {
  return withStore(VISITS_STORE, "readonly", s => s.get(parkId));
}
export function saveVisit(parkId, { date, notes, photos }) {
  return withStore(VISITS_STORE, "readwrite", s =>
    s.put({ parkId, date, notes: notes || "", photos: photos || [] })
  );
}
export function deleteVisit(parkId) {
  return withStore(VISITS_STORE, "readwrite", s => s.delete(parkId));
}
export function getAllVisits() {
  return withStore(VISITS_STORE, "readonly", s => s.getAll());
}

// Routes
export function saveRoute(route) {
  return withStore(ROUTES_STORE, "readwrite", s => s.put(route));
}
export function deleteRoute(id) {
  return withStore(ROUTES_STORE, "readwrite", s => s.delete(id));
}
export function getAllRoutes() {
  return withStore(ROUTES_STORE, "readonly", s => s.getAll());
}
