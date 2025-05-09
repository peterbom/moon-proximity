import {
  compose4,
  makeRotationFromX,
  makeRotationOnAxis,
  makeRotationX,
  makeRotationY,
  makeRotationZ,
  makeScale4,
  makeTranslation4,
  multiply4,
  transpose4,
} from "./matrices";
import { Vector3 } from "./numeric-types";
import { crossProduct3, normalize, subtractVectors } from "./vectors";

export enum TransformType {
  Translation,
  RotationXYZ,
  RotationOnAxis,
  Scale,
}

export type Translation = {
  type: TransformType.Translation;
  value: Vector3;
};

export type RotationXYZ = {
  type: TransformType.RotationXYZ;
  value: Vector3;
};

export type RotationOnAxis = {
  type: TransformType.RotationOnAxis;
  matrix: number[];
};

export type Scale = {
  type: TransformType.Scale;
  value: Vector3 | number;
};

export type Transform = Translation | RotationXYZ | RotationOnAxis | Scale;

function isTranslation(t: Transform): t is Translation {
  return t.type === TransformType.Translation;
}

function isRotationXYZ(t: Transform): t is RotationXYZ {
  return t.type === TransformType.RotationXYZ;
}

function isRotationOnAxis(t: Transform): t is RotationOnAxis {
  return t.type === TransformType.RotationOnAxis;
}

function isScale(t: Transform): t is Scale {
  return t.type === TransformType.Scale;
}

function isRotationOrScale(t: Transform): t is RotationXYZ | RotationOnAxis | Scale {
  return (
    t.type === TransformType.RotationXYZ || t.type === TransformType.RotationOnAxis || t.type === TransformType.Scale
  );
}

export function asTranslation(displacement: Vector3): Translation {
  return { type: TransformType.Translation, value: displacement };
}

export function asScaleTransform(factor: Vector3 | number): Scale {
  return { type: TransformType.Scale, value: factor };
}

export function asAxialRotation(normalizedAxis: Vector3, angleInRadians: number): RotationOnAxis {
  return {
    type: TransformType.RotationOnAxis,
    matrix: makeRotationOnAxis(normalizedAxis, angleInRadians),
  };
}

export function asAxialRotationFromUnitX(to: Vector3): Transform {
  return { type: TransformType.RotationOnAxis, matrix: makeRotationFromX(to) };
}

export function asXRotation(angleInRadians: number): RotationXYZ {
  return { type: TransformType.RotationXYZ, value: [angleInRadians, 0, 0] };
}

export function asYRotation(angleInRadians: number): RotationXYZ {
  return { type: TransformType.RotationXYZ, value: [0, angleInRadians, 0] };
}

export function asZRotation(angleInRadians: number): RotationXYZ {
  return { type: TransformType.RotationXYZ, value: [0, 0, angleInRadians] };
}

export type TransformSeries = Transform[];

export function invertTransformSeries(series: TransformSeries): TransformSeries {
  return [...series].reverse().map(invertTransform);
}

export function invertTransform(transform: Transform): Transform {
  if (isRotationOnAxis(transform)) {
    return { ...transform, matrix: transpose4(transform.matrix) };
  }

  if (isRotationXYZ(transform)) {
    return { ...transform, value: transform.value.map((n) => -n) as Vector3 };
  }

  if (isScale(transform)) {
    if (typeof transform.value === "number") {
      return { ...transform, value: 1 / transform.value };
    } else {
      return { ...transform, value: transform.value.map((n) => 1 / n) as Vector3 };
    }
  }

  if (isTranslation(transform)) {
    return { ...transform, value: transform.value.map((n) => -n) as Vector3 };
  }

  throw new Error("Unexpected transform type");
}

export function getNormalTransformSeries(objectSeries: TransformSeries): TransformSeries {
  // Normals are:
  // - unaffected by translations
  // - transformed equivalently by rotations
  // - scaled by the inverse of scale operations
  return objectSeries.filter<RotationXYZ | RotationOnAxis | Scale>(isRotationOrScale).map(getNormalTransform);
}

function getNormalTransform(objectTransform: RotationXYZ | RotationOnAxis | Scale): Transform {
  if (isRotationXYZ(objectTransform) || isRotationOnAxis(objectTransform)) {
    return objectTransform;
  }

  const scaleVector =
    typeof objectTransform.value === "number"
      ? ([objectTransform.value, objectTransform.value, objectTransform.value] as Vector3)
      : objectTransform.value;

  return {
    type: TransformType.Scale,
    value: scaleVector.map((n) => (n === 0 ? 0 : 1 / n)) as Vector3,
  };
}

export function getTransformSeriesMatrix(series: TransformSeries): number[] {
  return compose4(...series.map(getTransformMatrix));
}

export function getTransformMatrix(transform: Transform): number[] {
  if (isTranslation(transform)) {
    return makeTranslation4(...transform.value);
  }

  if (isRotationXYZ(transform)) {
    return compose4(
      makeRotationX(transform.value[0]),
      makeRotationY(transform.value[1]),
      makeRotationZ(transform.value[2])
    );
  }

  if (isRotationOnAxis(transform)) {
    return transform.matrix;
  }

  if (isScale(transform)) {
    return makeScale4(transform.value);
  }

  throw new Error(`Unexpected transform ${transform}`);
}

export function applyTransforms(series: TransformSeries, ...points: Vector3[]): Vector3[] {
  const matrix = getTransformSeriesMatrix(series);
  return applyTransformMatrix(matrix, ...points);
}

export function applyTransformMatrix(matrix: number[], ...points: Vector3[]): Vector3[] {
  return points.map((p) => multiply4(matrix, [...p, 1]).slice(0, 3) as Vector3);
}
