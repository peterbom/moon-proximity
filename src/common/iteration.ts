export function seq(n: number): number[] {
  return Array.from(Array(n).keys());
}

export function seqStep(from: number, to: number, step: number): number[] {
  return seq(Math.floor((to - from) / step) + 1).map((n) => n * step + from);
}
