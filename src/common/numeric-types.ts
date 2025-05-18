export type Vector1 = [number];
export type Vector2 = [number, number];
export type Vector3 = [number, number, number];
export type Vector4 = [number, number, number, number];
export type Vector = Vector1 | Vector2 | Vector3 | Vector4;

export type SphericalCoordinate = {
  r: number; // radial distance
  theta: number; // zenith relative to positive z (latitude) in radians
  phi: number; // azimuth relative to positive x (longitude) in radians
};

export type SpatialExtent = {
  min: Vector3;
  max: Vector3;
};
