import { sphericalToCartesian } from "../common/math";
import { multiply4 } from "../common/matrices";
import type { Vector2, Vector3, Vector4 } from "../common/numeric-types";
import { crossProduct3, normalize } from "../common/vectors";
import { getNormalTransformSeries, getTransformSeriesMatrix, TransformSeries } from "../common/xform";
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

export type CreateSphereShapeDataOptions = {
  startLatitudeInRadians: number;
  endLatitudeInRadians: number;
  startLongitudeInRadians: number;
  endLongitudeInRadians: number;
  baseColor: Vector3;
  opacity: number;
  getColor: (baseColor: Vector3, opacity: number, theta: number, phi: number) => Vector4;
};

const defaultCreateSphereShapeDataOptions: CreateSphereShapeDataOptions = {
  startLatitudeInRadians: -Math.PI / 2,
  endLatitudeInRadians: Math.PI / 2,
  startLongitudeInRadians: -Math.PI,
  endLongitudeInRadians: Math.PI,
  baseColor: [1, 1, 1],
  opacity: 1,
  getColor: (baseColor, opacity, theta, phi) => {
    const [adjR, adjG, adjB] = [0.5 + Math.sin(theta) * 0.5, 0.5 + Math.sin(phi) * 0.5, 0.5 + Math.cos(theta) * 0.5];
    const [baseR, baseG, baseB] = baseColor;
    return [baseR * adjR, baseG * adjG, baseB * adjB, opacity];
  },
};

export function createSphereShapeData(
  radius: number,
  segmentCount: number,
  sliceCount: number,
  suppliedOtions: Partial<CreateSphereShapeDataOptions> = {}
): ShapeData {
  if (segmentCount <= 0 || sliceCount <= 0) {
    throw Error("segmentCount and sliceCount must be > 0");
  }

  const options = { ...defaultCreateSphereShapeDataOptions, ...suppliedOtions };

  const latRange = options.endLatitudeInRadians - options.startLatitudeInRadians;
  const lonRange = options.endLongitudeInRadians - options.startLongitudeInRadians;

  // We are going to generate our sphere by iterating through its
  // spherical coordinates and generating 2 triangles for each quad on a
  // ring of the sphere.
  const numVertices = (segmentCount + 1) * (sliceCount + 1);
  const positions: Vector3[] = Array.from({ length: numVertices });
  const normals: Vector3[] = Array.from({ length: numVertices });
  const texCoords: Vector2[] = Array.from({ length: numVertices });
  const colors: Vector4[] = Array.from({ length: numVertices });

  // Generate the individual vertices in our vertex buffer.
  for (let slice = 0; slice <= sliceCount; slice++) {
    for (let segment = 0; segment <= segmentCount; segment++) {
      // Generate a vertex based on its spherical coordinates
      const u = segment / segmentCount;
      const v = slice / sliceCount;
      const theta = latRange * v + options.startLatitudeInRadians;
      const phi = lonRange * u + options.startLongitudeInRadians;
      const position = sphericalToCartesian({ r: radius, theta, phi });
      const vertexIndex = slice * (segmentCount + 1) + segment;
      positions[vertexIndex] = position;
      normals[vertexIndex] = position.map((n) => n / radius) as Vector3;
      texCoords[vertexIndex] = [u, 1 - v];
      colors[vertexIndex] = options.getColor(options.baseColor, options.opacity, theta, phi);
    }
  }

  const numQuads = segmentCount * sliceCount;
  const trianglePoints: Vector3[] = Array.from({ length: numQuads * 2 }); // 2 triangles per quad

  for (let z = 0; z < sliceCount; z++) {
    for (let x = 0; x < segmentCount; x++) {
      const [v1, v2, v3, v4] = [
        z * (segmentCount + 1) + x,
        z * (segmentCount + 1) + x + 1,
        (z + 1) * (segmentCount + 1) + x,
        (z + 1) * (segmentCount + 1) + x + 1,
      ];
      const startIndex = (x * sliceCount + z) * 2;
      trianglePoints[startIndex] = [v1, v2, v3];
      trianglePoints[startIndex + 1] = [v3, v2, v4];
    }
  }

  return {
    positions,
    normals,
    texCoords,
    colors,
    drawMode: "Triangles",
    indices: trianglePoints.flat(),
  };
}

export type CreateCylinderShapeDataOptions = {
  color: Vector4 | null;
  radius: number;
  length: number;
  radialDivisions: number;
  lengthDivisions: number;
  capEnds: boolean;
};

