import {
  getEarthAndMoonPositions,
  getEarthRadiusAtPosition,
  getEarthRotation,
  getLatLongPosition,
} from "./calculations";
import { maxByProperty } from "./common/iteration";
import { compose4, makeTranslation4, transpose4 } from "./common/matrices";
import { Vector3 } from "./common/numeric-types";
import { normalize, scaleVector, subtractVectors } from "./common/vectors";
import { applyTransformMatrix, getTransformSeriesMatrix } from "./common/xform";
import { Ephemeris } from "./ephemeris";
import { AstronomicalTime, incrementTime } from "./time";

export type ProximityPoint = {
  position: Vector3;
  time: AstronomicalTime;
  distanceAboveMin: number;
};

export type ProximityLine = {
  minDistanceIndex: number;
  minDistance: number;
  maxDistance: number;
  points: ProximityPoint[];
};

type WorkingProximityPoint = {
  position: Vector3;
  time: AstronomicalTime;
  distance: number;
};

export function getProximityLine(
  ephemeris: Ephemeris,
  referenceTime: AstronomicalTime,
  distanceRange: number,
  maxTimeRangeSeconds: number,
  stepSeconds: number
): ProximityLine {
  const referenceWorkingPoint = getWorkingProximityPoint(ephemeris, referenceTime);
  const maxDistance = referenceWorkingPoint.distance + distanceRange;

  const preReferencePoints = getWorkingProximityPoints(
    ephemeris,
    referenceTime,
    maxDistance,
    maxTimeRangeSeconds / 2,
    -stepSeconds
  );

  const postReferencePoints = getWorkingProximityPoints(
    ephemeris,
    referenceTime,
    maxDistance,
    maxTimeRangeSeconds / 2,
    stepSeconds
  );

  const workingPoints = [...preReferencePoints.reverse(), referenceWorkingPoint, ...postReferencePoints];

  const minDistanceResult = maxByProperty(workingPoints, (p) => -p.distance);
  const minDistanceIndex = minDistanceResult.index;
  const minDistance = minDistanceResult.item.distance;
  const points = workingPoints.map<ProximityPoint>((p) => ({
    position: p.position,
    time: p.time,
    distanceAboveMin: p.distance - minDistance,
  }));

  return { minDistance, maxDistance, minDistanceIndex, points };
}

function getWorkingProximityPoints(
  ephemeris: Ephemeris,
  startTime: AstronomicalTime,
  maxDistance: number,
  maxTimeRangeSeconds: number,
  stepSeconds: number
): WorkingProximityPoint[] {
  const points: WorkingProximityPoint[] = [];
  for (let offsetSeconds = stepSeconds; offsetSeconds < maxTimeRangeSeconds; offsetSeconds += stepSeconds) {
    const time = incrementTime(startTime, offsetSeconds);
    const workingPoint = getWorkingProximityPoint(ephemeris, time);
    if (workingPoint.distance > maxDistance) {
      break;
    }

    points.push(workingPoint);
  }

  return points;
}

function getWorkingProximityPoint(ephemeris: Ephemeris, time: AstronomicalTime): WorkingProximityPoint {
  const worldPositions = getEarthAndMoonPositions(ephemeris, time);
  const worldEarthRotation = getEarthRotation(time);
  const localRotationMatrix = transpose4(getTransformSeriesMatrix(worldEarthRotation.transforms));
  const localTranslationMatrix = makeTranslation4(...subtractVectors([0, 0, 0], worldPositions.earthPosition));
  const localMatrix = compose4(localTranslationMatrix, localRotationMatrix);

  const [localMoonPosition] = applyTransformMatrix(localMatrix, worldPositions.moonPosition);

  const earthToMoonUnit = normalize(localMoonPosition);
  const moonLatLongPosition = getLatLongPosition(localMoonPosition);
  const earthRadius = getEarthRadiusAtPosition(moonLatLongPosition);
  const localPosition = scaleVector(earthToMoonUnit, earthRadius);

  return {
    distance: moonLatLongPosition.distance - earthRadius,
    position: localPosition,
    time: time,
  };
}
