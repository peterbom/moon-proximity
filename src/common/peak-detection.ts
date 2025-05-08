import { maxByProperty, seqStep } from "./iteration";

export type QualitySample = {
  value: number;
  quality: number;
};

export type QualitySampleRange = {
  lowerBound: QualitySample;
  peak: QualitySample;
  upperBound: QualitySample;
};

export function getBestQualitySampleRanges(qualitySamples: QualitySample[]): QualitySampleRange[] {
  const sampleRanges: QualitySampleRange[] = [];
  if (qualitySamples.length < 4) {
    throw new Error("Too few samples");
  }

  let sampleMinus2 = qualitySamples[0];
  let sampleMinus1 = qualitySamples[1];
  for (let i = 2; i < qualitySamples.length; i++) {
    const sample = qualitySamples[i];
    if (sampleMinus1.quality >= sampleMinus2.quality && sampleMinus1.quality >= sample.quality) {
      // There was a peak at qualityMinus1
      sampleRanges.push({
        lowerBound: sampleMinus2,
        peak: sampleMinus1,
        upperBound: sample,
      });
    }

    sampleMinus2 = sampleMinus1;
    sampleMinus1 = sample;
  }

  return sampleRanges;
}

export function refine(
  sampleRange: QualitySampleRange,
  getQuality: (value: number) => number,
  targetValueRange: number
): QualitySample {
  const valueRange = sampleRange.upperBound.value - sampleRange.lowerBound.value;
  if (valueRange < targetValueRange) {
    // Reached target precision. Return the peak.
    return sampleRange.peak;
  }

  const midSamples = seqStep(1, 3, 1).map<QualitySample>((proportion) => {
    const value = sampleRange.lowerBound.value + (proportion * valueRange) / 4;
    const quality = getQuality(value);
    return { value, quality };
  });

  const samples = [sampleRange.lowerBound, ...midSamples, sampleRange.upperBound];

  const sampleRanges = getBestQualitySampleRanges(samples);
  if (sampleRanges.length === 0) {
    throw new Error("No peak found");
  }

  if (sampleRanges.length === 1) {
    return refine(sampleRanges[0], getQuality, targetValueRange);
  }

  const refinedResults = sampleRanges.map((sampleRange) => refine(sampleRange, getQuality, targetValueRange));
  return maxByProperty(refinedResults, (r) => r.quality).item;
}
