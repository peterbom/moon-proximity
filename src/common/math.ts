export function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}

export function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

export function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(Math.min(value, maxValue), minValue);
}
