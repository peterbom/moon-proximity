import { Ephemeris } from "../src/ephemeris";
import { asEphemerisTest, EphemerisTest, ephemerisTestItems } from "./jplde-test";

// Test indices:
const ssbIndex1 = 0;
const ssbIndex2 = 12;
const embToEarthIndex = 3;
const ssbToMoonIndex = 10;
const ssbToSunIndex = 11;
// const nutationIndex = 14;
const testableSeriesIndices = [ssbIndex1, ssbIndex2, embToEarthIndex, ssbToMoonIndex, ssbToSunIndex /*nutationIndex*/];

// From header.440
const au = 0.149597870699999988e9;

export function testDestEphemeris(ephem: Ephemeris) {
  ephemerisTestItems
    .map(asEphemerisTest)
    .filter(isTestable)
    .forEach((test) => {
      const t1 = getValue(ephem, test.target, test.jd, test.x);
      const t2 = getValue(ephem, test.center, test.jd, test.x);

      // const isNutation = test.target === nutationIndex;
      // const v = isNutation ? t1 - t2 : (t1 - t2) / au;
      const v = (t1 - t2) / au;
      const error = Math.abs(v - test.expected);

      const involvesSun = test.target === ssbToSunIndex || test.center === ssbToSunIndex;
      const maxError = involvesSun ? 1.0e-9 : 1.0e-11;

      if (error > maxError || isNaN(error)) {
        throw new Error(
          `Fail:\nTarget: ${test.target}\nCenter: ${test.center}\nX: ${test.x}\nExpected: ${test.expected}\nActual: ${v}\nDiff=${error}`
        );
      }
    });

  function isTestable(test: EphemerisTest) {
    return testableSeriesIndices.includes(test.center) && testableSeriesIndices.includes(test.target);
  }
}

function getValue(ephem: Ephemeris, series: number, jd: number, x: number) {
  if (series === ssbIndex1 || series === ssbIndex2) {
    return 0;
  }

  if (series === embToEarthIndex) {
    const ssbToEmb = ephem.getSsbToEmb(jd);
    const earthToMoon = ephem.getEarthToMoon(jd);
    const ssbToEarth = ephem.getSsbToEarth(ssbToEmb, earthToMoon);
    return [...ssbToEarth.positions, ...ssbToEarth.velocities][x - 1];
  }

  if (series === ssbToMoonIndex) {
    const ssbToEmb = ephem.getSsbToEmb(jd);
    const earthToMoon = ephem.getEarthToMoon(jd);
    const ssbToEarth = ephem.getSsbToEarth(ssbToEmb, earthToMoon);
    const ssbToMoon = ephem.getSsbToMoon(ssbToEarth, earthToMoon);
    return [...ssbToMoon.positions, ...ssbToMoon.velocities][x - 1];
  }

  if (series === ssbToSunIndex) {
    const sun = ephem.getSsbToSun(jd);
    return [...sun.positions, ...sun.velocities][x - 1];
  }

  // if (series === nutationIndex) {
  //   const nutation = ephem.getNutation(jd);
  //   return [...nutation.positions, ...nutation.velocities][x - 1];
  // }

  throw new Error(`Unexpected series: ${series}`);
}