const defaultCreateCylinderShapeDataOptions: CreateCylinderShapeDataOptions = {
  color: null,
  radius: 5,
  length: 10,
  radialDivisions: 8,
  lengthDivisions: 1,
  capEnds: true,
};

export function createCylinderShapeData(suppliedOptions: Partial<CreateCylinderShapeDataOptions> = {}): ShapeData {
  const options = { ...defaultCreateCylinderShapeDataOptions, ...suppliedOptions };

  const radialAngle = (Math.PI * 2) / options.radialDivisions;

  const mainVertexCount = (options.radialDivisions + 1) * (options.lengthDivisions + 1);

  const radialVertexCountPerEnd = options.radialDivisions + 1;
  const vertexCountPerEnd = radialVertexCountPerEnd + 1;
  const endVertexCount = options.capEnds ? vertexCountPerEnd * 2 : 0;

  const vertexCount = mainVertexCount + endVertexCount;

  const positions: Vector3[] = Array.from({ length: vertexCount });
  const normals: Vector3[] = Array.from({ length: vertexCount });
  const texCoords: Vector2[] = Array.from({ length: vertexCount });
  const colors: Vector4[] = Array.from({ length: vertexCount });
  const indices: number[] = [];

  const lengthInterval = options.length / options.lengthDivisions;
  for (let yPos = 0; yPos < options.lengthDivisions + 1; yPos++) {
    const y = lengthInterval * yPos;
    for (let anglePos = 0; anglePos < options.radialDivisions + 1; anglePos++) {
      const vertexIndex = yPos * (options.radialDivisions + 1) + anglePos;
      const angle = radialAngle * anglePos;
      const x = Math.cos(angle) * options.radius;
      const z = Math.sin(angle) * options.radius;
      positions[vertexIndex] = [x, y, z];
      normals[vertexIndex] = normalize([x, 0, z]);
      colors[vertexIndex] = options.color || [yPos / options.lengthDivisions, 0, anglePos / options.radialDivisions, 1];
      texCoords[vertexIndex] = [anglePos / options.radialDivisions, yPos / options.lengthDivisions];

      if (yPos < options.lengthDivisions && anglePos < options.radialDivisions) {
        const nextLengthVertexIndex = vertexIndex + options.radialDivisions + 1;
        indices.push(vertexIndex + 1, vertexIndex, nextLengthVertexIndex);
        indices.push(nextLengthVertexIndex + 1, vertexIndex + 1, nextLengthVertexIndex);
      }
    }
  }

  if (options.capEnds) {
    for (let end = 0; end < 2; end++) {
      const y = end === 0 ? 0 : options.length;
      // Center of bottom/top cap
      const centerVertexIndex = mainVertexCount + vertexCountPerEnd * end;
      positions[centerVertexIndex] = [0, y, 0];
      normals[centerVertexIndex] = [0, end === 0 ? -1 : 1, 0];
      colors[centerVertexIndex] = options.color || [1, 1, 1, 1];
      texCoords[centerVertexIndex] = [0.5, 0];

      for (let anglePos = 0; anglePos < radialVertexCountPerEnd; anglePos++) {
        const vertexIndex = mainVertexCount + vertexCountPerEnd * end + anglePos + 1;
        const angle = radialAngle * anglePos;
        const x = Math.cos(angle) * options.radius;
        const z = Math.sin(angle) * options.radius;
        positions[vertexIndex] = [x, y, z];
        normals[vertexIndex] = [0, end === 0 ? -1 : 1, 0];
        colors[vertexIndex] = options.color || [0, 0, anglePos / options.radialDivisions, 1];
        texCoords[vertexIndex] = [anglePos / options.radialDivisions, 1];

        if (anglePos < options.radialDivisions) {
          if (end === 0) {
            indices.push(vertexIndex, vertexIndex + 1, centerVertexIndex);
          } else {
            indices.push(vertexIndex + 1, vertexIndex, centerVertexIndex);
          }
        }
      }
    }
  }

  return {
    positions,
    normals,
    colors,
    texCoords,
    drawMode: "Triangles",
    indices,
  };
}

type CreateTruncatedConeShapeDataOptions = {
  topCap: boolean;
  bottomCap: boolean;
  color: Vector3 | null;
};

const defaultCreateTruncatedConeShapeDataOptions: CreateTruncatedConeShapeDataOptions = {
  topCap: true,
  bottomCap: true,
  color: null,
};

