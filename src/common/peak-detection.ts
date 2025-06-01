import { maxByProperty, seqStep } from "./iteration";

export function getUnrefinedPeaks<TObj>(
  objects: TObj[],
  getValue: (obj: TObj) => number,
  getQuality: (obj: TObj) => number
): PeakObject<TObj>[] {
  const samples: QualitySample<TObj>[] = objects.map((obj) => ({
    obj,
    value: getValue(obj),
    quality: getQuality(obj),
  }));
  const peakRanges = getBestQualitySampleRanges(samples);
  return peakRanges.map<PeakObject<TObj>>((range) => ({
    peak: range.peak.obj,
    closestSource: range.peak.obj,
    quality: range.peak.quality,
  }));
}

export function getPeaks<TObj>(
  objects: TObj[],
  getValue: (obj: TObj) => number,
  getQuality: (obj: TObj) => number,
  createObject: (value: number) => TObj,
  valueRange: number
): PeakObject<TObj>[] {
  const samples: QualitySample<TObj>[] = objects.map((obj) => ({
    obj,
    value: getValue(obj),
    quality: getQuality(obj),
  }));
  const peakRanges = getBestQualitySampleRanges(samples);
  return peakRanges.map<PeakObject<TObj>>((range) => {
    const refinedSample = refine(range, getQuality, createObject, valueRange);
    return {
      closestSource: range.peak.obj,
      peak: refinedSample.obj,
      quality: refinedSample.quality,
    };
  });
}

export type PeakObject<TObj> = {
  peak: TObj;
  closestSource: TObj;
  quality: number;
};

type QualitySample<TObj> = {
  obj: TObj;
  value: number;
  quality: number;
};

type QualitySampleRange<TObj> = {
  lowerBound: QualitySample<TObj>;
  peak: QualitySample<TObj>;
  upperBound: QualitySample<TObj>;
};

function getBestQualitySampleRanges<TObj>(qualitySamples: QualitySample<TObj>[]): QualitySampleRange<TObj>[] {
  const sampleRanges: QualitySampleRange<TObj>[] = [];
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

function refine<TObj>(
  sampleRange: QualitySampleRange<TObj>,
  getQuality: (obj: TObj) => number,
  createObject: (value: number) => TObj,
  targetValueRange: number
): QualitySample<TObj> {
  const valueRange = sampleRange.upperBound.value - sampleRange.lowerBound.value;
  if (valueRange < targetValueRange) {
    // Reached target precision. Return the peak.
    return sampleRange.peak;
  }

  const midSamples = seqStep(1, 3, 1).map<QualitySample<TObj>>((proportion) => {
    const value = sampleRange.lowerBound.value + (proportion * valueRange) / 4;
    const obj = createObject(value);
    const quality = getQuality(obj);
    return { obj, value, quality };
  });

  const samples = [sampleRange.lowerBound, ...midSamples, sampleRange.upperBound];

  const sampleRanges = getBestQualitySampleRanges(samples);
  if (sampleRanges.length === 0) {
    throw new Error("No peak found");
  }

  if (sampleRanges.length === 1) {
    return refine(sampleRanges[0], getQuality, createObject, targetValueRange);
  }

  const refinedResults = sampleRanges.map((sampleRange) =>
    refine(sampleRange, getQuality, createObject, targetValueRange)
  );
  return maxByProperty(refinedResults, (r) => r.quality).item;
}
