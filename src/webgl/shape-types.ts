import { Vector2, Vector3, Vector4 } from "../common/numeric-types";

export type DrawMode = "Triangles" | "Lines";

export type ShapeData = {
  positions: Vector3[];
  normals: Vector3[];
  texCoords: Vector2[];
  colors: Vector4[];
  indices: number[] | null;
  drawMode: DrawMode;
};
