import type { Vector2, Vector3, Vector4 } from "../common/numeric-types";
import { crossProduct3, normalize } from "../common/vectors";
import type { ShapeData } from "./shape-types";

export type CreateStraightLineShapeDataOptions = {
  color: Vector4;
  originColor: Vector4 | null;
  targetColor: Vector4 | null;
  planeReference: Vector3;
};

const defaultCreateStraightLineShapeDataOptions: CreateStraightLineShapeDataOptions = {
  color: [1, 1, 1, 1],
  originColor: null,
  targetColor: null,
  planeReference: [0, 0, 1], // Used for calculating normals
};

export function createStraightLineShapeData(
  target: Vector3,
  options: Partial<CreateStraightLineShapeDataOptions> = {}
): ShapeData {
  const { color, originColor, targetColor, planeReference } = {
    ...defaultCreateStraightLineShapeDataOptions,
    ...options,
  };

  const normal = normalize(crossProduct3(target, planeReference));

  const positions: Vector3[] = [[0, 0, 0], target];
  const normals: Vector3[] = [normal, normal];
  const texCoords: Vector2[] = [
    [0, 0],
    [1, 1],
  ];
  const colors: Vector4[] = [originColor || color, targetColor || color];

  return {
    positions,
    normals,
    texCoords,
    colors,
    drawMode: "Lines",
    indices: null,
  };
}

export function createCircleShapeData(radius: number, segmentCount: number): ShapeData {
  const vertexCount = segmentCount + 1;

  const positions: Vector3[] = Array.from({ length: vertexCount });
  const normals: Vector3[] = Array.from({ length: vertexCount });
  const texCoords: Vector2[] = Array.from({ length: vertexCount });
  const colors: Vector4[] = Array.from({ length: vertexCount });
  const indices: number[] = [];

  for (let i = 0; i <= segmentCount; i++) {
    const angle = ((2 * Math.PI) / segmentCount) * i;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    positions[i] = [x * radius, y * radius, 0];
    normals[i] = [x, y, 0];
    texCoords[i] = [0, 0];
    colors[i] = [1, 1, 1, 1];
    if (i < segmentCount) {
      indices.push(i, i + 1);
    }
  }

  return {
    positions,
    normals,
    texCoords,
    colors,
    drawMode: "Lines",
    indices,
  };
}

export type CreatePlaneShapeDataOptions = {
  color: Vector4;
};

const defaultCreatePlaneShapeDataOptions: CreatePlaneShapeDataOptions = {
  color: [1, 1, 1, 1],
};

export function createPlaneShapeData(
  xLength: number,
  yLength: number,
  options: Partial<CreatePlaneShapeDataOptions> = {}
): ShapeData {
  const { color } = { ...defaultCreatePlaneShapeDataOptions, ...options };
  const xValues = [0, xLength];
  const yValues = [0, yLength];

  const vertexCount = xValues.length * yValues.length * 2; // One vertex for each side of the plane
  const positions: Vector3[] = Array.from({ length: vertexCount });
  const normals: Vector3[] = Array.from({ length: vertexCount });
  const texCoords: Vector2[] = Array.from({ length: vertexCount });
  const colors: Vector4[] = Array.from({ length: vertexCount });
  const indices: number[] = [];

  for (let xIndex = 0; xIndex < xValues.length; xIndex++) {
    for (let yIndex = 0; yIndex < yValues.length; yIndex++) {
      const [x, y] = [xValues[xIndex], yValues[yIndex]];
      const vertexIndexF = (xIndex * yValues.length + yIndex) * 2;
      const vertexIndexB = vertexIndexF + 1;
      positions[vertexIndexF] = [x, y, 0];
      positions[vertexIndexB] = [x, y, 0];
      normals[vertexIndexF] = [0, 0, -1];
      normals[vertexIndexB] = [0, 0, 1];
      const u = x / xLength;
      const v = y / yLength;
      texCoords[vertexIndexF] = [u, v];
      texCoords[vertexIndexB] = [1 - u, 1 - v];
      colors[vertexIndexF] = color;
      colors[vertexIndexB] = color;
      if (xIndex < xValues.length - 1 && yIndex < yValues.length - 1) {
        const posF00 = vertexIndexF;
        const posF01 = vertexIndexF + 2;
        const posF10 = vertexIndexF + yValues.length * 2;
        const posF11 = vertexIndexF + (yValues.length + 1) * 2;
        indices.push(posF00, posF01, posF10, posF01, posF11, posF10);

        const posB00 = vertexIndexB;
        const posB01 = vertexIndexB + 2;
        const posB10 = vertexIndexB + yValues.length * 2;
        const posB11 = vertexIndexB + (yValues.length + 1) * 2;
        indices.push(posB00, posB10, posB01, posB01, posB10, posB11);
      }
    }
  }

  return {
    positions,
    normals,
    texCoords,
    colors,
    drawMode: "Triangles",
    indices,
  };
}
