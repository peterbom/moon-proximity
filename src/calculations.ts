import { getMagnitude, subtractVectors } from "./common/vectors";
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