export function createTruncatedConeShapeData(
  bottomRadius: number,
  topRadius: number,
  height: number,
  radialSubdivisions: number,
  verticalSubdivisions: number,
  suppliedOptions: Partial<CreateTruncatedConeShapeDataOptions> = {}
): ShapeData {
  if (radialSubdivisions < 3) {
    throw Error("radialSubdivisions must be 3 or greater");
  }

  if (verticalSubdivisions < 1) {
    throw Error("verticalSubdivisions must be 1 or greater");
  }

  const options = { ...defaultCreateTruncatedConeShapeDataOptions, ...suppliedOptions };

  const extra = (options.topCap ? 2 : 0) + (options.bottomCap ? 2 : 0);

  const numVertices = (radialSubdivisions + 1) * (verticalSubdivisions + 1 + extra);
  const positions: Vector3[] = Array.from({ length: numVertices });
  const normals: Vector3[] = Array.from({ length: numVertices });
  const texCoords: Vector2[] = Array.from({ length: numVertices });
  const colors: Vector4[] = Array.from({ length: numVertices });

  const vertsAroundEdge = radialSubdivisions + 1;

  // The slant of the cone is constant across its surface
  const slant = Math.atan2(bottomRadius - topRadius, height);
  const cosSlant = Math.cos(slant);
  const sinSlant = Math.sin(slant);

  const start = options.topCap ? -2 : 0;
  const end = verticalSubdivisions + (options.bottomCap ? 2 : 0);
  const roundCount = end - start;

  for (let yy = start; yy <= end; ++yy) {
    let v = yy / verticalSubdivisions;
    let y = height * v;
    let ringRadius;
    if (yy < 0) {
      y = 0;
      v = 1;
      ringRadius = bottomRadius;
    } else if (yy > verticalSubdivisions) {
      y = height;
      v = 1;
      ringRadius = topRadius;
    } else {
      ringRadius = bottomRadius + (topRadius - bottomRadius) * (yy / verticalSubdivisions);
    }
    if (yy === -2 || yy === verticalSubdivisions + 2) {
      ringRadius = 0;
      v = 0;
    }

    for (let ii = 0; ii < vertsAroundEdge; ++ii) {
      const sin = Math.sin((ii * Math.PI * 2) / radialSubdivisions);
      const cos = Math.cos((ii * Math.PI * 2) / radialSubdivisions);
      const vertexIndex = vertsAroundEdge * (yy - start) + ii;
      positions[vertexIndex] = [sin * ringRadius, y, cos * ringRadius];
      normals[vertexIndex] = [
        yy < 0 || yy > verticalSubdivisions ? 0 : sin * cosSlant,
        yy < 0 ? -1 : yy > verticalSubdivisions ? 1 : sinSlant,
        yy < 0 || yy > verticalSubdivisions ? 0 : cos * cosSlant,
      ];
      texCoords[vertexIndex] = [ii / radialSubdivisions, 1 - v];
      const color: Vector4 = options.color !== null ? [...options.color, 1] : [sin, cos, yy / roundCount, 1];
      colors[vertexIndex] = color;
    }
  }

  const numQuads = (verticalSubdivisions + extra) * radialSubdivisions;
  const trianglePoints: Vector3[] = Array.from({ length: numQuads * 2 }); // 2 triangles per quad

  for (let yy = 0; yy < verticalSubdivisions + extra; ++yy) {
    for (let ii = 0; ii < radialSubdivisions; ++ii) {
      const startIndex = (yy * radialSubdivisions + ii) * 2;
      trianglePoints[startIndex] = [
        vertsAroundEdge * (yy + 0) + 0 + ii,
        vertsAroundEdge * (yy + 0) + 1 + ii,
        vertsAroundEdge * (yy + 1) + 1 + ii,
      ];

      trianglePoints[startIndex + 1] = [
        vertsAroundEdge * (yy + 0) + 0 + ii,
        vertsAroundEdge * (yy + 1) + 1 + ii,
        vertsAroundEdge * (yy + 1) + 0 + ii,
      ];
    }
  }

  return {
    positions,
    normals,
    texCoords,
    colors,
    drawMode: "Triangles",
    indices: trianglePoints.flat(),
  };
}

export function transformShapeData(shape: ShapeData, transforms: TransformSeries): ShapeData {
  const positionTransformMatrix = getTransformSeriesMatrix(transforms);
  const normalTransformMatrix = getTransformSeriesMatrix(getNormalTransformSeries(transforms));

  return {
    positions: shape.positions.map((p) => multiply4(positionTransformMatrix, [...p, 1]).slice(0, 3) as Vector3),
    normals: shape.normals.map((n) => multiply4(normalTransformMatrix, [...n, 1]).slice(0, 3) as Vector3),
    colors: shape.colors,
    texCoords: shape.texCoords,
    drawMode: shape.drawMode,
    indices: shape.indices,
  };
}
