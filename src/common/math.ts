import type { SphericalCoordinate, Vector3 } from "./numeric-types";

export function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}

export function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

export function cartesianToSpherical(p: Vector3): SphericalCoordinate {
  // https://rbrundritt.wordpress.com/2008/10/14/conversion-between-spherical-and-cartesian-coordinates-systems/
  const [x, y, z] = p;
  const r = Math.sqrt(p.reduce((sum, n) => sum + n * n, 0));
  const theta = Math.asin(z / r);
  const phi = Math.atan2(y, x);
  return { r, theta, phi };
}

export function sphericalToCartesian(c: SphericalCoordinate): Vector3 {
  const cosTheta = Math.cos(c.theta);
  const cosPhi = Math.cos(c.phi);
  const sinTheta = Math.sin(c.theta);
  const sinPhi = Math.sin(c.phi);

  const x = c.r * cosTheta * cosPhi;
  const y = c.r * cosTheta * sinPhi;
  const z = c.r * sinTheta;

  return [x, y, z];
}

export function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(Math.min(value, maxValue), minValue);
}

export function makeScale(domain: [number, number], range: [number, number]): (n: number) => number {
  const scale = (range[1] - range[0]) / (domain[1] - domain[0]);
  return (n) => (n - domain[0]) * scale + range[0];
}
