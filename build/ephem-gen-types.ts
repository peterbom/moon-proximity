import type { SeriesType } from "../src/ephemeris";

export type SeriesCopyMetadata = {
  seriesType: SeriesType;
  seriesIndex: number;
  propCount: number;
  blockStartOffset: number;
  srcCoeffCount: number;
  destCoeffCount: number;
  subintervalDuration: number;
};

export type SeriesSection = {
  offset: number;
  sizeInBytes: number;
};

export type SectionMap = Map<SeriesType, SeriesSection>;

export type SourceBlock = {
  index: number;
  startJulianDate: number;
};
