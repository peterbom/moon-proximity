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
