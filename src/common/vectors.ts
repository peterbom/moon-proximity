import type { Vector, Vector3 } from "./numeric-types";

export function addVectors<T extends Vector>(v1: T, v2: T): T {
  return v1.map((n1, index) => n1 + v2[index]) as T;
}

export function subtractVectors<T extends Vector>(v1: T, v2: T): T {
  return v1.map((n1, index) => n1 - v2[index]) as T;
}

export function scaleVector<T extends Vector>(v: T, factor: number): T {
  return v.map((n) => n * factor) as T;
}

export function getMagnitude<T extends Vector>(v: T): number {
  const sumOfSquares = v.reduce((sum, n) => sum + n * n, 0);
  const length = Math.sqrt(sumOfSquares);
  if (length < 0.00001) {
    return 0;
  }

  return length;
}

export function normalize<T extends Vector>(v: T): T {
  const length = getMagnitude(v);
  if (length === 0) {
    return Array.from({ length: v.length }, (_) => 0) as T;
  }

  return v.map((n) => n / length) as T;
}

export function crossProduct3(v1: Vector3, v2: Vector3): Vector3 {
  /*
  v1[0]  v2[0]
  v1[1]  v2[1]
  v1[2]  v2[2]
  */
  // prettier-ignore
  return [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0]
  ];
}

export function dotProduct3(v1: Vector3, v2: Vector3): number {
  /*
  v1[0]  v2[0]
  v1[1]  v2[1]
  v1[2]  v2[2]
  */
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}
