import type { Vector2, Vector3, Vector4 } from "../common/numeric-types";
import type { DrawMode } from "./program-types";

export type ShapeData = {
  positions: Vector3[];
  normals: Vector3[];
  texCoords: Vector2[];
  colors: Vector4[];
  indices: number[] | null;
  drawMode: DrawMode;
};
