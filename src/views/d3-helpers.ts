import { clamp } from "../common/math";

export type ZoomFactors = {
  min: number;
  max: number;
  initial: number;
};

export type ZoomExtents = {
  min: number;
  max: number;
  initial: number;
};

export function getZoomFactors(dataStart: number, dataEnd: number, extents: ZoomExtents): ZoomFactors {
  const dataInterval = dataEnd - dataStart;
  const min = Math.min(dataInterval / extents.max, 1);
  const max = Math.max(dataInterval / extents.min, 1);
  const initial = clamp(dataInterval / extents.initial, min, max);
  return { min, max, initial };
}
