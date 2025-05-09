import { getGeodeticCoordinates } from "./calculations";
import { seq } from "./common/iteration";
import { makeRotationOnAxis } from "./common/matrices";
import type { Vector2, Vector3, Vector4 } from "./common/numeric-types";
import { getMagnitude, normalize, subtractVectors } from "./common/vectors";
import { applyTransformMatrix } from "./common/xform";
import { ProximityLine, ProximityPoint } from "./proximity-line";
import type { ShapeData } from "./webgl/shape-types";

export type ProximityShapeData = ShapeData & {
  minDistanceIndex: number;
  unixSeconds: number[];
  geodeticCoords: Vector2[];
  minDistance: number;
  distancesAboveMin: number[];
};

export type EllipsoidShapeData = ShapeData & {
  geodeticCoords: Vector2[];
};

const segmentCount = 360;
const sliceCount = 180;

export function createEllipsoidShapeData(equatorialRadius: number, polarRadius: number): EllipsoidShapeData {
  const lonRange = 2 * Math.PI;
  const radialStretch = equatorialRadius / polarRadius;

  const numVertices = (segmentCount + 1) * (sliceCount + 1);
  const positions: Vector3[] = Array.from({ length: numVertices });
  const geodeticCoords: Vector2[] = Array.from({ length: numVertices });
  const normals: Vector3[] = Array.from({ length: numVertices });
  const texCoords: Vector2[] = Array.from({ length: numVertices });
  const colors: Vector4[] = Array.from({ length: numVertices });

  const startZ = -polarRadius;
  const endZ = polarRadius;
  const rangeZ = endZ - startZ;

  // Generate the individual vertices in our vertex buffer.
  for (let slice = 0; slice <= sliceCount; slice++) {
    // Divide the vertical axis into equal units, rather than using equal angles.
    // This gives an increased vertex density in the equatorial regions compared to
    // the polar regions. This maps directly to a Lambert Cylindrical projection.
    const z = startZ + slice * (rangeZ / sliceCount);
    const circularAngleZ = Math.asin(z / polarRadius);
    const r = Math.cos(circularAngleZ) * equatorialRadius;

    // For equirectangular texture coordinates we need the geodetic angle, not the geocentric one. Let:
    // a = equatorial radius
    // b = polar radius
    // t_c = geocentric angle
    // t_d = geodetic angle
    // Then:
    // (b/a) tan(t_d) = sin(t_c)/cos(t_c) = tan(t_c) = z / r
    // See: https://gis.stackexchange.com/a/20250
    const geocentricAngle = Math.atan(z / r);
    const geodeticAngle = Math.atan((1 / radialStretch) * (z / r));
    const normalR = polarRadius * Math.cos(geocentricAngle);
    const normalZ = equatorialRadius * Math.sin(geocentricAngle);

    for (let segment = 0; segment <= segmentCount; segment++) {
      const vertexIndex = slice * (segmentCount + 1) + segment;

      // Generate a vertex based on the segment angle
      const segmentAngle = -Math.PI + segment * (lonRange / segmentCount);
      const cosLon = Math.cos(segmentAngle);
      const sinLon = Math.sin(segmentAngle);
      const x = cosLon * r;
      const y = sinLon * r;

      // Generate texture coordinates based on the segment and geodetic angle.
      const u = segment / segmentCount;
      const v = geodeticAngle / Math.PI + 0.5;

      // Calculate normal x,y based on radial component of normal.
      const normalX = cosLon * normalR;
      const normalY = sinLon * normalR;

      positions[vertexIndex] = [x, y, z];
      geodeticCoords[vertexIndex] = [segmentAngle, geodeticAngle];
      normals[vertexIndex] = normalize([normalX, normalY, normalZ]);
      texCoords[vertexIndex] = [u, 1 - v];
      colors[vertexIndex] = [1, 1, 1, 1]; // We won't be using the color.
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
    geodeticCoords,
    normals,
    texCoords,
    colors,
    drawMode: "Triangles",
    indices: trianglePoints.flat(),
  };
}

const perSideTransverseVertexCount = 5;

export function createProximityShapeData(
  proximityLine: ProximityLine,
  equatorialRadius: number,
  polarRadius: number,
  color: Vector3
): ProximityShapeData {
  const perPointVertexCount = perSideTransverseVertexCount * 2 + 1;
  const minDistanceIndex = proximityLine.minDistanceIndex * perPointVertexCount + perSideTransverseVertexCount;
  const distanceRange = proximityLine.maxDistance - proximityLine.minDistance;

  const positions: Vector3[] = [];
  const normals: Vector3[] = [];
  const unixSeconds: number[] = [];
  const geodeticCoords: Vector2[] = [];
  const distancesAboveMin: number[] = [];
  const texCoords: Vector2[] = [];
  const colors: Vector4[] = [];

  proximityLine.points.forEach((point, i) => {
    let rotationAxis: Vector3;
    if (i < proximityLine.points.length - 1) {
      const nextPoint = proximityLine.points[i + 1];
      rotationAxis = normalize(subtractVectors(nextPoint.position, point.position));
    } else {
      const prevPoint = proximityLine.points[i - 1];
      rotationAxis = normalize(subtractVectors(point.position, prevPoint.position));
    }

    const vertices = createTransverseVertices(point, rotationAxis);
    positions.push(...vertices.positions);
    normals.push(...vertices.normals);
    unixSeconds.push(...vertices.unixSeconds);
    geodeticCoords.push(...vertices.geodeticCoords);
    distancesAboveMin.push(...vertices.distancesAboveMin);
    texCoords.push(...vertices.texCoords);
    colors.push(...vertices.colors);
  });

  const indices: number[] = [];
  for (let pointIndex = 0; pointIndex < proximityLine.points.length - 1; pointIndex++) {
    for (let transverseIndex = 0; transverseIndex < perPointVertexCount - 1; transverseIndex++) {
      const i1 = pointIndex * perPointVertexCount + transverseIndex;
      const i2 = i1 + 1;
      const i3 = (pointIndex + 1) * perPointVertexCount + transverseIndex;
      const i4 = i3 + 1;
      indices.push(i1, i4, i3, i1, i2, i4);
    }
  }

  return {
    positions,
    normals,
    unixSeconds,
    geodeticCoords,
    minDistance: proximityLine.minDistance,
    distancesAboveMin,
    minDistanceIndex,
    colors,
    texCoords,
    indices,
    drawMode: "Triangles",
  };

  function getColor(distanceAboveMin: number): Vector4 {
    return [...color, (distanceRange - distanceAboveMin) / distanceRange];
  }

  function createTransverseVertices(point: ProximityPoint, rotationAxis: Vector3) {
    const pointRadius = getMagnitude(point.position);
    const remainingDistance = distanceRange - point.distanceAboveMin;
    const maxAngle = Math.acos((pointRadius - remainingDistance) / pointRadius);
    const perVertexAngle = maxAngle / perSideTransverseVertexCount;
    const transverseAngles = seq(perSideTransverseVertexCount).map((i) => (i + 1) * perVertexAngle);

    const positions: Vector3[] = Array.from({ length: perPointVertexCount });
    const unixSeconds: number[] = Array.from({ length: perPointVertexCount });
    const geodeticCoords: Vector2[] = Array.from({ length: perPointVertexCount });
    const distancesAboveMin: number[] = Array.from({ length: perPointVertexCount });
    const normals: Vector3[] = Array.from({ length: perPointVertexCount });
    const colors: Vector4[] = Array.from({ length: perPointVertexCount });
    const texCoords: Vector2[] = Array.from({ length: perPointVertexCount });

    const middleVertexId = perSideTransverseVertexCount;
    positions[middleVertexId] = point.position;
    unixSeconds[middleVertexId] = point.time.unixSeconds;
    geodeticCoords[middleVertexId] = getGeodeticCoordinates(point.position, equatorialRadius, polarRadius);
    distancesAboveMin[middleVertexId] = point.distanceAboveMin;
    normals[middleVertexId] = normalize(point.position);
    colors[middleVertexId] = getColor(point.distanceAboveMin);
    texCoords[middleVertexId] = [0, 0];

    transverseAngles.forEach((angle, i) => {
      const rotMatrix1 = makeRotationOnAxis(rotationAxis, -angle);
      const rotMatrix2 = makeRotationOnAxis(rotationAxis, angle);
      const [v1] = applyTransformMatrix(rotMatrix1, point.position);
      const [v2] = applyTransformMatrix(rotMatrix2, point.position);
      const heightMultiplier = Math.cos(angle);
      const distanceIncrease = pointRadius - heightMultiplier * pointRadius;
      const distanceAboveMin = point.distanceAboveMin + distanceIncrease;

      const vertex1Id = middleVertexId - i - 1;
      positions[vertex1Id] = v1;
      unixSeconds[vertex1Id] = point.time.unixSeconds;
      geodeticCoords[vertex1Id] = getGeodeticCoordinates(v1, equatorialRadius, polarRadius);
      distancesAboveMin[vertex1Id] = distanceAboveMin;
      normals[vertex1Id] = normalize(v1);
      colors[vertex1Id] = getColor(distanceAboveMin);
      texCoords[vertex1Id] = [0, 0];

      const vertex2Id = middleVertexId + i + 1;
      positions[vertex2Id] = v2;
      unixSeconds[vertex2Id] = point.time.unixSeconds;
      geodeticCoords[vertex2Id] = getGeodeticCoordinates(v2, equatorialRadius, polarRadius);
      distancesAboveMin[vertex2Id] = distanceAboveMin;
      normals[vertex2Id] = normalize(v2);
      colors[vertex2Id] = getColor(distanceAboveMin);
      texCoords[vertex2Id] = [0, 0];
    });

    return {
      positions,
      unixSeconds,
      geodeticCoords,
      distancesAboveMin,
      normals,
      colors,
      texCoords,
    };
  }
}
