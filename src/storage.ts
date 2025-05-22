import type { SavedPoint } from "./state-types";

// Include site name in keys because origin may contain several sites.
const pointsKey = "moon-proximity-points";

export function savePoints(points: SavedPoint[]) {
  localStorage.setItem(pointsKey, JSON.stringify(points));
}

export function getSavedPoints(): SavedPoint[] {
  const pointsJson = localStorage.getItem(pointsKey);
  if (!pointsJson) {
    return [];
  }

  try {
    return JSON.parse(pointsJson);
  } catch (e) {
    console.error(`Unable to parse stored points: ${pointsJson}`);
    return [];
  }
}
