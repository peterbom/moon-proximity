import type { Vector2 } from "./common/numeric-types";
import type { ShapeData } from "./webgl/shape-types";

export type ProximityShapeData = ShapeData & {
  minDistanceIndex: number;
  unixSeconds: number[];
  geodeticCoords: Vector2[];
  minDistance: number;
  distancesAboveMin: number[];
};
