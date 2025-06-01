import type { SavedPoint } from "./state-types";

// Include site name in keys because origin may contain several sites.
const pointsKey = "moon-proximity-points";
const tldrKey = "moon-proximity-tldr";

export function savePoints(points: SavedPoint[]) {
  saveValue(pointsKey, points);
}

export function getSavedPoints(): SavedPoint[] {
  return getSavedValue(pointsKey, []);
}

export function saveTldr(tldr: boolean) {
  saveValue(tldrKey, tldr);
}

export function getSavedTldr(): boolean {
  return getSavedValue(tldrKey, false);
}

function saveValue<T>(key: string, serializableValue: T) {
  localStorage.setItem(key, JSON.stringify(serializableValue));
}

function getSavedValue<T>(key: string, fallbackValue: T): T {
  const json = localStorage.getItem(key);
  if (!json) {
    return fallbackValue;
  }

  try {
    return JSON.parse(json);
  } catch (e) {
    console.error(`Unable to parse stored value: ${json}`);
    return fallbackValue;
  }
}

export async function readEphemeris(db: IDBDatabase): Promise<Blob | null> {
  try {
    return await getBlob(db, "ephemeris");
  } catch (err) {
    return null;
  }
}

export async function storeEphemeris(db: IDBDatabase, blob: Blob): Promise<void> {
  try {
    await storeBlobAsBlob(db, "ephemeris", blob);
  } catch (err) {
    try {
      await storeBlobAsString(db, "ephemeris", blob);
    } catch (err) {
      console.error(`Failed to store ephemeris: ${err}`);
    }
  }
}

function getBlob(db: IDBDatabase, name: string): Promise<Blob> {
  const blobStore = db.transaction("blobs", "readwrite").objectStore("blobs");
  const request = blobStore.get(name);

  return new Promise((resolve, reject) => {
    request.onerror = (err) => reject(new Error(`Database error: ${request.error}\n${err}`));
    request.onsuccess = async () => {
      const result = request.result;
      if (typeof result === "string") {
        const fetchResponse = await fetch(result);
        resolve(await fetchResponse.blob());
      } else if (result instanceof Blob) {
        resolve(result);
      } else {
        reject(new Error(`Unexpected blob value type: ${result}`));
      }
    };
  });
}

function storeBlobAsBlob(db: IDBDatabase, name: string, blob: Blob): Promise<IDBValidKey> {
  const blobStore = db.transaction("blobs", "readwrite").objectStore("blobs");

  const request = blobStore.put(blob, name);

  return new Promise((resolve, reject) => {
    request.onerror = (err) => reject(new Error(`Database error: ${request.error}\n${err}`));
    request.onsuccess = () => resolve(request.result);
  });
}

function storeBlobAsString(db: IDBDatabase, name: string, blob: Blob): Promise<IDBValidKey> {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onerror = reject;
    reader.onload = () => {
      const blobStore = db.transaction("blobs", "readwrite").objectStore("blobs");
      const request = blobStore.put(reader.result, name);
      request.onerror = (err) => reject(new Error(`Database error: ${request.error}\n${err}`));
      request.onsuccess = () => resolve(request.result);
    };

    reader.readAsDataURL(blob);
  });
}

export async function getIndexedDb(): Promise<IDBDatabase | null> {
  try {
    const request = indexedDB.open("moon-proximity", 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("blobs");
    };

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = (err) => reject(new Error(`Database error: ${request.error}\n${err}`));
      request.onsuccess = () => resolve(request.result);
    });

    return db;
  } catch (err) {
    return null;
  }
}
