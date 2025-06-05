import type { Vector2, Vector3 } from "./common/numeric-types";
import { crossProduct3, dotProduct3, getMagnitude, normalize, subtractVectors } from "./common/vectors";
import {
  applyTransforms,
  asXRotation,
  asYRotation,
  asZRotation,
  RotationOnAxis,
  TransformSeries,
  TransformType,
} from "./common/xform";
import { earthEquatorialRadius, earthMeanRadius, earthPolarRadius, moonMeanRadius, sunMeanRadius } from "./constants";
import { Ephemeris } from "./ephemeris";
import { LatLongPosition } from "./geo-types";
import { AstronomicalTime } from "./time";

export type EarthMoonPositions = {
  moonPosition: Vector3;
  earthPosition: Vector3;
};

export type EarthMoonSunPositions = EarthMoonPositions & {
  sunPosition: Vector3;
};

export type DatePosition = {
  date: Date;
  positions: EarthMoonSunPositions;
  moonDistance: number;
  sunDistance: number;
};

export type DatePositionAngles = DatePosition & {
  angleBetweenMoonAndSun: number;
  moonVisibleAngle: number;
  sunVisibleAngle: number;
};

export type EclipseMagnitude = {
  umbral: number;
  penumbral: number;
};

export type EarthRotation = {
  axis: Vector3;
  axialAngle: number;
  transforms: TransformSeries;
};

export type EclipticPlane = {
  rotation: RotationOnAxis;
  up: Vector3;
};

const radiansPerArcsecond = Math.PI / (180 * 60 * 60);

export function getEarthAndMoonPositions(ephemeris: Ephemeris, time: AstronomicalTime): EarthMoonPositions {
  const ssbToEmb = ephemeris.getSsbToEmb(time.julianDays);
  const earthToMoon = ephemeris.getEarthToMoon(time.julianDays);
  const ssbToEarth = ephemeris.getSsbToEarth(ssbToEmb, earthToMoon);
  const ssbToMoon = ephemeris.getSsbToMoon(ssbToEarth, earthToMoon);

  const earthPosition = ssbToEarth.positions as Vector3;
  const moonPosition = ssbToMoon.positions as Vector3;

  return { earthPosition, moonPosition };
}

export function getEarthMoonAndSunPositions(ephemeris: Ephemeris, time: AstronomicalTime): EarthMoonSunPositions {
  const ssbToSun = ephemeris.getSsbToSun(time.julianDays);
  const sunPosition = ssbToSun.positions as Vector3;

  const { moonPosition, earthPosition } = getEarthAndMoonPositions(ephemeris, time);
  return { earthPosition, moonPosition, sunPosition };
}

export function getDatePosition(ephemeris: Ephemeris, time: AstronomicalTime): DatePosition {
  const positions = getEarthMoonAndSunPositions(ephemeris, time);
  const earthToMoon = subtractVectors(positions.moonPosition, positions.earthPosition);
  const earthToSun = subtractVectors(positions.sunPosition, positions.earthPosition);
  const moonDistance = getMagnitude(earthToMoon);
  const sunDistance = getMagnitude(earthToSun);
  return { date: time.date, positions, moonDistance, sunDistance };
}

export function getDatePositionAngles(datePosition: DatePosition): DatePositionAngles {
  const earthToMoon = subtractVectors(datePosition.positions.moonPosition, datePosition.positions.earthPosition);
  const earthToSun = subtractVectors(datePosition.positions.sunPosition, datePosition.positions.earthPosition);
  const angleBetweenMoonAndSun = Math.acos(dotProduct3(normalize(earthToMoon), normalize(earthToSun)));
  const moonVisibleAngle = Math.atan(moonMeanRadius / datePosition.moonDistance) * 2;
  const sunVisibleAngle = Math.atan(sunMeanRadius / datePosition.sunDistance) * 2;
  return {
    ...datePosition,
    angleBetweenMoonAndSun,
    moonVisibleAngle,
    sunVisibleAngle,
  };
}

export function getLunarEclipseMaginutude(datePositionAngles: DatePositionAngles): EclipseMagnitude {
  const moonAngleFromUmbralConeCenter = Math.PI - datePositionAngles.angleBetweenMoonAndSun;
  const moonDistanceInConeDirection = datePositionAngles.moonDistance * Math.cos(moonAngleFromUmbralConeCenter);
  const tanPenumbralConeAngle = (sunMeanRadius + earthMeanRadius) / datePositionAngles.sunDistance;
  const penumbralRadius = earthMeanRadius + moonDistanceInConeDirection * tanPenumbralConeAngle;

  const tanUmbralConeAngle = (sunMeanRadius - earthMeanRadius) / datePositionAngles.sunDistance;
  const umbralRadius = earthMeanRadius - moonDistanceInConeDirection * tanUmbralConeAngle;

  const moonCenterUmbralDistance = datePositionAngles.moonDistance * Math.sin(moonAngleFromUmbralConeCenter);
  const moonInnermostDistance = moonCenterUmbralDistance - moonMeanRadius;

  return {
    penumbral: (penumbralRadius - moonInnermostDistance) / moonMeanRadius,
    umbral: (umbralRadius - moonInnermostDistance) / moonMeanRadius,
  };
}

export function getEarthRotation(time: AstronomicalTime): EarthRotation {
  // Apply the following rotations in order:
  // - Z: axial
  // - X: obliquity
  // - Z: -zeta
  // - Y: theta
  // - Z: -z

  // The axial (Z) rotation is the regular daily rotation amount.
  // https://en.wikipedia.org/wiki/Sidereal_time#ERA
  const axialZ = (2 * Math.PI * (0.779057273264 + 1.00273781191135448 * time.j2000Days)) % (2 * Math.PI);

  // https://en.wikipedia.org/wiki/Axial_tilt
  // ε = [23°26′21.448″] − 46.8150″ T − 0.00059″ T^2 + 0.001813″ T^3
  // We can skip the initial axial tilt of ~23° because the model is based on the J2000
  // reference frame, whose axes are aligned with the Earth's equator at 2000-01-01T12:00Z.
  const t = time.j2000Days / 36525;
  const obliquityX = (-46.815 * t - 0.00059 * t * t + 0.001813 * t * t * t) * radiansPerArcsecond;

  // https://www.celestialprogramming.com/snippets/precessionMeeus.html
  // TODO: Consider AIU2006 (https://www.celestialprogramming.com/snippets/precessionIAU2006.html)
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * radiansPerArcsecond;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * radiansPerArcsecond;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * radiansPerArcsecond;

  const transforms = [
    asZRotation(axialZ),
    asXRotation(obliquityX),
    asZRotation(-zeta),
    asYRotation(theta),
    asZRotation(-z),
  ];

  const axialAngle = axialZ - zeta - z;
  const [axis] = applyTransforms(transforms, [0, 0, 1]);
  return { transforms, axialAngle, axis };
}

export function getEclipticPlane(embPos: Vector3, embVel: Vector3): EclipticPlane {
  const eclipticX = normalize(embPos);
  const eclipticZ = normalize(crossProduct3(embPos, embVel));
  const eclipticY = crossProduct3(eclipticX, eclipticZ);

  // prettier-ignore
  const matrix = [
      ...eclipticX, 0,
      ...eclipticY, 0,
      ...eclipticZ, 0,
      0, 0, 0, 1
    ];

  return { rotation: { type: TransformType.RotationOnAxis, matrix }, up: eclipticZ };
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
