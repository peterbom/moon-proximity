import { dotProduct3, getMagnitude, normalize, subtractVectors } from "./common/vectors";
import { EarthMoonPositions, Ephemeris } from "./ephemeris";
import { getAstronomicalTime } from "./time";

export function getEarthMoonPositions(ephemeris: Ephemeris, unixTime: number): EarthMoonPositions {
  const date = new Date(unixTime);
  const time = getAstronomicalTime(date);
  const earthMoonBarycenterPosition = ephemeris.getEarthMoonBarycenterPosition(time);
  return ephemeris.getEarthAndMoonPositions(earthMoonBarycenterPosition, time);
}

export function getDistance(positions: EarthMoonPositions): number {
  return getMagnitude(subtractVectors(positions.moonPosition, positions.earthPosition));
}

export function getCosAngleFromFullMoon(positions: EarthMoonPositions): number {
  const earthToMoon = normalize(subtractVectors(positions.moonPosition, positions.earthPosition));
  const ssbToEarth = normalize(positions.earthPosition);
  return dotProduct3(earthToMoon, ssbToEarth);
}

export function getAngleFromFullMoon(positions: EarthMoonPositions): number {
  return Math.acos(getCosAngleFromFullMoon(positions));
}
