import { Vector2, Vector3 } from "./common/numeric-types";
import { dotProduct3, getMagnitude, normalize, subtractVectors } from "./common/vectors";
import { earthEquatorialRadius, earthPolarRadius } from "./constants";
import { EarthMoonPositions, Ephemeris } from "./ephemeris";
import { LatLongPosition } from "./geo-types";
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

export function getLatLongPosition(relativePosition: Vector3): LatLongPosition {
  const [mx, my, mz] = relativePosition;
  return {
    latAngle: Math.atan2(mz, Math.sqrt(mx * mx + my * my)),
    longAngle: Math.atan2(my, mx),
    distance: getMagnitude(relativePosition),
  };
}

export function getEarthRadiusAtPosition(position: LatLongPosition): number {
  // The closest possible distance is the distance between the bodies minus the earth radius at that point.
  // https://en.wikipedia.org/wiki/Ellipse#Polar_form_relative_to_center
  const bCosTheta = earthPolarRadius * Math.cos(position.latAngle);
  const aSinTheta = earthEquatorialRadius * Math.sin(position.latAngle);
  return (earthEquatorialRadius * earthPolarRadius) / Math.sqrt(bCosTheta * bCosTheta + aSinTheta * aSinTheta);
}

export function getGeodeticCoordinates(
  surfacePosition: Vector3,
  equatorialRadius: number,
  polarRadius: number
): Vector2 {
  // f = (a-b) / a
  // radial stretch = a/b = 1/(1-f)
  const radialStretch = equatorialRadius / polarRadius;
  const [x, y, z] = surfacePosition;
  const baseLen = Math.sqrt(x * x + y * y);

  // The geodetic angle is the same as the normal angle.
  // When you stretch along the equatorial axis, the normal's equatorial component
  // stretches by an inverse amount.
  // I.e. divide by radial stretch once to get back to the spherical position, and
  // then again to get the normal's equatorical component.
  // tan(angle) = z/(x / radialStretch^2) = z*radialStretch^2 / x
  const latitude = Math.atan((z * radialStretch * radialStretch) / baseLen);
  const longitude = Math.atan2(y, x);

  return [longitude, latitude];
}
