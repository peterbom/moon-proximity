// From header.440
const earthToMoonRatio = 0.813005682214972154e2;

export enum SeriesType {
  SsbToEmb,
  EarthToMoon,
  SsbToSun,
  // Nutation,
}

export type SeriesMetadata = {
  seriesType: SeriesType;
  offset: number;
  sizeInBytes: number;
  intervalDurationDays: number;
  propertyCount: number;
  coeffCount: number;
};

export type MetadataMap = Map<SeriesType, SeriesMetadata>;

export type EphemProperties = {
  positions: number[];
  velocities: number[];
};

export class Ephemeris {
  constructor(
    private readonly dataView: DataView,
    private readonly metadataMap: MetadataMap,
    private readonly startJulianDate: number
  ) {}

  public getSsbToSun(julianDate: number): EphemProperties {
    return this.getProperties(SeriesType.SsbToSun, julianDate);
  }

  public getSsbToEmb(julianDate: number): EphemProperties {
    return this.getProperties(SeriesType.SsbToEmb, julianDate);
  }

  public getSsbToEarth(ssbToEmb: EphemProperties, earthToMoon: EphemProperties): EphemProperties {
    const positions = [0, 0, 0];
    const velocities = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      positions[i] = ssbToEmb.positions[i] - earthToMoon.positions[i] / (1.0 + earthToMoonRatio);
      velocities[i] = ssbToEmb.velocities[i] - earthToMoon.velocities[i] / (1.0 + earthToMoonRatio);
    }

    return { positions, velocities };
  }

  public getSsbToMoon(ssbToEarth: EphemProperties, earthToMoon: EphemProperties): EphemProperties {
    const positions = [0, 0, 0];
    const velocities = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      positions[i] = ssbToEarth.positions[i] + earthToMoon.positions[i];
      velocities[i] = ssbToEarth.velocities[i] + earthToMoon.velocities[i];
    }

    return { positions, velocities };
  }

  public getEarthToMoon(julianDate: number): EphemProperties {
    return this.getProperties(SeriesType.EarthToMoon, julianDate);
  }

  private getProperties(seriesType: SeriesType, julianDate: number): EphemProperties {
    const metadata = this.getSeriesMetadata(seriesType);
    const seriesStartOffset = metadata.offset;
    const intervalIndex = Math.floor((julianDate - this.startJulianDate) / metadata.intervalDurationDays);
    const intervalStartDate = this.startJulianDate + intervalIndex * metadata.intervalDurationDays;
    const intervalStartOffset = seriesStartOffset + getIntervalSizeInBytes(metadata) * intervalIndex;
    const propertySize = metadata.coeffCount * 8;

    // Normalize time to be in the range [-1, 1] over the period covered by the interval.
    const time = ((julianDate - intervalStartDate) / metadata.intervalDurationDays) * 2 - 1;
    const positions = Array.from<number>({ length: metadata.propertyCount });
    const velocities = Array.from<number>({ length: metadata.propertyCount });

    for (let propIndex = 0; propIndex < metadata.propertyCount; propIndex++) {
      const coeffOffset = intervalStartOffset + propIndex * propertySize;
      const coeffs = readFloat64s(this.dataView, coeffOffset, metadata.coeffCount);

      const { position, velocity } = this.computePolynomial(time, coeffs);
      positions[propIndex] = position;
      velocities[propIndex] = (velocity * 2) / metadata.intervalDurationDays;
    }

    return { positions, velocities };
  }

  private computePolynomial(time: number, coefficients: number[]): { position: number; velocity: number } {
    // From https://github.com/gmiller123456/jpl-development-ephemeris/blob/master/Binary/JavaScript/jplde.js

    // Equation 14.20 from Explanetory Supplement 3 rd ed.
    const t = new Array();
    t[0] = 1.0;
    t[1] = time;

    for (let n = 2; n < coefficients.length; n++) {
      t[n] = 2 * time * t[n - 1] - t[n - 2];
    }

    // Multiply the polynomial by the coefficients.
    // Loop through coefficients backwards (from smallest to largest) to avoid floating point rounding errors
    let position = 0;
    for (let i = coefficients.length - 1; i >= 0; i--) {
      position += coefficients[i] * t[i];
    }

    // Compute velocity (just the derivitave of the above)
    const v = new Array();
    v[0] = 0.0;
    v[1] = 1.0;
    v[2] = 4.0 * time;
    for (let n = 3; n < coefficients.length; n++) {
      v[n] = 2 * time * v[n - 1] + 2 * t[n - 1] - v[n - 2];
    }

    let velocity = 0.0;
    for (let i = coefficients.length - 1; i >= 0; i--) {
      velocity += v[i] * coefficients[i];
    }

    return { position, velocity };
  }

  private getSeriesMetadata(seriesType: SeriesType): SeriesMetadata {
    const metadata = this.metadataMap.get(seriesType);
    if (!metadata) {
      throw new Error(`No series found for type ${seriesType}`);
    }

    return metadata;
  }
}

function getIntervalSizeInBytes(metadata: SeriesMetadata) {
  const valueCount = metadata.coeffCount * metadata.propertyCount;
  return 8 * valueCount; // 64-bit coefficients
}

function readFloat64s(dataView: DataView, startOffset: number, count: number) {
  const results = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    results[i] = dataView.getFloat64(startOffset + i * 8, true);
  }

  return results;
}
