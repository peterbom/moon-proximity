export function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}

export function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

export function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(Math.min(value, maxValue), minValue);
}

export function makeScale(domain: [number, number], range: [number, number]): (n: number) => number {
  const scale = (range[1] - range[0]) / (domain[1] - domain[0]);
  return (n) => (n - domain[0]) * scale + range[0];
}
